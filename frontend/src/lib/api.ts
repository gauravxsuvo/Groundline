export type GuardCategory = 'unsafe' | 'off_topic' | 'ungrounded'

export interface GuardResult {
  passed: boolean
  category: GuardCategory | null
  reason: string | null
}

export interface RetrievedChunk {
  chunk_id: string
  text: string
  score: number
  metadata: Record<string, unknown>
}

export interface RetrievalOutput {
  strategy: string
  chunks: RetrievedChunk[]
  top_score: number
  top_dense_score: number
  top_bm25_score: number
}

export type GenerationMode = 'extractive' | 'llm'

export interface GenerationOutput {
  answer: string
  citations: string[]
  grounded: boolean
  confidence: number
  mode: GenerationMode
  provider: string
}

export interface StageTiming {
  stage: string
  elapsed_ms: number
  ok: boolean
}

export interface PipelineResult {
  query: string
  error: string | null
  refused: boolean
  refusal_category: GuardCategory | null
  refusal_reason: string | null
  retrieval: RetrievalOutput | null
  generation: GenerationOutput | null
  output_guard: GuardResult | null
  timings: StageTiming[]
  total_elapsed_ms: number
}

async function unwrap(res: Response): Promise<PipelineResult> {
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    throw new Error(body?.detail ?? `request failed with status ${res.status}`)
  }
  return res.json()
}

export function runQuery(query: string): Promise<PipelineResult> {
  return fetch('/api/query', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  }).then(unwrap)
}

export function runAudio(blob: Blob, filename: string): Promise<PipelineResult> {
  const form = new FormData()
  form.append('file', blob, filename)
  return fetch('/api/audio', { method: 'POST', body: form }).then(unwrap)
}
