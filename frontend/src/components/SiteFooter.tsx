import type { Meta } from '../lib/api'
import { delay, useRevealScope } from '../lib/motion'
import { Mark } from './Mark'

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b border-line-soft py-2.5 last:border-b-0">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="font-mono text-[0.8125rem] text-ink/75">{value}</dd>
    </div>
  )
}

/** What the backend is actually running, read from GET /api/meta.
 *
 *  Model names sit here rather than in copy for the same reason the benchmark
 *  figures do: two of them changed under this build mid-project, and anything
 *  typed into the frontend by hand would still be claiming the old ones.
 */
export function SiteFooter({ meta }: { meta: Meta | null }) {
  const ref = useRevealScope<HTMLElement>()

  return (
    <footer ref={ref} className="w-full border-t border-line bg-paper">
      <div className="gutter grid w-full grid-cols-1 gap-12 py-16 md:grid-cols-2 md:py-20 xl:grid-cols-[1fr_minmax(0,26rem)_minmax(0,22rem)] xl:gap-16">
        <div data-reveal>
          <div className="flex items-center gap-2.5">
            <Mark size={26} />
            <span className="text-[0.9375rem] font-semibold tracking-[-0.02em] text-ink">
              Groundline
            </span>
          </div>
          <p className="mt-4 max-w-[34ch] text-sm leading-relaxed text-muted">
            Answers that show their work. Speech in, retrieval over a chunked corpus, and an answer
            that either quotes a passage or does not get made.
          </p>
        </div>

        <div data-reveal style={delay(80)}>
          <h2 className="text-[11px] font-medium tracking-[0.14em] text-subtle uppercase">
            Running now
          </h2>
          {meta ? (
            <dl className="mt-4">
              <Row label="Index" value={`${meta.strategy}, top ${meta.top_k}`} />
              <Row label="Passages" value={meta.chunk_count.toLocaleString()} />
              <Row label="Embeddings" value={meta.embedding_model} />
              <Row label="Speech to text" value={meta.stt_model} />
              <Row label="Generation" value={meta.generation_model} />
              <Row label="Fallback" value={meta.fallback_model} />
            </dl>
          ) : (
            <p className="mt-4 text-sm text-muted">Waiting on the backend.</p>
          )}
        </div>

        <div data-reveal style={delay(160)}>
          <h2 className="text-[11px] font-medium tracking-[0.14em] text-subtle uppercase">Scope</h2>
          <p className="mt-4 text-sm leading-relaxed text-muted">
            The corpus is a sample of AI4Bharat's MSMARCO-XI, English only for this build. Questions
            outside it are refused rather than answered from the model's own memory, which is the
            behaviour the guardrails exist to produce.
          </p>
        </div>
      </div>
    </footer>
  )
}
