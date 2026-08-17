/**
 * Microphone capture that produces 16 kHz mono 16-bit PCM WAV, and stops on its
 * own when the person has finished speaking.
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
 *
 * Audio is collected in the worklet into blocks of about 64ms and handed over
 * one block at a time, rather than one render quantum at a time. A quantum is
 * 128 frames, so the untouched rate is 125 messages a second, each one waking
 * the main thread; at 64ms it is 16, and the block is also the unit the voice
 * activity gate works in. `SpeechGate` decides when speech starts and stops,
 * and everything it measures is counted in samples, so a busy main thread
 * cannot distort it.
 */

import { SpeechGate, type CapturePhase, type GateStop } from './speech-gate'

export type { CapturePhase }

export const TARGET_SAMPLE_RATE = 16000

/** Sarvam's synchronous endpoint accepts up to 30 seconds of audio. */
export const MAX_DURATION_SECONDS = 30

/** Below this peak amplitude the clip is silence and not worth uploading. */
const SILENCE_PEAK_THRESHOLD = 0.01

/** Shorter than this and the user almost certainly mis-tapped. */
const MIN_DURATION_SECONDS = 0.4

/** Kept either side of the detected speech when trimming. Generous on purpose:
 *  the point of trimming is to spare the recogniser several seconds of room
 *  tone, not to shave the clip as close as possible, and the cost of being
 *  wrong is a clipped word. */
const PRE_ROLL_MS = 400
const POST_ROLL_MS = 350

/** A render quantum, fixed by the Web Audio spec. */
const RENDER_QUANTUM = 128

/** Roughly how much audio each block holds. Small enough that the level meter
 *  and the gate stay responsive, large enough to keep messaging cheap. */
const BLOCK_MS = 64

export interface Recording {
  blob: Blob
  filename: string
  durationSeconds: number
}

export class RecorderError extends Error {}

/** Why capture ended without the user tapping stop. */
export type AutoStopReason = GateStop | 'max-duration'

