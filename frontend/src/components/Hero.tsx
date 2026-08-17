import type { ReactNode } from 'react'
import { ArrowDown } from 'lucide-react'
import type { Meta } from '../lib/api'
import { delay, useRevealScope } from '../lib/motion'
import { CountUp } from './CountUp'

function Fact({
  figure,
  caption,
  revealDelay,
}: {
  figure: ReactNode
  caption: string
  revealDelay: number
}) {
  return (
    <div className="py-5 sm:px-7 sm:py-0 sm:first:pl-0" data-reveal style={delay(revealDelay)}>
      <div className="flex items-baseline gap-1 text-[1.75rem] leading-none font-semibold tracking-[-0.03em] text-ink">
        {figure}
      </div>
      <p className="mt-2 text-sm leading-relaxed text-muted">{caption}</p>
    </div>
  )
}

export function Hero({ meta }: { meta: Meta | null }) {
  const ref = useRevealScope<HTMLElement>()
  const benchmarks = meta?.benchmarks

  return (
    <section id="top" ref={ref} className="relative w-full overflow-hidden bg-paper">
      {/* One soft warm wash, same hue as the accent, at a tenth of its
          strength. It gives the white ground a direction to fall away from
          without becoming a coloured background. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div
          className="absolute top-[-38%] right-[-12%] aspect-square w-[min(92vw,60rem)] rounded-full"
          style={{
            background:
              'radial-gradient(circle at center, rgba(194,106,30,0.11) 0%, rgba(194,106,30,0.04) 38%, rgba(194,106,30,0) 66%)',
          }}
        />
      </div>

      <div className="gutter relative w-full pt-32 pb-16 md:pt-44 md:pb-24">
        <p
          className="text-[11px] font-medium tracking-[0.18em] text-accent-ink uppercase"
          data-reveal
        >
          Voice retrieval, grounded
        </p>

        <h1 className="mt-6 max-w-[18ch] text-display text-ink">
          <span className="block" data-reveal style={delay(60)}>
            Ask out loud.
          </span>
          <span className="block text-subtle" data-reveal style={delay(140)}>
            Get an answer that proves itself.
          </span>
        </h1>

        <p
          className="mt-8 max-w-[58ch] text-lede text-muted"
          data-reveal
          style={delay(220)}
        >
          Groundline transcribes your question, searches a chunked corpus with dense and lexical
          retrieval in a single pass, and answers only from the passages that came back. Each answer
          carries the sentence it rests on. When no passage supports one, it refuses and names the
          check that stopped it.
        </p>

        <div className="mt-10 flex flex-wrap items-center gap-3" data-reveal style={delay(280)}>
          <a
            href="#ask"
            className="inline-flex h-12 items-center gap-2 rounded-full bg-ink px-6 text-[0.9375rem] font-medium text-paper transition-all duration-300 ease-smooth hover:bg-ink/88 active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-ink"
          >
            Ask a question
            <ArrowDown size={16} />
          </a>
          <a
            href="#pipeline"
            className="inline-flex h-12 items-center rounded-full border border-line px-6 text-[0.9375rem] font-medium text-ink transition-all duration-300 ease-smooth hover:border-ink/25 hover:bg-veil active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-ink"
          >
            How it works
          </a>
        </div>

        {/* The three figures worth seeing first, before any scrolling.
            All measured, all served by GET /api/meta, so they cannot drift from
            what the backend is actually running. */}
        <div className="mt-14 border-t border-line pt-2 sm:mt-16">
          {benchmarks ? (
            <div className="grid grid-cols-1 divide-y divide-line sm:grid-cols-3 sm:divide-x sm:divide-y-0 sm:py-7">
              <Fact
                figure={
                  <>
                    <CountUp value={benchmarks.latency.p50_ms} />
                    <span className="text-base font-medium text-subtle">ms</span>
                  </>
                }
                caption={`Retrieval and guardrails at P50, against a ${benchmarks.target_ms}ms target. Measured over ${benchmarks.latency.queries} queries.`}
                revealDelay={340}
              />
              <Fact
                figure={<CountUp value={benchmarks.quality.recall_at_5} decimals={3} />}
                caption={`recall@5 against MS MARCO relevance labels, over ${benchmarks.quality.queries.toLocaleString()} labelled queries.`}
                revealDelay={400}
              />
              <Fact
                figure={<CountUp value={meta.chunk_count} grouped />}
                caption={`Passages indexed, from ${meta.strategies_built.length} chunking strategies built and compared.`}
                revealDelay={460}
              />
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-6 py-7 sm:grid-cols-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="flex flex-col gap-3">
                  <div className="h-7 w-24 animate-breathe rounded-md bg-line-soft" />
                  <div className="h-3 w-full animate-breathe rounded-md bg-line-soft" />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
