import { useEffect, useState } from 'react'
import { TriangleAlert } from 'lucide-react'
import { Header } from './components/Header'
import { TargetStrip } from './components/TargetStrip'
import { RecordPanel } from './components/RecordPanel'
import { AnswerPanel } from './components/AnswerPanel'
import { SourcesPanel } from './components/SourcesPanel'
import { LatencyPanel } from './components/LatencyPanel'
import { PipelineFooter } from './components/PipelineFooter'
import { fetchMeta, runQuery, runAudio, type Meta, type PipelineResult } from './lib/api'

type Submission = { type: 'text'; value: string } | { type: 'audio'; value: Blob; filename: string }

function App() {
  const [result, setResult] = useState<PipelineResult | null>(null)
  const [meta, setMeta] = useState<Meta | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // What the system is actually running, and the measured figures behind the
  // 200ms claim. A failure here is not worth an error banner: every panel falls
  // back to sensible defaults without it.
  useEffect(() => {
    let cancelled = false
    fetchMeta()
      .then((value) => {
        if (!cancelled) setMeta(value)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [])

  async function handleSubmit(submission: Submission) {
    setBusy(true)
    setError(null)
    try {
      const next =
        submission.type === 'text'
          ? await runQuery(submission.value)
          : await runAudio(submission.value, submission.filename)
      setResult(next)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong reaching Groundline.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-svh bg-paper">
      <Header meta={meta} />
      <main className="mx-auto w-full max-w-[1600px] px-4 py-6 md:px-8 md:py-8">
        <TargetStrip meta={meta} />

        {error && (
          <div className="mb-6 flex items-center gap-2 rounded-xl bg-danger/8 px-4 py-3 text-sm text-danger">
            <TriangleAlert size={16} className="shrink-0" />
            {error}
          </div>
        )}

        {/* Flat grid with explicit placement rather than a nested left column,
            so the reading order can differ per width. On a phone the answer has
            to come straight after the question; from 640px up the ask and
            latency cards pair off side by side and the answer moves below
            them; from 1024px it is the three column layout. */}
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-[360px_1fr_360px]">
          <div className="order-1 lg:col-start-1 lg:row-start-1 lg:self-start">
            <RecordPanel busy={busy} onSubmit={handleSubmit} />
          </div>
          <div className="order-2 sm:order-3 sm:col-span-2 lg:order-2 lg:col-span-1 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:self-start">
            <AnswerPanel result={result} busy={busy} />
          </div>
          <div className="order-3 sm:order-4 sm:col-span-2 lg:col-span-1 lg:col-start-3 lg:row-span-2 lg:row-start-1 lg:self-start">
            <SourcesPanel result={result} />
          </div>
          <div className="order-4 sm:order-2 lg:col-start-1 lg:row-start-2 lg:self-start">
            <LatencyPanel result={result} meta={meta} />
          </div>
        </div>

        <PipelineFooter meta={meta} />
      </main>
    </div>
  )
}

export default App
