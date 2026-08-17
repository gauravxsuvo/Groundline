import type { ReactNode } from 'react'
import { CircleCheck, Database, Gauge, Target } from 'lucide-react'
import type { Meta } from '../lib/api'
import { delay } from '../lib/motion'
import { CountUp } from './CountUp'
import { Section, SectionHeading } from './Section'

/** States the 200ms result plainly, and says exactly what it covers.
 *
 *  The design target is the pipeline under 200ms. Retrieval meets that; a hosted
 *  LLM call does not and cannot. Reporting one blended number would hide which
 *  is which, so both are reported and this section says which one the target is
 *  measured against, before anyone reads a per-query number.
 */
function Figure({
  icon,
  label,
  value,
  caption,
  accent,
  revealDelay,
}: {
  icon: ReactNode
  label: string
  value: ReactNode
  caption: string
  accent?: boolean
  revealDelay: number
}) {
  return (
    <div data-reveal style={delay(revealDelay)}>
      <div className="flex items-center gap-1.5 text-[11px] font-medium tracking-[0.14em] text-subtle uppercase">
        {icon}
        {label}
      </div>
      <div className={`mt-4 text-figure ${accent ? 'text-accent' : 'text-ink'}`}>{value}</div>
      <p className="mt-3 max-w-[34ch] text-sm leading-relaxed text-muted">{caption}</p>
    </div>
  )
}

function Unit({ children }: { children: ReactNode }) {
  return <span className="text-[0.4em] font-medium tracking-normal text-subtle">{children}</span>
}

export function MetricsBand({ meta }: { meta: Meta | null }) {
  if (!meta) {
    return (
      <Section id="numbers" className="border-t border-line">
        <div className="grid grid-cols-1 gap-8 py-24 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex flex-col gap-4">
              <div className="h-3 w-20 animate-breathe rounded-md bg-line" />
              <div className="h-9 w-28 animate-breathe rounded-md bg-line" />
              <div className="h-3 w-full animate-breathe rounded-md bg-line" />
            </div>
          ))}
        </div>
      </Section>
    )
  }

  const { target_ms, latency, quality } = meta.benchmarks
  const headroom = Math.round(target_ms - latency.p50_ms)

  return (
    <Section id="numbers" className="border-t border-line">
      <div className="py-20 md:py-28">
        <SectionHeading
          eyebrow="Measured, not claimed"
          title={
            <>
              Retrieval answers in{' '}
              <span className="text-accent">{latency.p50_ms.toFixed(0)}ms</span> at P50, against a{' '}
              {target_ms}ms target.
            </>
          }
        >
          <p>
            That covers the whole in-process path: query embedding, hybrid dense and BM25 search over
            the chunked corpus, rank fusion, and every guardrail. It is a P50 over {latency.queries}{' '}
            real queries rather than a best run, with a P100 of {latency.p100_ms.toFixed(0)}ms.
          </p>
        </SectionHeading>

        {/* Four columns of hairline separated figures rather than four boxed
            cards. On a page that is already made of panels, boxing the numbers
            too would bury them. */}
        <div className="mt-14 grid grid-cols-1 gap-x-10 gap-y-12 border-t border-line pt-12 sm:grid-cols-2 xl:grid-cols-4">
          <Figure
            icon={<Gauge size={12} />}
            label="Retrieval"
            value={
              <>
                <CountUp value={latency.p50_ms} />
                <Unit>ms</Unit>
              </>
            }
            caption={`P50 across ${latency.queries} queries, P100 ${latency.p100_ms.toFixed(0)}ms. P70 sits at ${latency.p70_ms.toFixed(0)}ms.`}
            accent
            revealDelay={0}
          />
          <Figure
            icon={<Target size={12} />}
            label="Target"
            value={
              <>
                {target_ms}
                <Unit>ms</Unit>
              </>
            }
            caption={`Met, with ${headroom}ms of headroom. The four in-process stages are what this figure covers.`}
            revealDelay={70}
          />
          <Figure
            icon={<CircleCheck size={12} />}
            label="recall@5"
            value={<CountUp value={quality.recall_at_5} decimals={3} />}
            caption={`Scored against MS MARCO's own relevance labels over ${quality.queries.toLocaleString()} queries. MRR@5 is ${quality.mrr_at_5.toFixed(3)}.`}
            revealDelay={140}
          />
          <Figure
            icon={<Database size={12} />}
            label="Corpus"
            value={<CountUp value={meta.chunk_count} grouped />}
            caption={`Passages indexed. ${meta.strategies_built.length} chunking strategies were built and compared before one was picked.`}
            revealDelay={210}
          />
        </div>

        {/* The part that is easy to leave out and the first thing anyone
            sceptical will check for. Said plainly rather than buried. */}
        <div
          className="mt-12 flex max-w-[76ch] flex-col gap-3 border-l-2 border-accent/40 py-1 pl-5"
          data-reveal
          style={delay(280)}
        >
          <p className="text-[0.9375rem] leading-relaxed text-ink">
            Generation is a call to a hosted LLM. It cannot return in {target_ms}ms and is never
            counted against that target.
          </p>
          <p className="text-sm leading-relaxed text-muted">
            It is timed on every query and reported next to the in-process figure rather than inside
            it, so the two are always distinguishable. Both numbers, across a real query set rather
            than a single run, are in <span className="font-mono text-[0.8125rem]">docs/latency-report.md</span>.
          </p>
        </div>
      </div>
    </Section>
  )
}
