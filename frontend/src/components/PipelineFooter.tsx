import { Cloud, Cpu } from 'lucide-react'
import type { Meta } from '../lib/api'

/** The path a question takes, with the boundary drawn where it matters.
 *
 *  A reviewer reading "under 200ms" should be able to see at a glance which of
 *  these steps that covers, without taking the claim on trust. Local steps are
 *  the ones inside the target; the two network steps are marked as such.
 */
const STEPS: { name: string; detail: string; network?: boolean }[] = [
  { name: 'Speech to text', detail: '16kHz mono WAV, Sarvam', network: true },
  { name: 'Safety check', detail: 'unsafe patterns, pre-retrieval' },
  { name: 'Hybrid retrieval', detail: 'FAISS dense plus BM25, weighted RRF' },
  { name: 'Relevance check', detail: 'BM25 floor, refuses off-topic' },
  { name: 'Generation', detail: 'Groq, Gemini fallback', network: true },
  { name: 'Grounding check', detail: 'quote verified, then two lexical signals' },
]

export function PipelineFooter({ meta }: { meta: Meta | null }) {
  const targetMs = meta?.benchmarks.target_ms ?? 200

  return (
    <footer className="mt-8 border-t border-line pt-6 pb-10">
      <h2 className="text-sm font-semibold tracking-wide text-muted uppercase">The path a question takes</h2>

      <ol className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {STEPS.map((step, i) => (
          <li
            key={step.name}
            className={`rounded-xl border p-3 ${
              step.network ? 'border-line border-dashed bg-transparent' : 'border-line bg-panel'
            }`}
          >
            <div className="flex items-center gap-1.5 text-[11px] tracking-wide text-muted uppercase">
              {step.network ? <Cloud size={11} /> : <Cpu size={11} />}
              {step.network ? 'network' : 'in process'}
            </div>
            <div className="mt-1 text-sm font-medium text-ink">
              <span className="text-muted tabular-nums">{i + 1}. </span>
              {step.name}
            </div>
            <div className="mt-0.5 text-xs leading-relaxed text-muted">{step.detail}</div>
          </li>
        ))}
      </ol>

      <p className="mt-4 max-w-3xl text-xs leading-relaxed text-muted">
        The {targetMs}ms target is measured across the four in-process steps, which is the part of
        the pipeline this system controls. The two network steps are hosted APIs; they are timed on
        every query and reported next to that figure rather than inside it. Both numbers, across a
        real query set rather than a single run, are in <span className="font-mono">docs/latency-report.md</span>{' '}
        and <span className="font-mono">docs/retrieval-quality.md</span>.
      </p>
    </footer>
  )
}
