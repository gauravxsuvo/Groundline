import {
  CircleCheck,
  MessageSquareText,
  MicOff,
  Quote,
  SearchX,
  ShieldAlert,
  ShieldQuestion,
} from 'lucide-react'
import type { PipelineResult } from '../lib/api'
import { Card } from './ui/card'
import { Badge } from './ui/badge'
import { cn } from '../lib/utils'

/** A bar of placeholder with a highlight travelling across it.
 *
 *  Used while a query is in flight. It occupies the shape the answer will
 *  take, so the panel does not jump when the real text lands. */
function Shimmer({ className }: { className?: string }) {
  return (
    <div className={cn('relative overflow-hidden rounded-md bg-line-soft', className)}>
      <div className="absolute inset-y-0 -left-1/2 w-1/2 animate-drift bg-gradient-to-r from-transparent via-paper/90 to-transparent" />
    </div>
  )
}

function GuardNote({
  icon,
  title,
  body,
  guard,
  tone = 'muted',
}: {
  icon: React.ReactNode
  title: string
  body: string
  guard: string
  tone?: 'muted' | 'danger'
}) {
  return (
    <div
      className={cn(
        'flex items-start gap-3.5 rounded-[1.125rem] p-4 md:p-5',
        tone === 'danger' ? 'bg-danger/6' : 'bg-veil',
      )}
    >
      <span className={cn('mt-0.5 shrink-0', tone === 'danger' ? 'text-danger' : 'text-subtle')}>
        {icon}
      </span>
      <div>
        <p className="font-medium text-ink">{title}</p>
        <p className="mt-1.5 max-w-[68ch] text-sm leading-relaxed text-muted">{body}</p>
        <p className="mt-3 font-mono text-[11px] text-subtle">{guard}</p>
      </div>
    </div>
  )
}

