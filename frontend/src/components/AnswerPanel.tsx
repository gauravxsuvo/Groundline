import {
  CircleCheck,
  Loader2,
  MessageSquareText,
  MicOff,
  ShieldAlert,
  SearchX,
  ShieldQuestion,
} from 'lucide-react'
import type { PipelineResult } from '../lib/api'
import { Card } from './ui/card'
import { Badge } from './ui/badge'

function RefusalNotice({ result }: { result: PipelineResult }) {
  const category = result.refusal_category

  if (category === 'unsafe') {
    return (
      <div className="flex items-start gap-3 rounded-xl bg-danger/8 p-4">
        <ShieldAlert size={20} className="mt-0.5 shrink-0 text-danger" />
        <div>
          <p className="font-medium text-ink">This request was declined.</p>
          <p className="mt-1 text-sm text-muted">The input matched an unsafe content pattern and was blocked before retrieval.</p>
        </div>
      </div>
    )
  }

  if (category === 'off_topic') {
    return (
      <div className="flex items-start gap-3 rounded-xl bg-line/40 p-4">
        <SearchX size={20} className="mt-0.5 shrink-0 text-muted" />
        <div>
          <p className="font-medium text-ink">Nothing relevant found.</p>
          <p className="mt-1 text-sm text-muted">
            This question doesn't overlap with the indexed corpus, so no answer was generated.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start gap-3 rounded-xl bg-line/40 p-4">
        <ShieldQuestion size={20} className="mt-0.5 shrink-0 text-muted" />
        <div>
          <p className="font-medium text-ink">Not enough grounded evidence.</p>
          <p className="mt-1 text-sm text-muted">
            Relevant passages were retrieved, but the generated answer didn't hold up against them, so it was
            withheld rather than shown as fact.
          </p>
        </div>
      </div>
      {result.generation?.answer && (
        <p className="rounded-xl border border-dashed border-line px-4 py-3 text-sm text-muted italic line-through decoration-muted/60">
          {result.generation.answer}
        </p>
      )}
    </div>
  )
}

export function AnswerPanel({ result, busy }: { result: PipelineResult | null; busy: boolean }) {
  return (
    <Card title="Answer" icon={<MessageSquareText size={14} />} className="min-h-64">
      {busy && (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 py-16 text-muted">
          <Loader2 size={24} className="animate-spin" />
          <p className="text-sm">Retrieving and generating...</p>
        </div>
      )}

      {!busy && !result && (
        <div className="flex flex-col items-center justify-center gap-2 py-16 text-center text-muted">
          <MessageSquareText size={28} className="opacity-40" />
          <p className="text-sm">Ask a question by voice or text to see a grounded answer here.</p>
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
        <div className="flex flex-col gap-4">
          <p className="text-sm text-muted">
            You asked <span className="text-ink">&ldquo;{result.query}&rdquo;</span>
          </p>

          {result.refused ? (
            <RefusalNotice result={result} />
          ) : (
            <>
              <p className="text-lg leading-relaxed text-ink">{result.generation?.answer}</p>
              <div className="flex flex-wrap gap-2">
                <Badge variant="success">
                  <CircleCheck size={13} />
                  Grounded
                </Badge>
                <Badge variant="muted">{result.generation?.provider}</Badge>
                <Badge variant="muted">
                  confidence {Math.round((result.generation?.confidence ?? 0) * 100)}%
                </Badge>
              </div>
            </>
          )}
        </div>
      )}
    </Card>
  )
}