const WORKLET_SOURCE = `
class CaptureProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super()
    const size = (options && options.processorOptions && options.processorOptions.blockSize) || 1024
    this.size = size
    this.buffer = new Float32Array(size)
    this.filled = 0
    // The main thread asks for a flush when the recording stops. Port messages
    // are delivered in order, so once the reply lands, every block posted
    // before it has already been handed over.
    this.port.onmessage = (event) => {
      if (event.data === 'flush') {
        this.emit()
        this.port.postMessage({ type: 'flushed' })
      }
    }
  }

  emit() {
    if (!this.filled) return
    const samples = this.buffer.slice(0, this.filled)
    let sum = 0
    for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i]
    this.filled = 0
    // Transferred rather than copied: the block is no use here once it is sent.
    this.port.postMessage(
      { type: 'block', samples, rms: Math.sqrt(sum / samples.length) },
      [samples.buffer],
    )
  }

  process(inputs) {
    const channel = inputs[0] && inputs[0][0]
    if (!channel || !channel.length) return true
    for (let i = 0; i < channel.length; i++) {
      this.buffer[this.filled++] = channel[i]
      if (this.filled === this.size) this.emit()
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

/** Blocks are whole render quanta, so they line up with what the worklet is
 *  handed and no partial quantum is ever left sitting in the buffer. */
function blockSizeFor(sampleRate: number): number {
  const quanta = Math.max(1, Math.round((sampleRate * BLOCK_MS) / 1000 / RENDER_QUANTUM))
  return quanta * RENDER_QUANTUM
}

interface StartOptions {
  /** Fires with a 0-1 loudness value, once per block, so the UI can show the
   *  microphone is live. RMS over the block rather than the sample peak: a
   *  single transient pins a peak meter at full scale, and it then reads the
   *  same for a whisper as for a shout. */
  onLevel?: (level: number) => void
  /** Fires when the gate moves between waiting for speech and hearing it. */
  onPhase?: (phase: CapturePhase) => void
  /** Fires when capture ends without the user asking it to. `silence` means
   *  they finished speaking, `no-speech` that nothing was ever said, and
   *  `max-duration` that the Sarvam ceiling was reached. The recorder is still
   *  live at this point; the caller decides whether to stop or cancel. */
  onAutoStop?: (reason: AutoStopReason) => void
}

/** Opens the capture context at the target rate when the browser allows it.
 *
 *  Chrome and Firefox honour the request and resample the microphone into it,
 *  which is better than anything this file could do. Safari does not always:
 *  depending on version it either hands back the hardware rate or throws
 *  NotSupportedError outright. Throwing used to take the whole recording down
 *  and surface as "the microphone is unavailable" when the microphone was
 *  fine, so fall back to a default context and let `downsample` convert.
 */
function openContext(): AudioContext {
  const Ctor: typeof AudioContext =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
  try {
    return new Ctor({ sampleRate: TARGET_SAMPLE_RATE })
  } catch {
    return new Ctor()
  }
}

/**
 * One audio context for the page, with the capture worklet compiled into it
 * once.
 *
 * Opening a context means opening an audio device, and `addModule` has to
 * fetch and compile the processor before a single sample can be captured.
 * Doing both on every recording put all of it between the tap and the
 * microphone going live, which is time the person is already talking into.
 * Neither depends on the microphone, so neither has to be in that window: the
 * context is built once, kept, and suspended between recordings rather than
 * closed.
 *
 * The promise is the lock. Prewarming and starting a recording can race, and
 * two contexts would mean the second recording compiling the worklet again.
 */
let contextReady: Promise<AudioContext> | null = null

function prepareContext(): Promise<AudioContext> {
  if (!contextReady) {
    contextReady = (async () => {
      const context = openContext()
      if (context.audioWorklet) {
        const url = URL.createObjectURL(
          new Blob([WORKLET_SOURCE], { type: 'application/javascript' }),
        )
        try {
          await context.audioWorklet.addModule(url)
        } finally {
          URL.revokeObjectURL(url)
        }
      }
      return context
    })().catch((error) => {
      // Leave nothing cached behind a failure, or every later recording
      // inherits it.
      contextReady = null
      throw error
    })
  }
  return contextReady
}

/**
 * Builds the audio graph before it is needed, so tapping record only has to
 * wait for the microphone itself.
 *
 * Safe to call more than once and safe to ignore: it is an optimisation, and a
 * recording that arrives before it finishes simply waits on the same promise.
 * Call it from a user gesture. A context created without one is allowed, but it
 * starts suspended and browsers log a warning about it.
 */
export function prewarmCapture(): void {
  void prepareContext().catch(() => undefined)
}

export class VoiceRecorder {
  private stream: MediaStream | null = null
  private context: AudioContext | null = null
  private node: AudioWorkletNode | ScriptProcessorNode | null = null
  private source: MediaStreamAudioSourceNode | null = null
  private sink: GainNode | null = null
  private chunks: Float32Array[] = []
  private frames = 0
  private capturing = false
  private gate: SpeechGate | null = null
  private maxDurationTimer: ReturnType<typeof setTimeout> | null = null

  get isRecording(): boolean {
    return this.capturing
  }

  /** What the gate has settled on, for the caller's own diagnostics. */
  get heardSpeech(): boolean {
    return this.gate?.heardSpeech ?? false
  }

  async start({ onLevel, onPhase, onAutoStop }: StartOptions = {}): Promise<void> {
    // Started before the microphone request rather than after it, so the two
    // overlap. Prewarming usually means this is already settled, but on the
    // path where it is not, the context builds while the browser is still
    // acquiring the device instead of afterwards.
    const contextPromise = prepareContext()

    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    })

    let context = await contextPromise
    // A context can be closed out from under the page, by the browser under
    // memory pressure or by a stray call. Build a fresh one rather than trying
    // to record into it.
    if (context.state === 'closed') {
      contextReady = null
      context = await prepareContext()
    }
    this.context = context
    if (context.state === 'suspended') await context.resume()

    this.source = this.context.createMediaStreamSource(this.stream)
    this.chunks = []
    this.frames = 0
    this.gate = new SpeechGate(this.context.sampleRate)

    let phase: CapturePhase | null = null
    let stopped = false

    const consume = (samples: Float32Array, rms: number) => {
      if (!this.capturing) return
      this.chunks.push(samples)
      this.frames += samples.length

      onLevel?.(Math.min(1, rms * 5))

      const event = this.gate!.push(rms, samples.length)
      if (event.phase !== phase) {
        phase = event.phase
        onPhase?.(event.phase)
      }
      // One auto-stop per recording. The gate keeps reporting the condition on
      // every block after it first trips, and firing repeatedly would submit
      // the same clip several times.
      if (event.stop && !stopped) {
        stopped = true
        onAutoStop?.(event.stop)
      }
    }

    const blockSize = blockSizeFor(this.context.sampleRate)

    if (this.context.audioWorklet) {
      // Already compiled into this context by prepareContext.
      const worklet = new AudioWorkletNode(this.context, 'capture-processor', {
        processorOptions: { blockSize },
      })
      worklet.port.onmessage = (event) => {
        const data = event.data as { type: string; samples?: Float32Array; rms?: number }
        if (data.type === 'block' && data.samples) consume(data.samples, data.rms ?? 0)
      }
      this.node = worklet
    } else {
      // Pre-AudioWorklet Safari. Deprecated, runs on the main thread, but it is
      // the only PCM tap those versions expose. Its own buffer size is already
      // block sized, so it feeds the gate directly.
      const processor = this.context.createScriptProcessor(4096, 1, 1)
      processor.onaudioprocess = (event) => {
        const samples = new Float32Array(event.inputBuffer.getChannelData(0))
        let sum = 0
        for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i]
        consume(samples, Math.sqrt(sum / samples.length))
      }
      this.node = processor
    }

    // A node only runs while it is part of a graph that reaches the
    // destination. Neither node writes to its output, so nothing is played
    // back, but route through a muted gain anyway so a future change here
    // cannot turn into mic feedback through the speakers.
    // Held on the instance so teardown can disconnect it. The context outlives
    // the recording now, so nothing else is going to collect it, and one
    // orphaned gain node per recording would stay wired to the destination for
    // the life of the page.
    this.sink = this.context.createGain()
    this.sink.gain.value = 0
    this.source.connect(this.node)
    this.node.connect(this.sink)
    this.sink.connect(this.context.destination)

    this.capturing = true
    this.maxDurationTimer = setTimeout(() => {
      if (this.capturing && !stopped) {
        stopped = true
        onAutoStop?.('max-duration')
      }
    }, MAX_DURATION_SECONDS * 1000)
  }

  /** Waits for blocks that are posted but not yet delivered.
   *
   *  Capture runs on the audio thread and hands blocks over by postMessage, so
   *  at the moment the recording stops there is always a queue of them sitting
   *  in the main thread's task queue, plus a partial block still filling in the
   *  worklet. Tearing down immediately drops both, which clips the end of what
   *  was said, and the busier the main thread the more of it goes. Ask the
   *  worklet to flush and wait for its reply: port messages are ordered, so
   *  everything queued ahead of the reply has been delivered by the time it
   *  arrives.
   */
  private async drain(): Promise<void> {
    const node = this.node
    const port = node && 'port' in node ? node.port : null
    if (!port) {
      // ScriptProcessor has no port. Its callback already runs on this thread,
      // so yielding once is enough to let a pending one through.
      await new Promise((resolve) => setTimeout(resolve, 0))
      return
    }

    await new Promise<void>((resolve) => {
      const previous = port.onmessage
      let timer: ReturnType<typeof setTimeout>

      const finish = () => {
        clearTimeout(timer)
        port.onmessage = previous
        resolve()
      }

      // Never let a wedged worklet hold the UI. Anything still outstanding
      // after this is a few milliseconds of audio, not a recording.
      timer = setTimeout(finish, 250)

      port.onmessage = (event) => {
        if ((event.data as { type?: string })?.type === 'flushed') finish()
        else previous?.call(port, event)
      }
      port.postMessage('flush')
    })
  }

  /** Stops capture and encodes what was captured. Throws if it was unusable. */
  async stop(): Promise<Recording> {
    if (!this.context) throw new RecorderError('Recording was not started.')

    await this.drain()

    const sampleRate = this.context.sampleRate
    const chunks = this.chunks
    const frames = this.frames
    const gate = this.gate
    await this.teardown()

    const merged = new Float32Array(frames)
    let offset = 0
    for (const chunk of chunks) {
      merged.set(chunk, offset)
      offset += chunk.length
    }

    // Trim to what was actually said, with room either side. Several seconds of
    // room tone in front of a question is not free: it is upload time, and it
    // is more of the clip for the recogniser to find words in. Only ever done
    // when the gate is sure it heard something, so a miss leaves the clip whole
    // rather than emptying it.
    const perMs = sampleRate / 1000
    const from =
      gate?.speechStart != null ? Math.max(0, Math.floor(gate.speechStart - PRE_ROLL_MS * perMs)) : 0
    const to =
      gate?.speechEnd != null
        ? Math.min(frames, Math.ceil(gate.speechEnd + POST_ROLL_MS * perMs))
        : frames
    const spoken = to > from ? merged.subarray(from, to) : merged

    const samples = downsample(spoken, sampleRate, TARGET_SAMPLE_RATE)
    const durationSeconds = samples.length / TARGET_SAMPLE_RATE

    if (durationSeconds < MIN_DURATION_SECONDS) {
      throw new RecorderError(
        'That recording was too short. Tap once to start, speak, then tap again to stop.',
      )
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
    this.sink?.disconnect()
    this.sink = null
    // Stopping every track is what actually turns off the browser's recording
    // indicator. Leaving them live is how a tab ends up holding the mic open
    // after the user thinks they are done. The context is a different matter:
    // it holds no microphone, so keeping it costs nothing anyone can see, and
    // rebuilding it is exactly the delay this is trying to avoid. Suspend it so
    // it is not running an empty graph, and leave it for the next recording.
    this.stream?.getTracks().forEach((track) => track.stop())
    this.stream = null
    if (this.context) {
      await this.context.suspend().catch(() => undefined)
      this.context = null
    }
  }
}
