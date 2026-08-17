import { useEffect, useRef } from 'react'
import { Library } from 'lucide-react'
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

function Passage({ text, evidence, cited }: { text: string; evidence: string; cited: boolean }) {
  const boxRef = useRef<HTMLParagraphElement>(null)
  const markRef = useRef<HTMLElement>(null)
  const located = cited && evidence ? locateEvidence(text, evidence) : null

  // Every passage scrolls inside a fixed height so the rail stays one even
  // row. That can hide the quote the answer rests on, which is the line a
  // reader most wants to see, so nudge it into view. Done by setting
  // scrollTop on the passage itself rather than calling scrollIntoView, which
  // is free to scroll the whole page as well and would yank the reader down to
  // the sources the moment an answer arrives.
  useEffect(() => {
    const box = boxRef.current
    const mark = markRef.current
    if (!box || !mark) return
    const offset = mark.getBoundingClientRect().top - box.getBoundingClientRect().top
    if (offset > box.clientHeight * 0.55) box.scrollTop += offset - 16
  }, [text, evidence, cited])

  return (
    // A scrollable region needs to be focusable, or the text below the fold in
    // it is unreachable without a mouse (WCAG 2.1.1).
    <p
      ref={boxRef}
      tabIndex={0}
      className="scroll-soft max-h-44 overflow-y-auto pr-1 text-[0.8125rem] leading-relaxed text-ink/85 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-ink"
    >
      {located ? (
        <>
          {located[0]}
          {/* box-decoration-break keeps the tint as one shape when the quote
              wraps. Without it every line gets its own square block and the
              highlight reads as a redaction rather than a marker. */}
          <mark
            ref={markRef}
            className="rounded bg-verified/18 px-0.5 py-px text-ink [box-decoration-break:clone] [-webkit-box-decoration-break:clone]"
          >
            {located[1]}
          </mark>
          {located[2]}
        </>
      ) : (
        text
      )}
    </p>
  )
}

/** The retrieved passages, as one row that runs the width of the page.
 *
 *  A rail rather than a stacked list: five passages side by side can be
 *  compared at a glance, which is the point of showing all of them rather than
 *  only the cited one. Each card is a fixed height and scrolls internally, so
 *  a long passage never drags the row out of shape.
 */
export function SourcesPanel({ result }: { result: PipelineResult | null }) {
  const chunks = result?.retrieval?.chunks ?? []
  const citations = new Set(result?.generation?.citations ?? [])
  const evidence = result?.refused ? '' : (result?.generation?.evidence ?? '')

  return (
    <Card
      title="Sources"
      icon={<Library size={13} />}
      action={
        chunks.length > 0 ? (
          <span className="text-xs text-muted tabular-nums">
            {result?.refused ? `${chunks.length} retrieved, none used` : `top ${chunks.length}`}
          </span>
        ) : null
      }
    >
      {chunks.length === 0 ? (
        <p className="max-w-[64ch] text-sm leading-relaxed text-muted">
          The passages retrieved for a question appear here, all of them, with the one the answer is
          built on marked and its supporting sentence highlighted in place.
        </p>
      ) : (
        <ol
          tabIndex={0}
          aria-label="Retrieved passages"
          className="scroll-soft -mx-1 flex snap-x snap-mandatory gap-3 overflow-x-auto px-1 pb-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-ink"
        >
          {chunks.map((chunk, i) => {
            // On a refusal nothing was accepted, so nothing gets the verified
            // treatment: the citation belongs to a draft answer that was
            // withheld, and tinting its source would read as endorsement.
            const cited = citations.has(chunk.chunk_id) && !result?.refused
            return (
              <li
                key={chunk.chunk_id}
                className={`flex min-w-[16.5rem] flex-1 animate-rise snap-start flex-col rounded-[1.125rem] border p-4 transition-colors duration-300 ${
                  cited ? 'border-verified/35 bg-verified/5' : 'border-line bg-paper'
                }`}
                style={{ animationDelay: `${i * 60}ms` }}
              >
                <div className="mb-2.5 flex flex-wrap items-center gap-2">
                  <span className="text-[11px] font-semibold text-subtle tabular-nums">
                    {i + 1}
                  </span>
                  {cited && <Badge variant="verified">cited</Badge>}
                  {typeof chunk.metadata?.query_type === 'string' && (
                    <span className="text-[11px] text-subtle">
                      {(chunk.metadata.query_type as string).toLowerCase()}
                    </span>
                  )}
                  <span className="ml-auto font-mono text-[11px] text-subtle tabular-nums">
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
