import { Quote } from 'lucide-react'
import type { PipelineResult } from '../lib/api'
import { Card } from './ui/card'
import { Badge } from './ui/badge'

export function SourcesPanel({ result }: { result: PipelineResult | null }) {
  const chunks = result?.retrieval?.chunks ?? []
  const citations = new Set(result?.generation?.citations ?? [])

  return (
    <Card title="Sources" icon={<Quote size={14} />}>
      {chunks.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted">Retrieved passages will appear here.</p>
      ) : (
        <ol className="flex flex-col gap-3">
          {chunks.map((chunk, i) => {
            const cited = citations.has(chunk.chunk_id)
            return (
              <li
                key={chunk.chunk_id}
                className={
                  cited
                    ? 'rounded-xl border border-accent/40 bg-accent/6 p-3'
                    : 'rounded-xl border border-line p-3'
                }
              >
                <div className="mb-1.5 flex items-center gap-2">
                  <span className="text-xs font-semibold text-muted">#{i + 1}</span>
                  {cited && <Badge variant="success">cited</Badge>}
                  {typeof chunk.metadata?.query_type === 'string' && (
                    <span className="text-[11px] text-muted">{chunk.metadata.query_type}</span>
                  )}
                </div>
                <p className="line-clamp-4 text-sm text-ink/90">{chunk.text}</p>
              </li>
            )
          })}
        </ol>
      )}
    </Card>
  )
}
