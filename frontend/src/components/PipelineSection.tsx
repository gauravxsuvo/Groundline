import { Cloud, Cpu } from 'lucide-react'
import type { Meta } from '../lib/api'
import { delay } from '../lib/motion'
import { Section, SectionHeading } from './Section'

/** The path a question takes, with the boundary drawn where it matters.
 *
 *  Someone reading "under 200ms" should be able to see at a glance which of
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

function Legend() {
  return (
    <div className="flex flex-wrap items-center gap-5 text-xs text-muted" data-reveal style={delay(160)}>
      <span className="flex items-center gap-1.5">
        <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden="true" />
        <Cpu size={12} className="text-subtle" />
        in process, inside the target
      </span>
      <span className="flex items-center gap-1.5">
        <span className="h-1.5 w-1.5 rounded-full bg-subtle/50" aria-hidden="true" />
        <Cloud size={12} className="text-subtle" />
        hosted API, timed separately
      </span>
    </div>
  )
}

export function PipelineSection({ meta }: { meta: Meta | null }) {
  const targetMs = meta?.benchmarks.target_ms ?? 200

  return (
    <Section id="pipeline" tone="veil" className="border-t border-line">
      <div className="py-20 md:py-28">
        <SectionHeading
          eyebrow="How it works"
          title="Six stages. Two of them leave the machine."
        >
          <p>
            A question travels the same path every time, and every stage is timed. The four that run
            in process are the ones the {targetMs}ms target covers. The two that call a hosted API
            are marked, so the figure is never quietly doing more work than it claims.
          </p>
        </SectionHeading>

        <div className="mt-8">
          <Legend />
        </div>

        {/* Top borders butt against each other with no column gap, so the row
            reads as one continuous rail with a marker per stage. On narrow
            screens the same borders become the dividers of a plain list. */}
        <ol className="mt-10 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-6">
          {STEPS.map((step, i) => (
            <li
              key={step.name}
              className="relative border-t border-line pt-6 pb-7 sm:pr-8 xl:pr-6"
              data-reveal
              style={delay(i * 70)}
            >
              <span
                className={`absolute top-0 left-0 h-[5px] w-[5px] -translate-y-1/2 rounded-full ${
                  step.network ? 'bg-subtle/50' : 'bg-accent'
                }`}
                aria-hidden="true"
              />
              <div className="flex items-center gap-2">
                <span className="font-mono text-[11px] text-subtle tabular-nums">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <span className="flex items-center gap-1 text-[10px] font-medium tracking-[0.12em] text-subtle uppercase">
                  {step.network ? <Cloud size={10} /> : <Cpu size={10} />}
                  {step.network ? 'network' : 'in process'}
                </span>
              </div>
              <p className="mt-3 text-[0.9375rem] font-medium tracking-[-0.01em] text-ink">
                {step.name}
              </p>
              <p className="mt-1.5 max-w-[30ch] text-[0.8125rem] leading-relaxed text-muted">
                {step.detail}
              </p>
            </li>
          ))}
        </ol>

        <p
          className="mt-10 max-w-[76ch] text-sm leading-relaxed text-muted"
          data-reveal
          style={delay(120)}
        >
          Retrieval changes are measured rather than argued: recall@5 and MRR@5 are scored offline
          against MS MARCO's own relevance labels, and the grounding guardrails are checked by a
          fixed battery of questions whose correct outcome, answer or refusal, is known by
          inspection of the corpus. Those runs live in{' '}
          <span className="font-mono text-[0.8125rem] text-ink/70">docs/retrieval-quality.md</span>{' '}
          and <span className="font-mono text-[0.8125rem] text-ink/70">docs/grounding.md</span>.
        </p>
      </div>
    </Section>
  )
}
