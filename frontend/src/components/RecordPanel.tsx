import { useEffect, useRef, useState } from 'react'
import { Loader2, Mic, Send, ShieldOff, Square, TriangleAlert } from 'lucide-react'
import { Button } from './ui/button'
import { Card } from './ui/card'
import { ANSWERABLE, REFUSED, type Example } from '../lib/examples'
import {
  MAX_DURATION_SECONDS,
  RecorderError,
  VoiceRecorder,
  prewarmCapture,
  type CapturePhase,
} from '../lib/recorder'

/** How long the go cue stays up after the microphone actually opens. Long
 *  enough to be read, short enough to be gone before anyone finishes a
 *  sentence. Nothing is lost either way: capture is already live when it
 *  appears, so the cue is telling the truth rather than gating anything. */
const CUE_MS = 1600

type Submission = { type: 'text'; value: string } | { type: 'audio'; value: Blob; filename: string }

interface RecordPanelProps {
  busy: boolean
  onSubmit: (submission: Submission) => void
}

function ExampleRow({
  title,
  hint,
  examples,
  disabled,
  onPick,
  icon,
}: {
  title: string
  hint: string
  examples: Example[]
  disabled: boolean
  onPick: (query: string) => void
  icon?: React.ReactNode
}) {
  return (
    <div>
      <div className="flex items-center gap-1.5 text-[0.8125rem] font-medium text-ink">
        {icon}
        {title}
      </div>
      <p className="mt-1 text-xs leading-relaxed text-muted">{hint}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {examples.map((example) => (
          <button
            key={example.query}
            type="button"
            disabled={disabled}
            title={example.note}
            onClick={() => onPick(example.query)}
            className="rounded-full border border-line bg-paper px-3 py-1.5 text-xs text-muted transition-all duration-200 ease-smooth hover:-translate-y-px hover:border-ink/20 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-ink disabled:pointer-events-none disabled:opacity-40"
          >
            {example.label}
          </button>
        ))}
      </div>
    </div>
  )
}

