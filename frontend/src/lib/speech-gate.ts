/**
 * Energy based voice activity detection, driven a block of audio at a time.
 *
 * It decides three things: whether the person has started speaking, whether
 * they have finished, and whether anything was ever said at all. The recorder
 * uses the first to know when to stop trimming, the second to stop recording on
 * its own, and the third to give up rather than hold the microphone open in an
 * empty room.
 *
 * Two design choices matter more than the thresholds.
 *
 * Everything is measured in samples, never in wall clock time. A block of 1024
 * frames at 16 kHz is 64ms of audio whether it was handed over on schedule or
 * after the main thread spent 300ms doing something else, so a busy page cannot
 * make the gate think a pause was longer than it was. `performance.now()` would
 * have made silence detection a function of how loaded the browser is.
 *
 * The thresholds are relative to a measured noise floor, not absolute. A fixed
 * level is either too low to survive a room with a fan in it or too high to hear
 * someone speaking quietly, and no single value is both. The floor is estimated
 * from the quietest part of a short calibration window and then tracked while
 * nothing is being said, so the gate ends up asking whether this is louder than
 * the room, which is the question that actually distinguishes speech from noise.
 * An absolute minimum still applies underneath, because in a genuinely silent
 * room a multiple of near zero is still near zero.
 */

/** Listen to the room before judging it. Nothing in this window counts as
 *  speech, which also covers the click of the button that started the
 *  recording.
 *
 *  It is this long because of the browser, not the room. Chrome's audio
 *  processing (the noise suppressor and the automatic gain control) converges
 *  over roughly the first second of a stream, and while it does, the level
 *  swings on its own: measured on a steady noise input it ran 0.009, up to
 *  0.016, then settled at 0.0035. A rise like that, from nothing the person
 *  did, is indistinguishable from someone starting to talk, and with a shorter
 *  window it was intermittently detected as exactly that. */
const SETTLE_MS = 800

/** Ceiling on the floor estimated during settling. Someone who talks straight
 *  through that window would otherwise have their own voice measured as the
 *  noise floor, and a floor set from speech is one that makes the gate deaf for
 *  the rest of the recording. A genuinely quiet room sits far below this; a
 *  room above it falls back to the absolute thresholds and to the tracking
 *  below, both of which cope. */
const SETTLE_FLOOR_MAX = 0.02

/** Onset found within this long after settling ends is treated as someone who
 *  was already talking, so the trim keeps everything from the start rather than
 *  cutting into a word that began before the gate was listening. */
const EARLY_ONSET_GRACE_MS = 300

/** Loud for this long before it counts as speech. Long enough that a door, a
 *  keyboard or a cough does not start a recording, short enough that it is
 *  inside the pre-roll the recorder keeps anyway, so no syllable is lost. */
const ONSET_MS = 130

/** Quiet for this long after speech and the recording ends. Comfortably longer
 *  than the gaps inside a sentence, including the stop consonants that read as
 *  silence, and longer than the beat most people leave between clauses or when
 *  they stop to think mid-question. Voice assistants generally sit between 0.8
 *  and 1.2 seconds here; erring at the top of that range costs a moment of
 *  waiting and buys not cutting someone off, which is the failure people
 *  actually notice. */
const TAIL_MS = 1200

/** Give up if nobody has said anything by now. This is what stops a noisy room
 *  from holding the microphone open indefinitely. */
const NO_SPEECH_MS = 7000

/** Speech has to beat the noise floor by this much to start, and may fall to
 *  the lower multiple before it counts as stopped. The gap between the two is
 *  hysteresis: with a single threshold, anything hovering near it flickers
 *  between speaking and silent several times a second. */
const ON_MARGIN = 3.5
const OFF_MARGIN = 2.0

/** Floors under the relative thresholds, for a room quiet enough that a
 *  multiple of the noise floor is still inaudible. Roughly -40 dBFS, which sits
 *  below quiet speech and above typical room tone. */
const ABSOLUTE_ON = 0.01
const ABSOLUTE_OFF = 0.006

