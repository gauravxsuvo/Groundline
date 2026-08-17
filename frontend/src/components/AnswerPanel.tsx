import {
  CircleCheck,
  Loader2,
  MessageSquareText,
  MicOff,
  Quote,
  ShieldAlert,
  SearchX,
  ShieldQuestion,
} from 'lucide-react'
import type { PipelineResult } from '../lib/api'
import { Card } from './ui/card'
import { Badge } from './ui/badge'

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
      className={`flex items-start gap-3 rounded-xl p-4 ${tone === 'danger' ? 'bg-danger/8' : 'bg-line/40'}`}
    >
      <span className={`mt-0.5 shrink-0 ${tone === 'danger' ? 'text-danger' : 'text-muted'}`}>
        {icon}
      </span>
      <div>
        <p className="font-medium text-ink">{title}</p>
        <p className="mt-1 text-sm leading-relaxed text-muted">{body}</p>
        <p className="mt-2 font-mono text-[11px] text-muted/80">{guard}</p>
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
        <p className="rounded-xl border border-dashed border-line px-4 py-3 text-sm text-muted italic line-through decoration-muted/60">
          {result.generation.answer}
        </p>
      )}
    </div>
  )
}

function Confidence({ value }: { value: number }) {
  const pct = Math.round(value * 100)
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-line/50 px-2.5 py-1 text-xs font-medium text-muted">
      confidence
      <span className="h-1 w-10 overflow-hidden rounded-full bg-line">
        <span
          className="block h-full rounded-full bg-muted/70"
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
    <Card title="Answer" icon={<MessageSquareText size={14} />} className="min-h-64">
      {busy && (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 py-16 text-muted">
          <Loader2 size={24} className="animate-spin" />
          <p className="text-sm">Retrieving, then generating.</p>
        </div>
      )}

      {!busy && !result && (
        <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
          <MessageSquareText size={28} className="text-muted opacity-40" />
          <p className="max-w-md text-sm leading-relaxed text-muted">
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
        <div className="flex items-start gap-3 rounded-xl bg-danger/8 p-4">
          <MicOff size={20} className="mt-0.5 shrink-0 text-danger" />
          <div>
            <p className="font-medium text-ink">That question could not be read.</p>
            <p className="mt-1 text-sm text-muted">{result.error}</p>
          </div>
        </div>
      )}

      {!busy && result && !result.error && (
        <div className="flex animate-rise flex-col gap-4">
          <p className="text-sm text-muted">
            You asked <span className="text-ink">&ldquo;{result.query}&rdquo;</span>
          </p>

          {result.refused ? (
            <RefusalNotice result={result} />
          ) : (
            <>
              <p className="text-lg leading-relaxed text-ink md:text-xl">{generation?.answer}</p>

              {generation?.evidence && (
                <figure className="rounded-xl border-l-2 border-verified/50 bg-verified/6 py-3 pr-4 pl-4">
                  <div className="mb-1.5 flex items-center gap-1.5 text-xs font-medium tracking-wide text-verified uppercase">
                    <Quote size={12} />
                    Supporting passage
                    {citedIndex >= 0 && <span className="text-muted">source {citedIndex + 1}</span>}
                  </div>
                  <blockquote className="text-sm leading-relaxed text-ink/85 italic">
                    {generation.evidence}
                  </blockquote>
                  <figcaption className="mt-2 text-xs text-muted">
                    Copied from the retrieved passage by the model, then checked word for word
                    against the retrieved text before this answer was shown.
                  </figcaption>
                </figure>
              )}

              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="verified">
                  <CircleCheck size={13} />
                  Grounded
                </Badge>
                <Badge variant="muted">{generation?.provider}</Badge>
                <Confidence value={generation?.confidence ?? 0} />
              </div>
            </>
          )}
        </div>
      )}
    </Card>
  )
}
