import { useEffect, useRef, useState } from 'react'
import { Mic, Square, Send, Loader2, TriangleAlert } from 'lucide-react'
import { Button } from './ui/button'
import { Card } from './ui/card'
import { MAX_DURATION_SECONDS, RecorderError, VoiceRecorder } from '../lib/recorder'

type Submission = { type: 'text'; value: string } | { type: 'audio'; value: Blob; filename: string }

interface RecordPanelProps {
  busy: boolean
  onSubmit: (submission: Submission) => void
}

export function RecordPanel({ busy, onSubmit }: RecordPanelProps) {
  const [text, setText] = useState('')
  const [recording, setRecording] = useState(false)
  const [level, setLevel] = useState(0)
  const [secondsLeft, setSecondsLeft] = useState(MAX_DURATION_SECONDS)
  const [micError, setMicError] = useState<string | null>(null)
  const recorderRef = useRef<VoiceRecorder | null>(null)
  const stoppingRef = useRef(false)

  // Without this, navigating away mid-recording leaves the microphone open and
  // the browser's recording indicator lit until the tab is closed.
  useEffect(() => {
    return () => {
      void recorderRef.current?.cancel()
      recorderRef.current = null
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
    setMicError(null)
    const recorder = new VoiceRecorder()
    try {
      await recorder.start({
        onLevel: setLevel,
        // Sarvam's sync endpoint rejects anything past 30 seconds, so stop at
        // the ceiling and send what we have rather than uploading a clip that
        // is guaranteed to come back as an error.
        onMaxDuration: () => void finishRecording(),
      })
      recorderRef.current = recorder
      stoppingRef.current = false
      setRecording(true)
    } catch (err) {
      await recorder.cancel()
      setMicError(
        err instanceof DOMException && err.name === 'NotAllowedError'
          ? 'Microphone access was denied. Type your question instead.'
          : 'The microphone is unavailable. Type your question instead.',
      )
    }
  }

  async function finishRecording() {
    const recorder = recorderRef.current
    // onMaxDuration and a manual tap can land together; only one should run.
    if (!recorder || stoppingRef.current) return
    stoppingRef.current = true

    setRecording(false)
    setLevel(0)
    recorderRef.current = null

    try {
      const { blob, filename } = await recorder.stop()
      onSubmit({ type: 'audio', value: blob, filename })
    } catch (err) {
      await recorder.cancel()
      setMicError(
        err instanceof RecorderError ? err.message : 'That recording could not be processed. Try again.',
      )
    }
  }

  function submitText() {
    const value = text.trim()
    if (!value || busy) return
    onSubmit({ type: 'text', value })
    setText('')
  }

  return (
    <Card title="Ask">
      <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-line bg-paper/60 py-6">
        <Button
          type="button"
          size="icon"
          variant={recording ? 'accent' : 'primary'}
          className="h-16 w-16"
          onClick={recording ? finishRecording : startRecording}
          disabled={busy}
          aria-label={recording ? 'Stop recording' : 'Start recording'}
        >
          {recording ? <Square size={22} fill="currentColor" /> : <Mic size={22} />}
        </Button>

        <p className="text-xs text-muted">
          {recording ? `Recording, tap to stop (${secondsLeft}s left)` : 'Tap to ask by voice'}
        </p>

        {recording && (
          <div
            className="h-1.5 w-32 overflow-hidden rounded-full bg-line"
            role="meter"
            aria-label="Microphone input level"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(level * 100)}
          >
            <div
              className="h-full rounded-full bg-accent transition-[width] duration-75"
              // Speech peaks well below 1.0, so scale up to make the meter
              // actually move at normal speaking volume.
              style={{ width: `${Math.min(100, level * 220)}%` }}
            />
          </div>
        )}

        {micError && (
          <p className="flex items-center gap-1.5 px-4 text-center text-xs text-danger">
            <TriangleAlert size={14} className="shrink-0" />
            {micError}
          </p>
        )}
      </div>

      <div className="mt-4 flex items-center gap-2">
        <div className="h-px flex-1 bg-line" />
        <span className="text-xs text-muted">or type</span>
        <div className="h-px flex-1 bg-line" />
      </div>

      <form
        className="mt-4 flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          submitText()
        }}
      >
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Ask a question about the corpus"
          disabled={busy}
          className="h-11 flex-1 rounded-full border border-line bg-paper px-4 text-sm text-ink outline-none placeholder:text-muted focus:border-accent disabled:opacity-50"
        />
        <Button type="submit" size="icon" disabled={busy || !text.trim()} aria-label="Submit question">
          {busy ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
        </Button>
      </form>
    </Card>
  )
}
