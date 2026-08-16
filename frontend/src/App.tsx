import { useState } from 'react'
import { TriangleAlert } from 'lucide-react'
import { Header } from './components/Header'
import { RecordPanel } from './components/RecordPanel'
import { AnswerPanel } from './components/AnswerPanel'
import { SourcesPanel } from './components/SourcesPanel'
import { LatencyPanel } from './components/LatencyPanel'
import { runQuery, runAudio, type PipelineResult } from './lib/api'

type Submission = { type: 'text'; value: string } | { type: 'audio'; value: Blob; filename: string }

function App() {
  const [result, setResult] = useState<PipelineResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
      <Header />
      <main className="mx-auto w-full max-w-[1600px] px-4 py-8 md:px-8">
        {error && (
          <div className="mb-6 flex items-center gap-2 rounded-xl bg-danger/8 px-4 py-3 text-sm text-danger">
            <TriangleAlert size={16} className="shrink-0" />
            {error}
          </div>
        )}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[360px_1fr_360px]">
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:flex lg:flex-col">
            <RecordPanel busy={busy} onSubmit={handleSubmit} />
            <LatencyPanel result={result} />
          </div>
          <AnswerPanel result={result} busy={busy} />
          <SourcesPanel result={result} />
        </div>
      </main>
    </div>
  )
}

export default App
