import { useEffect, useState } from 'react'
import { TriangleAlert } from 'lucide-react'
import { Nav } from './components/Nav'
import { Hero } from './components/Hero'
import { Section, SectionHeading } from './components/Section'
import { RecordPanel } from './components/RecordPanel'
import { AnswerPanel } from './components/AnswerPanel'
import { SourcesPanel } from './components/SourcesPanel'
import { LatencyPanel } from './components/LatencyPanel'
import { MetricsBand } from './components/MetricsBand'
import { PipelineSection } from './components/PipelineSection'
import { SiteFooter } from './components/SiteFooter'
import { delay } from './lib/motion'
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
    // Drop the previous result rather than leaving it on screen. Only the
    // answer panel has a loading state, so keeping it meant the sources and
    // the timings for the last question sat there looking like they belonged
    // to the one being asked. On an app whose whole claim is that an answer is
    // traceable to the passages beside it, that is the worst thing to get
    // wrong.
    setResult(null)
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
      <Nav meta={meta} />

      <main>
        <Hero meta={meta} />

        <Section id="ask" tone="veil" className="border-t border-line">
          <div className="py-20 md:py-24">
            <SectionHeading eyebrow="Try it" title="Ask, and watch what it does with the question.">
              <p>
                Four panels, all filled by the same request: what you asked, what came back, the
                passages it came from, and where the time went. Nothing here is a mock.
              </p>
            </SectionHeading>

            {error && (
              <div className="mt-8 flex max-w-[70ch] items-start gap-2.5 rounded-[1.125rem] bg-danger/6 px-4 py-3.5 text-sm leading-relaxed text-danger">
                <TriangleAlert size={16} className="mt-0.5 shrink-0" />
                {error}
              </div>
            )}

            {/* One flat grid with explicit ordering rather than nested columns,
                so the reading order can change with the width. On a phone the
                answer has to come straight after the question. From 768px the
                ask and latency panels pair off and the answer moves below them.
                From 1280px it is three columns with the source rail beneath,
                running the full width of the page. */}
            <div className="mt-10 grid grid-cols-1 items-start gap-4 md:grid-cols-2 xl:grid-cols-[minmax(18rem,22%)_minmax(0,1fr)_minmax(18rem,24%)]">
              <div className="md:order-1 xl:order-1" data-reveal>
                <RecordPanel busy={busy} onSubmit={handleSubmit} />
              </div>
              <div
                className="md:order-3 md:col-span-2 xl:order-2 xl:col-span-1"
                data-reveal
                style={delay(80)}
              >
                <AnswerPanel result={result} busy={busy} />
              </div>
              <div
                className="md:order-4 md:col-span-2 xl:order-4 xl:col-span-3"
                data-reveal
                style={delay(240)}
              >
                <SourcesPanel result={result} />
              </div>
              <div className="md:order-2 xl:order-3" data-reveal style={delay(160)}>
                <LatencyPanel result={result} meta={meta} />
              </div>
            </div>
          </div>
        </Section>

        <MetricsBand meta={meta} />
        <PipelineSection meta={meta} />
      </main>

      <SiteFooter meta={meta} />
    </div>
  )
}

export default App