function RefusalNotice({ result }: { result: PipelineResult }) {
  const category = result.refusal_category

  if (category === 'unsafe') {
    return (
      <GuardNote
        icon={<ShieldAlert size={20} />}
        tone="danger"
        title="This request was declined."
        body="The input matched an unsafe content pattern, so it was stopped before anything was retrieved and before any model saw it."
        guard={result.refusal_reason ?? 'input guardrail, pre-retrieval'}
      />
    )
  }

  if (category === 'off_topic') {
    return (
      <GuardNote
        icon={<SearchX size={20} />}
        title="Nothing in the corpus is about this."
        body="The question shares no vocabulary with the indexed passages, so retrieval had nothing to work with and generation was skipped rather than asked to improvise."
        guard={result.refusal_reason ?? 'relevance guardrail'}
      />
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <GuardNote
        icon={<ShieldQuestion size={20} />}
        title="No passage states this, so it is not being answered."
        body="Passages came back and a draft answer was written, but it did not hold up against the evidence. Rather than present it as fact, the system withholds it. The draft is shown below, struck through, so you can see what was rejected."
        guard={result.refusal_reason ?? 'grounding guardrail'}
      />
      {result.generation?.answer && (
        <p className="rounded-[1.125rem] border border-dashed border-line px-4 py-3.5 text-sm leading-relaxed text-subtle italic line-through decoration-subtle/50">
          {result.generation.answer}
        </p>
      )}
    </div>
  )
}

function Confidence({ value }: { value: number }) {
  const pct = Math.round(value * 100)
  return (
    <span className="inline-flex items-center gap-2 rounded-full bg-veil px-3 py-1 text-[11px] font-medium text-muted">
      confidence
      <span className="h-1 w-10 overflow-hidden rounded-full bg-line">
        <span
          className="block h-full rounded-full bg-muted/70 transition-[width] duration-700 ease-smooth"
          style={{ width: `${Math.max(4, pct)}%` }}
        />
      </span>
      <span className="tabular-nums">{pct}%</span>
    </span>
  )
}

export function AnswerPanel({ result, busy }: { result: PipelineResult | null; busy: boolean }) {
  const generation = result?.generation
  const chunks = result?.retrieval?.chunks ?? []
  const citedIndex = generation?.citations.length
    ? chunks.findIndex((chunk) => chunk.chunk_id === generation.citations[0])
    : -1

  return (
    <Card title="Answer" icon={<MessageSquareText size={13} />} className="min-h-[22rem]">
      {busy && (
        <div className="flex flex-col gap-6">
          <Shimmer className="h-3 w-40" />
          <div className="flex flex-col gap-3">
            <Shimmer className="h-5 w-full" />
            <Shimmer className="h-5 w-[92%]" />
            <Shimmer className="h-5 w-[64%]" />
          </div>
          <Shimmer className="h-20 w-full rounded-[1.125rem]" />
          <p className="text-sm text-muted">Retrieving, then generating.</p>
        </div>
      )}

      {!busy && !result && (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 py-12 text-center">
          <MessageSquareText size={26} className="text-line" strokeWidth={1.5} />
          <p className="max-w-[46ch] text-[0.9375rem] leading-relaxed text-muted">
            Ask by voice or text. Every answer here is either supported by a passage the system can
            quote back to you, or it is refused with the reason it was refused.
          </p>
        </div>
      )}

      {/* A stage that failed outright (transcription is the one that realistically
          does) comes back 200 with `error` set and no answer. Without this branch
          the panel fell through to the success layout and rendered an empty answer
          under a green "Grounded" badge, which reads as the system confidently
          answering nothing. */}
      {!busy && result?.error && (
        <div className="flex animate-rise items-start gap-3.5 rounded-[1.125rem] bg-danger/6 p-5">
          <MicOff size={20} className="mt-0.5 shrink-0 text-danger" />
          <div>
            <p className="font-medium text-ink">That question could not be read.</p>
            <p className="mt-1.5 text-sm leading-relaxed text-muted">{result.error}</p>
          </div>
        </div>
      )}

      {!busy && result && !result.error && (
        <div className="flex flex-col gap-5">
          <p className="animate-rise text-sm text-muted">
            You asked <span className="text-ink">&ldquo;{result.query}&rdquo;</span>
          </p>

          {result.refused ? (
            <div className="animate-rise" style={{ animationDelay: '70ms' }}>
              <RefusalNotice result={result} />
            </div>
          ) : (
            <>
              <p
                className="max-w-[52ch] animate-rise text-[1.375rem] leading-[1.45] tracking-[-0.015em] text-balance text-ink md:text-[1.5rem]"
                style={{ animationDelay: '70ms' }}
              >
                {generation?.answer}
              </p>

              {generation?.evidence && (
                <figure
                  className="animate-rise rounded-r-[0.75rem] border-l-2 border-verified/45 bg-verified/5 py-4 pr-4 pl-4 md:pl-5"
                  style={{ animationDelay: '140ms' }}
                >
                  <div className="mb-2 flex items-center gap-1.5 text-[10px] font-medium tracking-[0.14em] text-verified uppercase">
                    <Quote size={11} />
                    Supporting passage
                    {citedIndex >= 0 && (
                      <span className="text-subtle normal-case">source {citedIndex + 1}</span>
                    )}
                  </div>
                  <blockquote className="max-w-[70ch] text-[0.9375rem] leading-relaxed text-ink/85 italic">
                    {generation.evidence}
                  </blockquote>
                  <figcaption className="mt-3 max-w-[70ch] text-xs leading-relaxed text-muted">
                    Copied from the retrieved passage by the model, then checked word for word
                    against the retrieved text before this answer was shown.
                  </figcaption>
                </figure>
              )}

              <div
                className="flex animate-rise flex-wrap items-center gap-2"
                style={{ animationDelay: '210ms' }}
              >
                <Badge variant="verified">
                  <CircleCheck size={12} />
                  Grounded
                </Badge>
                <Badge variant="outline">{generation?.provider}</Badge>
                <Confidence value={generation?.confidence ?? 0} />
              </div>
            </>
          )}
        </div>
      )}
    </Card>
  )
}
