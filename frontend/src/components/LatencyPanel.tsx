import { Clock } from 'lucide-react'
import type { PipelineResult } from '../lib/api'
import { Card } from './ui/card'

const STAGE_LABELS: Record<string, string> = {
  transcribe: 'Speech to text',
  input_guard: 'Safety check',
  retrieval: 'Retrieval',
  relevance_guard: 'Relevance check',
  generation: 'Generation',
  output_guard: 'Grounding check',
}

export function LatencyPanel({ result }: { result: PipelineResult | null }) {
  const timings = result?.timings ?? []
  const total = result?.total_elapsed_ms ?? 0
  const max = Math.max(1, ...timings.map((t) => t.elapsed_ms))
  const retrieval = timings.find((t) => t.stage === 'retrieval')

  return (
    <Card title="Latency" icon={<Clock size={14} />}>
      {timings.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted">Per-stage timing will appear here.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {timings.map((t) => (
            <div key={t.stage}>
              <div className="mb-1 flex items-center justify-between text-xs">
                <span className="text-muted">{STAGE_LABELS[t.stage] ?? t.stage}</span>
                <span className="font-medium text-ink tabular-nums">{t.elapsed_ms.toFixed(1)}ms</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-line">
                <div
                  className="h-full rounded-full bg-accent"
                  style={{ width: `${Math.max(2, (t.elapsed_ms / max) * 100)}%` }}
                />
              </div>
            </div>
          ))}

          <div className="mt-1 flex items-center justify-between border-t border-line pt-3 text-sm">
            <span className="font-medium text-ink">Total</span>
            <span className="font-semibold text-ink tabular-nums">{total.toFixed(0)}ms</span>
          </div>

          {retrieval && (
            <p className="text-xs text-muted">
              Retrieval alone: {retrieval.elapsed_ms.toFixed(0)}ms
              {retrieval.elapsed_ms < 200 ? ' (under the 200ms retrieval target).' : '.'}
            </p>
          )}
        </div>
      )}
    </Card>
  )
}
