/**
 * Microphone capture that produces 16 kHz mono 16-bit PCM WAV.
 *
 * This deliberately does not use MediaRecorder. MediaRecorder gives you
 * WebM/Opus on Chrome and Firefox and MP4/AAC on Safari, and the WebM it
 * produces is a live-stream container: its header carries an unknown duration,
 * because the recorder does not know how long the recording will be until it
 * ends and it never goes back to patch the header. Plenty of decoders cope with
 * that, some truncate at the first cluster, and which one a speech API happens
 * to use is not something this app should be betting on.
 *
 * Capturing raw PCM through the Web Audio API and writing the WAV container
 * ourselves removes the guesswork: WAV is a fixed-size format with the real
 * length in the header, and 16 kHz mono 16-bit is the exact format Sarvam
 * documents as best-accuracy for its speech-to-text endpoint. It also makes
 * every browser send byte-identical audio instead of three different codecs.
 */

export const TARGET_SAMPLE_RATE = 16000

/** Sarvam's synchronous endpoint accepts up to 30 seconds of audio. */
export const MAX_DURATION_SECONDS = 30

/** Below this peak amplitude the clip is silence and not worth uploading. */
const SILENCE_PEAK_THRESHOLD = 0.01

/** Shorter than this and the user almost certainly mis-tapped. */
const MIN_DURATION_SECONDS = 0.4

export interface Recording {
  blob: Blob
  filename: string
  durationSeconds: number
}

export class RecorderError extends Error {}

const WORKLET_SOURCE = `
class CaptureProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const channel = inputs[0] && inputs[0][0]
    if (channel && channel.length) {
      // The render quantum buffer is reused between calls, so post a copy.
      this.port.postMessage(new Float32Array(channel))
    }
    return true
  }
}
registerProcessor('capture-processor', CaptureProcessor)
`

/**
 * Box-filter downsample. Averaging every input sample that falls inside an
 * output sample's window is a crude low-pass, but it is a low-pass: decimating
 * by picking every Nth sample instead would alias anything above the new
 * Nyquist straight back down into the speech band. Only used when the browser
 * refuses to open the capture context at the target rate, since when it does
 * accept 16 kHz its own resampler is better than this one.
 */
function downsample(input: Float32Array, fromRate: number, toRate: number): Float32Array {
  if (fromRate === toRate) return input
  const ratio = fromRate / toRate
  const output = new Float32Array(Math.floor(input.length / ratio))
  for (let i = 0; i < output.length; i++) {
    const start = Math.floor(i * ratio)
    const end = Math.min(Math.floor((i + 1) * ratio), input.length)
    let sum = 0
    for (let j = start; j < end; j++) sum += input[j]
    output[i] = end > start ? sum / (end - start) : 0
  }
  return output
}

function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  const buffer = new ArrayBuffer(44 + samples.length * 2)
  const view = new DataView(buffer)

  const writeAscii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i))
  }

  writeAscii(0, 'RIFF')
  view.setUint32(4, 36 + samples.length * 2, true)
  writeAscii(8, 'WAVE')
  writeAscii(12, 'fmt ')
  view.setUint32(16, 16, true) // PCM fmt chunk size
  view.setUint16(20, 1, true) // format 1 = uncompressed PCM
  view.setUint16(22, 1, true) // mono
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true) // byte rate
  view.setUint16(32, 2, true) // block align
  view.setUint16(34, 16, true) // bits per sample
  writeAscii(36, 'data')
  view.setUint32(40, samples.length * 2, true)

  let offset = 44
  for (let i = 0; i < samples.length; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]))
    view.setInt16(offset, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true)
    offset += 2
  }

  return new Blob([buffer], { type: 'audio/wav' })
}

interface StartOptions {
  /** Fires with a 0-1 loudness value so the UI can show the mic is live. */
  onLevel?: (level: number) => void
  /** Fires once the 30 second ceiling is reached and capture has auto-stopped. */
  onMaxDuration?: () => void
}

export class VoiceRecorder {
  private stream: MediaStream | null = null
  private context: AudioContext | null = null
  private node: AudioWorkletNode | ScriptProcessorNode | null = null
  private source: MediaStreamAudioSourceNode | null = null
  private chunks: Float32Array[] = []
  private frames = 0
  private capturing = false
  private maxDurationTimer: ReturnType<typeof setTimeout> | null = null

  get isRecording(): boolean {
    return this.capturing
  }

