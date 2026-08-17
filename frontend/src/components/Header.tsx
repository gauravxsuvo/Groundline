import type { Meta } from '../lib/api'
import { Mark } from './Mark'

export function Header({ meta }: { meta: Meta | null }) {
  return (
    <header className="sticky top-0 z-10 border-b border-line bg-paper/85 backdrop-blur-sm">
      <div className="mx-auto flex w-full max-w-[1600px] items-center gap-3 px-4 py-4 md:px-8">
        <Mark size={30} />
        <div>
          <div className="text-lg leading-tight font-semibold tracking-tight text-ink">
            Groundline
          </div>
          <div className="hidden text-xs text-muted sm:block">Answers that show their work.</div>
        </div>

        {meta && (
          <div className="ml-auto hidden items-center gap-4 text-xs text-muted md:flex">
            <span className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-verified" aria-hidden="true" />
              index live
            </span>
            <span className="font-mono">{meta.strategy}</span>
            <span className="tabular-nums">{meta.chunk_count.toLocaleString()} chunks</span>
            <span className="hidden font-mono lg:inline">{meta.embedding_model}</span>
          </div>
        )}
      </div>
    </header>
  )
}
