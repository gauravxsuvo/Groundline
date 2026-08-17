import { Cloud, Cpu, Gauge } from 'lucide-react'
import type { Meta, PipelineResult, StageTiming } from '../lib/api'
import { Card } from './ui/card'

const STAGE_LABELS: Record<string, string> = {
  transcribe: 'Speech to text',
  input_guard: 'Safety check',
  retrieval: 'Chunk retrieval',
  relevance_guard: 'Relevance check',
  generation: 'Generation',
  output_guard: 'Grounding check',
}

const FALLBACK_LOCAL = ['input_guard', 'retrieval', 'relevance_guard', 'output_guard']

function sum(timings: StageTiming[]): number {
  return timings.reduce((total, t) => total + t.elapsed_ms, 0)
}

/** The in-process total against the 200ms target, drawn to scale.
 *
 *  Fixed scale on purpose: the bar is always 0 to the target, so a fast query
 *  looks fast. Scaling the bar to the measured value instead would fill it
 *  every time and say nothing.
 */
function BudgetBar({ elapsedMs, targetMs }: { elapsedMs: number; targetMs: number }) {
  const over = elapsedMs > targetMs
  const filled = Math.min(100, (elapsedMs / targetMs) * 100)

  return (
    <div>
      <div className="relative h-2.5 overflow-hidden rounded-full bg-line">
        <div
          className={`h-full rounded-full transition-[width] duration-500 ${over ? 'bg-danger' : 'bg-verified'}`}
          style={{ width: `${Math.max(1.5, filled)}%` }}
        />
        <div className="absolute inset-y-0 left-1/2 w-px bg-paper/70" />
      </div>
      <div className="mt-1 flex justify-between text-[11px] text-muted tabular-nums">
        <span>0</span>
        <span>{Math.round(targetMs / 2)}ms</span>
        <span>{targetMs}ms target</span>
      </div>
    </div>
  )
}

function StageRow({ timing, max, network }: { timing: StageTiming; max: number; network: boolean }) {
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between gap-2 text-xs">
        <span className="flex items-center gap-1.5 text-muted">
          {network ? <Cloud size={12} className="text-muted/70" /> : <Cpu size={12} className="text-muted/70" />}
          {STAGE_LABELS[timing.stage] ?? timing.stage}
        </span>
        <span className="font-medium text-ink tabular-nums">
          {timing.elapsed_ms < 1 ? '<1' : timing.elapsed_ms.toFixed(timing.elapsed_ms < 100 ? 1 : 0)}ms
        </span>
      </div>
      <div className="h-1 overflow-hidden rounded-full bg-line/70">
        <div
          className={`h-full rounded-full transition-[width] duration-500 ${network ? 'bg-muted/40' : 'bg-accent'}`}
          style={{ width: `${Math.max(1.5, (timing.elapsed_ms / max) * 100)}%` }}
        />
      </div>
    </div>
  )
}

export function LatencyPanel({ result, meta }: { result: PipelineResult | null; meta: Meta | null }) {
  const targetMs = meta?.benchmarks.target_ms ?? 200
  const localStages = meta?.local_stages ?? FALLBACK_LOCAL
  const timings = result?.timings ?? []
  const local = timings.filter((t) => localStages.includes(t.stage))
  const network = timings.filter((t) => !localStages.includes(t.stage))
  const localMs = sum(local)
  const networkMs = sum(network)
  // Each group is drawn against its own slowest stage. Scaling all six against
  // one maximum would flatten every in-process bar to a dot next to a
  // multi-hundred millisecond network call, which is the comparison the panel
  // above already makes in numbers; these bars are for reading the shape within
  // a group.
  const localMax = Math.max(1, ...local.map((t) => t.elapsed_ms))
  const networkMax = Math.max(1, ...network.map((t) => t.elapsed_ms))

  return (
    <Card title="Latency" icon={<Gauge size={14} />}>
      {timings.length === 0 ? (
        <div className="flex flex-col gap-3">
          <BudgetBar elapsedMs={0} targetMs={targetMs} />
          <p className="text-xs leading-relaxed text-muted">
            Every stage is timed per query. The in-process path is measured against the {targetMs}ms
            target; the speech and generation calls leave the machine and are reported next to it,
            never inside it.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div>
            <div className="mb-2 flex items-baseline justify-between">
              <span className="text-xs font-medium tracking-wide text-muted uppercase">
                In process
              </span>
              <span
                className={`text-2xl leading-none font-semibold tabular-nums ${localMs <= targetMs ? 'text-verified' : 'text-danger'}`}
              >
                {localMs.toFixed(0)}ms
              </span>
            </div>
            <BudgetBar elapsedMs={localMs} targetMs={targetMs} />
            <p className="mt-2 text-xs text-muted">
              Retrieval and guardrails, this query.{' '}
              {localMs <= targetMs
                ? `Under the ${targetMs}ms target by ${(targetMs - localMs).toFixed(0)}ms.`
                : `Over the ${targetMs}ms target by ${(localMs - targetMs).toFixed(0)}ms.`}
            </p>
          </div>

          <div className="flex flex-col gap-2.5 border-t border-line pt-4">
            {local.map((t) => (
              <StageRow key={t.stage} timing={t} max={localMax} network={false} />
            ))}
          </div>

          {network.length > 0 && (
            <div className="flex flex-col gap-2.5 border-t border-line pt-4">
              <div className="flex items-baseline justify-between">
                <span className="text-xs font-medium tracking-wide text-muted uppercase">
                  Network calls
                </span>
                <span className="text-sm font-semibold text-ink tabular-nums">
                  {networkMs.toFixed(0)}ms
                </span>
              </div>
              {network.map((t) => (
                <StageRow key={t.stage} timing={t} max={networkMax} network />
              ))}
              <p className="text-xs leading-relaxed text-muted">
                Hosted APIs, outside the {targetMs}ms target by construction. Speech to text is
                Sarvam, generation is {meta?.generation_model ?? 'the primary provider'} on Groq with
                a Gemini fallback.
              </p>
            </div>
          )}

          <div className="flex items-baseline justify-between border-t border-line pt-3 text-sm">
            <span className="font-medium text-ink">End to end</span>
            <span className="font-semibold text-ink tabular-nums">
              {(result?.total_elapsed_ms ?? 0).toFixed(0)}ms
            </span>
          </div>
        </div>
      )}
    </Card>
  )
}