/** How fast the noise floor tracks the room, on blocks quiet enough to be sure
 *  they are the room and not a person.
 *
 *  Which blocks are allowed to move it matters more than the rate. Feeding it
 *  everything below the start threshold sounds right and is not: quiet parts of
 *  speech sit under that threshold, so they pull the floor up, which pulls the
 *  threshold up, which puts more of the speech underneath it. Measured on a
 *  clip of speech over a noise bed, that ran away to a floor of 0.031 against a
 *  true noise level of 0.02 and went deaf to the speaker entirely. Only blocks
 *  below the stop threshold, which speech is not, are allowed to move it. */
const FLOOR_ALPHA = 0.12

/** A room noisier than this is not one speech will be recognised in anyway, and
 *  letting the floor climb past it would make the gate deaf. */
const FLOOR_MAX = 0.06

export type CapturePhase = 'calibrating' | 'listening' | 'speaking'
export type GateStop = 'silence' | 'no-speech'

export interface GateEvent {
  phase: CapturePhase
  /** Set on the block where the recording should end. */
  stop?: GateStop
}

export class SpeechGate {
  private elapsed = 0
  private floor = Number.POSITIVE_INFINITY
  private onsetRun = 0
  private silenceRun = 0
  private started = false
  private startSample = 0
  private lastVoiceSample = 0
  private readonly sampleRate: number

  constructor(sampleRate: number) {
    this.sampleRate = sampleRate
  }

  private samples(ms: number): number {
    return (ms * this.sampleRate) / 1000
  }

  /** Feeds one block. `rms` is its root mean square, `length` its frame count. */
  push(rms: number, length: number): GateEvent {
    this.elapsed += length

    if (this.elapsed <= this.samples(SETTLE_MS)) {
      // Quietest block wins rather than an average. An average is dragged up by
      // the button click, by the browser's gain control settling, and by any
      // speech that starts early, and a noise floor estimated too high is one
      // that never hears anything again.
      this.floor = Math.min(this.floor, rms, SETTLE_FLOOR_MAX)
      return { phase: 'calibrating' }
    }

    if (!Number.isFinite(this.floor)) this.floor = rms

    const on = Math.max(this.floor * ON_MARGIN, ABSOLUTE_ON)
    const off = Math.max(this.floor * OFF_MARGIN, ABSOLUTE_OFF)

    if (!this.started) {
      if (rms >= on) {
        this.onsetRun += length
        if (this.onsetRun >= this.samples(ONSET_MS)) {
          this.started = true
          // Back-date the start to where the loud run began, not to where it
          // was confirmed, so the trim keeps the whole first word.
          this.startSample = this.elapsed - this.onsetRun
          // Speech found the moment the gate opened its eyes probably began
          // before that, during settling. Keep the clip whole rather than
          // trimming into it.
          if (this.startSample <= this.samples(SETTLE_MS + EARLY_ONSET_GRACE_MS)) {
            this.startSample = 0
          }
          this.lastVoiceSample = this.elapsed
          return { phase: 'speaking' }
        }
      } else {
        this.onsetRun = 0
        if (rms < off) {
          this.floor = Math.min(FLOOR_MAX, this.floor + (rms - this.floor) * FLOOR_ALPHA)
        }
      }

      if (this.elapsed >= this.samples(NO_SPEECH_MS)) {
        return { phase: 'listening', stop: 'no-speech' }
      }
      return { phase: 'listening' }
    }

    if (rms >= off) {
      this.silenceRun = 0
      this.lastVoiceSample = this.elapsed
    } else {
      this.silenceRun += length
      if (this.silenceRun >= this.samples(TAIL_MS)) {
        return { phase: 'speaking', stop: 'silence' }
      }
    }
    return { phase: 'speaking' }
  }

  get heardSpeech(): boolean {
    return this.started
  }

  /** Frame offset where speech began, or null if none was heard. */
  get speechStart(): number | null {
    return this.started ? this.startSample : null
  }

  /** Frame offset of the last block that still had speech in it. */
  get speechEnd(): number | null {
    return this.started ? this.lastVoiceSample : null
  }

  /** Current noise floor estimate, for diagnostics. */
  get noiseFloor(): number {
    return Number.isFinite(this.floor) ? this.floor : 0
  }
}
