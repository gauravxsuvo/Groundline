import { useEffect, useState } from 'react'
import type { Meta } from '../lib/api'
import { Mark } from './Mark'

const LINKS = [
  { href: '#ask', label: 'Try it' },
  { href: '#numbers', label: 'Numbers' },
  { href: '#pipeline', label: 'Pipeline' },
]

/** Fixed, and transparent until the page moves.
 *
 *  Over the hero there is nothing to separate it from, so the border and the
 *  blurred backing only appear once content is passing underneath. Both
 *  transition rather than snapping, which is the difference between the bar
 *  feeling attached to the page and feeling bolted on top of it.
 */
export function Nav({ meta }: { meta: Meta | null }) {
  const [lifted, setLifted] = useState(false)

  useEffect(() => {
    const onScroll = () => setLifted(window.scrollY > 12)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 border-b transition-colors duration-500 ease-smooth ${
        lifted
          ? 'border-line bg-paper/75 backdrop-blur-xl backdrop-saturate-150'
          : 'border-transparent bg-transparent'
      }`}
    >
      <nav className="gutter flex h-16 w-full items-center gap-8 md:h-[4.5rem]">
        <a href="#top" className="flex shrink-0 items-center gap-2.5" aria-label="Groundline, back to top">
          <Mark size={26} />
          <span className="text-[0.9375rem] font-semibold tracking-[-0.02em] text-ink">
            Groundline
          </span>
        </a>

        <ul className="hidden items-center gap-7 text-sm text-muted md:flex">
          {LINKS.map((link) => (
            <li key={link.href}>
              <a
                href={link.href}
                className="transition-colors duration-200 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent-ink"
              >
                {link.label}
              </a>
            </li>
          ))}
        </ul>

        {/* Proof that the index behind the demo is actually loaded, not a claim
            in copy. Drops off narrow screens before the links do. */}
        <div className="ml-auto hidden items-center gap-2 rounded-full border border-line bg-paper/60 py-1.5 pr-3.5 pl-3 text-xs text-muted sm:flex">
          <span className="relative flex h-1.5 w-1.5 shrink-0">
            {meta && (
              <span
                className="absolute inline-flex h-full w-full animate-breathe rounded-full bg-verified"
                aria-hidden="true"
              />
            )}
            <span
              className={`relative inline-flex h-1.5 w-1.5 rounded-full ${meta ? 'bg-verified' : 'bg-subtle'}`}
            />
          </span>
          {meta ? (
            <>
              <span>index live</span>
              <span className="hidden h-3 w-px bg-line lg:inline-block" aria-hidden="true" />
              <span className="hidden tabular-nums lg:inline">
                {meta.chunk_count.toLocaleString()} chunks
              </span>
              <span className="hidden font-mono text-[11px] text-subtle xl:inline">
                {meta.strategy}
              </span>
            </>
          ) : (
            <span>connecting</span>
          )}
        </div>
      </nav>
    </header>
  )
}