export function RecordPanel({ busy, onSubmit }: RecordPanelProps) {
  const [text, setText] = useState('')
  const [recording, setRecording] = useState(false)
  // Opening the microphone is not instant: getUserMedia has to acquire the
  // device, and the worklet module still has to load. Without a state for that
  // window the button sits there looking idle, so anyone who taps and starts
  // talking loses their first word, and a second tap starts a second recorder
  // that holds the microphone open for the life of the tab.
  const [preparing, setPreparing] = useState(false)
  const [phase, setPhase] = useState<CapturePhase>('calibrating')
  const [level, setLevel] = useState(0)
  const [secondsLeft, setSecondsLeft] = useState(MAX_DURATION_SECONDS)
  const [micError, setMicError] = useState<string | null>(null)
  // True for a moment right after the microphone goes live, to mark the one
  // instant that matters: the point where talking starts being recorded.
  const [cue, setCue] = useState(false)
  const recorderRef = useRef<VoiceRecorder | null>(null)
  const stoppingRef = useRef(false)
  const cueTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Without this, navigating away mid-recording leaves the microphone open and
  // the browser's recording indicator lit until the tab is closed.
  useEffect(() => {
    return () => {
      void recorderRef.current?.cancel()
      recorderRef.current = null
      if (cueTimerRef.current) clearTimeout(cueTimerRef.current)
    }
  }, [])

  // Build the audio graph on the first thing the visitor touches, so the only
  // thing left to wait for when they tap record is the microphone itself. It
  // has to hang off a real gesture: a context created without one starts
  // suspended and the browser logs about it. Once is enough, so the listener
  // removes itself.
  useEffect(() => {
    const warm = () => prewarmCapture()
    window.addEventListener('pointerdown', warm, { once: true, capture: true })
    window.addEventListener('keydown', warm, { once: true, capture: true })
    return () => {
      window.removeEventListener('pointerdown', warm, { capture: true })
      window.removeEventListener('keydown', warm, { capture: true })
    }
  }, [])

  useEffect(() => {
    if (!recording) return
    setSecondsLeft(MAX_DURATION_SECONDS)
    const started = Date.now()
    const timer = setInterval(() => {
      const remaining = MAX_DURATION_SECONDS - Math.floor((Date.now() - started) / 1000)
      setSecondsLeft(Math.max(0, remaining))
    }, 250)
    return () => clearInterval(timer)
  }, [recording])

  async function startRecording() {
    if (preparing || recording) return
    setMicError(null)
    setPreparing(true)
    setPhase('calibrating')
    const recorder = new VoiceRecorder()
    try {
      await recorder.start({
        onLevel: setLevel,
        onPhase: setPhase,
        onAutoStop: (reason) => {
          if (reason === 'no-speech') {
            // Nothing was said, so there is nothing to transcribe. Let go of
            // the microphone instead of uploading a clip of the room, which is
            // also what stops a noisy corner of a room from holding it open.
            void abandonRecording(
              'No speech was picked up, so the microphone was released. Try again, or type your question.',
            )
          } else {
            // `silence` is the normal ending: they stopped speaking.
            // `max-duration` is Sarvam's 30 second ceiling, where sending what
            // we have beats uploading a clip guaranteed to come back an error.
            void finishRecording()
          }
        },
      })
      recorderRef.current = recorder
      stoppingRef.current = false
      setRecording(true)
      setCue(true)
      if (cueTimerRef.current) clearTimeout(cueTimerRef.current)
      cueTimerRef.current = setTimeout(() => setCue(false), CUE_MS)
    } catch (err) {
      await recorder.cancel()
      setMicError(
        err instanceof DOMException && err.name === 'NotAllowedError'
          ? 'Microphone access was denied. Type your question instead.'
          : 'The microphone is unavailable. Type your question instead.',
      )
    } finally {
      setPreparing(false)
    }
  }

  /** Ends the recording without sending anything. */
  async function abandonRecording(message: string) {
    const recorder = recorderRef.current
    if (!recorder || stoppingRef.current) return
    stoppingRef.current = true

    setRecording(false)
    setLevel(0)
    setCue(false)
    recorderRef.current = null

    await recorder.cancel()
    setMicError(message)
  }

  async function finishRecording() {
    const recorder = recorderRef.current
    // An auto-stop and a manual tap can land together; only one should run.
    if (!recorder || stoppingRef.current) return
    stoppingRef.current = true

    setRecording(false)
    setLevel(0)
    setCue(false)
    recorderRef.current = null

    try {
      const { blob, filename } = await recorder.stop()
      onSubmit({ type: 'audio', value: blob, filename })
    } catch (err) {
      await recorder.cancel()
      setMicError(
        err instanceof RecorderError
          ? err.message
          : 'That recording could not be processed. Try again.',
      )
    }
  }

  function submitText() {
    const value = text.trim()
    if (!value || busy) return
    onSubmit({ type: 'text', value })
    setText('')
  }

  // The 30 second ceiling is Sarvam's, and with the recording ending on its own
  // it almost never comes into play. Counting down from 30 the whole time reads
  // as a deadline to talk over, so it only appears once it is close enough to
  // matter.
  const speaking = recording && phase === 'speaking'
  const status = preparing
    ? 'Getting the microphone ready'
    : !recording
      ? 'Tap to ask by voice'
      : cue
        ? 'Speak now'
        : speaking
          ? secondsLeft <= 10
            ? `Recording, ${secondsLeft}s left`
            : 'Recording'
          : 'Listening, start speaking'
  const hint = preparing
    ? 'Hold on, do not speak yet.'
    : !recording
      ? 'It stops on its own when you finish.'
      : cue
        ? 'Recording from here.'
        : speaking
          ? 'Stops when you stop, or tap to end it now.'
          : ''

  return (
    <Card title="Ask" icon={<Mic size={13} />}>
      <div className="flex flex-col items-center gap-4 rounded-[1.125rem] bg-veil px-5 py-8">
        <div className="relative flex h-16 w-16 items-center justify-center">
          {/* Two rings on opposite phases, so the pulse is continuous rather
              than a repeating pop. Shown only once the gate has actually
              detected speech, which makes it the visible answer to "is it
              hearing me" rather than decoration. */}
          {recording && (phase === 'speaking' || cue) && (
            <>
              <span
                className="absolute inset-0 animate-halo rounded-full bg-accent/45"
                aria-hidden="true"
              />
              <span
                className="absolute inset-0 animate-halo rounded-full bg-accent/45"
                style={{ animationDelay: '1.2s' }}
                aria-hidden="true"
              />
            </>
          )}
          <Button
            type="button"
            size="icon"
            variant={recording ? 'accent' : 'primary'}
            className="relative h-16 w-16"
            onClick={recording ? finishRecording : startRecording}
            disabled={busy || preparing}
            aria-label={recording ? 'Stop recording' : 'Start recording'}
          >
            {recording ? (
              <Square size={20} fill="currentColor" />
            ) : preparing ? (
              <Loader2 size={22} className="animate-spin" />
            ) : (
              <Mic size={22} />
            )}
          </Button>
        </div>

        <div className="flex min-h-9 flex-col items-center gap-1 text-center">
          <p
            // The go cue is the one line here that has to be caught out of the
            // corner of an eye, so it changes weight and colour rather than
            // just wording, and animates in so the change itself is the signal.
            className={
              cue
                ? 'animate-rise text-[0.9375rem] font-semibold text-accent-ink'
                : 'text-[0.8125rem] text-muted tabular-nums'
            }
          >
            {status}
          </p>
          <p className={cue ? 'text-[11px] text-accent-ink/70' : 'text-[11px] text-subtle'}>
            {hint}
          </p>
        </div>

        <div
          className={`h-1 w-36 overflow-hidden rounded-full bg-line ${recording ? '' : 'invisible'}`}
          role="meter"
          aria-label="Microphone input level"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(level * 100)}
          // Held in the layout rather than mounted on demand, so starting a
          // recording does not shift everything below it down by 4px.
          // visibility rather than opacity, so a screen reader is not offered a
          // meter reading zero when nothing is recording.
        >
          <div
            className="h-full rounded-full bg-accent transition-[width] duration-100"
            // Already scaled for display by the recorder, which is also where
            // the rate limiting happens.
            style={{ width: `${Math.min(100, level * 100)}%` }}
          />
        </div>

        {micError && (
          <p className="flex items-start gap-1.5 text-center text-xs leading-relaxed text-danger">
            <TriangleAlert size={14} className="mt-px shrink-0" />
            {micError}
          </p>
        )}
      </div>

      <div className="mt-5 flex items-center gap-3">
        <div className="h-px flex-1 bg-line" />
        <span className="text-[11px] tracking-[0.12em] text-subtle uppercase">or type</span>
        <div className="h-px flex-1 bg-line" />
      </div>

      <form
        className="mt-5 flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          submitText()
        }}
      >
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Ask about the corpus"
          disabled={busy}
          className="h-11 min-w-0 flex-1 rounded-full border border-line bg-paper px-4 text-sm text-ink transition-colors duration-200 outline-none placeholder:text-subtle focus:border-accent-ink/60 disabled:opacity-50"
        />
        <Button type="submit" size="icon" disabled={busy || !text.trim()} aria-label="Submit question">
          {busy ? <Loader2 size={18} className="animate-spin" /> : <Send size={17} />}
        </Button>
      </form>

      {/* The corpus is a 5,000 row sample, so most invented questions are
          genuinely not in it and come back refused, which reads as a broken
          demo rather than a careful one. These have known outcomes. */}
      <div className="mt-6 flex flex-col gap-5 border-t border-line pt-5">
        <ExampleRow
          title="Questions the corpus answers"
          hint="Each one is stated outright in a passage it retrieves."
          examples={ANSWERABLE}
          disabled={busy}
          onPick={(query) => onSubmit({ type: 'text', value: query })}
        />
        <ExampleRow
          title="Questions it refuses"
          hint="One per guardrail, and each refusal says which."
          icon={<ShieldOff size={12} className="text-subtle" />}
          examples={REFUSED}
          disabled={busy}
          onPick={(query) => onSubmit({ type: 'text', value: query })}
        />
      </div>
    </Card>
  )
}