  async start({ onLevel, onMaxDuration }: StartOptions = {}): Promise<void> {
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    })

    // Ask for the capture context at the target rate directly. When the browser
    // honours it, its own resampler does the rate conversion and `downsample`
    // below never runs. Safari in particular tends to ignore this and hand back
    // the hardware rate, which is why the fallback exists.
    const AudioContextCtor: typeof AudioContext =
      window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    this.context = new AudioContextCtor({ sampleRate: TARGET_SAMPLE_RATE })
    if (this.context.state === 'suspended') await this.context.resume()

    this.source = this.context.createMediaStreamSource(this.stream)
    this.chunks = []
    this.frames = 0

    const consume = (frame: Float32Array) => {
      if (!this.capturing) return
      this.chunks.push(frame)
      this.frames += frame.length
      if (onLevel) {
        let peak = 0
        for (let i = 0; i < frame.length; i++) {
          const value = Math.abs(frame[i])
          if (value > peak) peak = value
        }
        onLevel(Math.min(1, peak))
      }
    }

    if (this.context.audioWorklet) {
      const url = URL.createObjectURL(new Blob([WORKLET_SOURCE], { type: 'application/javascript' }))
      try {
        await this.context.audioWorklet.addModule(url)
      } finally {
        URL.revokeObjectURL(url)
      }
      const worklet = new AudioWorkletNode(this.context, 'capture-processor')
      worklet.port.onmessage = (event) => consume(event.data as Float32Array)
      this.node = worklet
    } else {
      // Pre-AudioWorklet Safari. Deprecated, runs on the main thread, but it is
      // the only PCM tap those versions expose.
      const processor = this.context.createScriptProcessor(4096, 1, 1)
      processor.onaudioprocess = (event) => consume(new Float32Array(event.inputBuffer.getChannelData(0)))
      this.node = processor
    }

    // A node only runs while it is part of a graph that reaches the
    // destination. Neither node writes to its output, so nothing is played
    // back, but route through a muted gain anyway so a future change here
    // cannot turn into mic feedback through the speakers.
    const silence = this.context.createGain()
    silence.gain.value = 0
    this.source.connect(this.node)
    this.node.connect(silence)
    silence.connect(this.context.destination)

    this.capturing = true
    this.maxDurationTimer = setTimeout(() => {
      if (this.capturing) onMaxDuration?.()
    }, MAX_DURATION_SECONDS * 1000)
  }

  /** Stops capture and encodes what was captured. Throws if it was unusable. */
  async stop(): Promise<Recording> {
    if (!this.context) throw new RecorderError('Recording was not started.')

    const sampleRate = this.context.sampleRate
    const chunks = this.chunks
    const frames = this.frames
    await this.teardown()

    const merged = new Float32Array(frames)
    let offset = 0
    for (const chunk of chunks) {
      merged.set(chunk, offset)
      offset += chunk.length
    }

    const samples = downsample(merged, sampleRate, TARGET_SAMPLE_RATE)
    const durationSeconds = samples.length / TARGET_SAMPLE_RATE

    if (durationSeconds < MIN_DURATION_SECONDS) {
      throw new RecorderError('That recording was too short. Hold the button while you speak.')
    }

    let peak = 0
    for (let i = 0; i < samples.length; i++) {
      const value = Math.abs(samples[i])
      if (value > peak) peak = value
    }
    if (peak < SILENCE_PEAK_THRESHOLD) {
      throw new RecorderError('No sound was picked up. Check that the right microphone is selected.')
    }

    return {
      blob: encodeWav(samples, TARGET_SAMPLE_RATE),
      filename: 'recording.wav',
      durationSeconds,
    }
  }

  /** Releases the microphone without producing a recording. */
  async cancel(): Promise<void> {
    await this.teardown()
    this.chunks = []
    this.frames = 0
  }

  private async teardown(): Promise<void> {
    this.capturing = false
    if (this.maxDurationTimer) {
      clearTimeout(this.maxDurationTimer)
      this.maxDurationTimer = null
    }
    if (this.node) {
      this.node.disconnect()
      if ('port' in this.node) this.node.port.onmessage = null
      else this.node.onaudioprocess = null
      this.node = null
    }
    this.source?.disconnect()
    this.source = null
    // Stopping every track is what actually turns off the browser's recording
    // indicator. Leaving them live is how a tab ends up holding the mic open
    // after the user thinks they are done.
    this.stream?.getTracks().forEach((track) => track.stop())
    this.stream = null
    if (this.context) {
      await this.context.close().catch(() => undefined)
      this.context = null
    }
  }
}
