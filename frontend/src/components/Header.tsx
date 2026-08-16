import { Mark } from './Mark'

export function Header() {
  return (
    <header className="border-b border-line">
      <div className="mx-auto flex w-full max-w-[1600px] items-center gap-3 px-4 py-5 md:px-8">
        <Mark size={30} />
        <div>
          <div className="text-lg font-semibold tracking-tight text-ink">Groundline</div>
          <div className="hidden text-xs text-muted sm:block">Answers that show their work.</div>
        </div>
      </div>
    </header>
  )
}
