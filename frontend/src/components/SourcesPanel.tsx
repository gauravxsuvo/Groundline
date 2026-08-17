import { useState } from 'react'
import { ChevronDown, Library } from 'lucide-react'
import type { PipelineResult } from '../lib/api'
import { Card } from './ui/card'
import { Badge } from './ui/badge'

/** Locates the model's quoted span inside the passage it was taken from.
 *
 *  Matched on word sequence rather than raw string: the quote comes back
 *  through a JSON field, where casing, curly quotes and runs of whitespace all
 *  drift, and none of that means it is a different sentence. The backend's
 *  grounding guard compares the same way (`output_guard.verify_evidence`), so
 *  what gets highlighted here is what was verified there.
 */
function locateEvidence(text: string, evidence: string): [string, string, string] | null {
  const fragment = evidence.split(/\.{3}|…/)[0]
  const tokens = fragment.toLowerCase().match(/[a-z0-9]+/g)
  if (!tokens || tokens.length < 4) return null

  const pattern = tokens.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('[^a-z0-9]+')
  const match = new RegExp(pattern, 'i').exec(text)
  if (!match) return null

  return [text.slice(0, match.index), match[0], text.slice(match.index + match[0].length)]
}

function Passage({
  text,
  evidence,
  cited,
}: {
  text: string
  evidence: string
  cited: boolean
}) {
  const [expanded, setExpanded] = useState(false)
  const located = cited && evidence ? locateEvidence(text, evidence) : null
  const long = text.length > 260

  // A cited passage opens far enough to show the quote in place. Highlighting
  // a sentence that is clipped out of view would be pointless.
  const clamped = !expanded && long && !located

  return (
    <div>
      <p className={`text-sm leading-relaxed text-ink/90 ${clamped ? 'line-clamp-4' : ''}`}>
        {located ? (
          <>
            {located[0]}
            <mark className="rounded bg-verified/15 px-0.5 text-ink decoration-verified/40 underline-offset-2">
              {located[1]}
            </mark>
            {located[2]}
          </>
        ) : (
          text
        )}
      </p>
      {long && !located && (
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          className="mt-1.5 inline-flex items-center gap-1 text-xs text-muted transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <ChevronDown size={12} className={expanded ? 'rotate-180 transition-transform' : 'transition-transform'} />
          {expanded ? 'Show less' : 'Show full passage'}
        </button>
      )}
    </div>
  )
}

export function SourcesPanel({ result }: { result: PipelineResult | null }) {
  const chunks = result?.retrieval?.chunks ?? []
  const citations = new Set(result?.generation?.citations ?? [])
  const evidence = result?.refused ? '' : (result?.generation?.evidence ?? '')

  return (
    <Card
      title="Sources"
      icon={<Library size={14} />}
      action={
        chunks.length > 0 ? (
          <span className="text-xs text-muted tabular-nums">
            {result?.refused ? `${chunks.length} retrieved, not used` : `top ${chunks.length}`}
          </span>
        ) : null
      }
    >
      {chunks.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <p className="max-w-xs text-sm leading-relaxed text-muted">
            The passages retrieved for a question appear here, with the one the answer is built on
            marked and its supporting sentence highlighted.
          </p>
        </div>
      ) : (
        <ol className="flex animate-rise flex-col gap-3">
          {chunks.map((chunk, i) => {
            // On a refusal nothing was accepted, so nothing gets the verified
            // treatment: the citation belongs to a draft answer that was
            // withheld, and tinting its source would read as endorsement.
            const cited = citations.has(chunk.chunk_id) && !result?.refused
            return (
              <li
                key={chunk.chunk_id}
                className={
                  cited
                    ? 'rounded-xl border border-verified/40 bg-verified/5 p-3'
                    : 'rounded-xl border border-line p-3'
                }
              >
                <div className="mb-1.5 flex flex-wrap items-center gap-2">
                  <span className="text-xs font-semibold text-muted tabular-nums">#{i + 1}</span>
                  {cited && <Badge variant="verified">cited</Badge>}
                  {typeof chunk.metadata?.query_type === 'string' && (
                    <span className="text-[11px] text-muted">
                      {(chunk.metadata.query_type as string).toLowerCase()}
                    </span>
                  )}
                  <span className="ml-auto text-[11px] text-muted tabular-nums">
                    {chunk.score.toFixed(3)}
                  </span>
                </div>
                <Passage text={chunk.text} evidence={evidence} cited={cited} />
              </li>
            )
          })}
        </ol>
      )}
    </Card>
  )
}
