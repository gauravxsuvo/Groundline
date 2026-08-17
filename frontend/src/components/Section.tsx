import type { ReactNode } from 'react'
import { delay, useRevealScope } from '../lib/motion'
import { cn } from '../lib/utils'

interface SectionProps {
  id?: string
  /** Bands alternate between white and the off-white veil. The band itself runs
   *  edge to edge; only its contents are inset by the gutter. */
  tone?: 'paper' | 'veil'
  className?: string
  children: ReactNode
}

export function Section({ id, tone = 'paper', className, children }: SectionProps) {
  const ref = useRevealScope<HTMLElement>()

  return (
    <section
      id={id}
      ref={ref}
      className={cn('w-full', tone === 'veil' ? 'bg-veil' : 'bg-paper', className)}
    >
      <div className="gutter w-full">{children}</div>
    </section>
  )
}

/** Eyebrow, headline, and a paragraph of context, in that order every time.
 *
 *  The eyebrow says which part of the system this is, the headline states the
 *  claim, the paragraph backs it. A reviewer scanning only the headlines should
 *  still come away with the argument.
 */
export function SectionHeading({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string
  title: ReactNode
  children?: ReactNode
}) {
  return (
    <div className="max-w-[62ch]">
      <p
        className="text-[11px] font-medium tracking-[0.16em] text-accent-ink uppercase"
        data-reveal
      >
        {eyebrow}
      </p>
      <h2 className="mt-4 text-title text-balance text-ink" data-reveal style={delay(60)}>
        {title}
      </h2>
      {children && (
        <div className="mt-5 text-lede text-muted" data-reveal style={delay(120)}>
          {children}
        </div>
      )}
    </div>
  )
}
