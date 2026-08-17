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
  /** The span the model copied out of the cited passage. Verified against the
   *  retrieved text by the backend's grounding guard before the answer is
   *  shown, so it is safe to present as the supporting quote. */
  evidence: string
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

export interface RetrievalLatency {
  p50_ms: number
  p70_ms: number
  p100_ms: number
  queries: number
}

export interface RetrievalQuality {
  recall_at_5: number
  mrr_at_5: number
  queries: number
}

export interface Meta {
  strategy: string
  chunk_count: number
  strategies_built: string[]
  top_k: number
  embedding_model: string
  stt_model: string
  generation_model: string
  fallback_model: string
  /** Stages that run in process. These are the ones the 200ms target covers. */
  local_stages: string[]
  /** Stages that leave the machine, reported but never counted against it. */
  network_stages: string[]
  benchmarks: {
    target_ms: number
    latency: RetrievalLatency
    quality: RetrievalQuality
  }
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

export async function fetchMeta(): Promise<Meta> {
  const res = await fetch('/api/meta')
  if (!res.ok) throw new Error(`meta request failed with status ${res.status}`)
  return res.json()
}

export function runAudio(blob: Blob, filename: string): Promise<PipelineResult> {
  const form = new FormData()
  form.append('file', blob, filename)
  return fetch('/api/audio', { method: 'POST', body: form }).then(unwrap)
}
