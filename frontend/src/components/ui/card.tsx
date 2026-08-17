import type { HTMLAttributes, ReactNode } from 'react'
import { cn } from '../../lib/utils'

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  title?: string
  icon?: ReactNode
  action?: ReactNode
}

/** A surface. Hairline border, no drop shadow.
 *
 *  Separation comes from the border and from the band the card sits on, not
 *  from elevation. Stacked shadows are what makes a page of panels look busy,
 *  and there is nothing here that is genuinely floating above anything else.
 */
export function Card({ title, icon, action, className, children, ...props }: CardProps) {
  return (
    <div
      className={cn(
        'flex flex-col rounded-[1.375rem] border border-line bg-paper p-5 md:p-6',
        className,
      )}
      {...props}
    >
      {(title || action) && (
        <div className="mb-5 flex min-h-6 items-center justify-between gap-3">
          {title && (
            <h2 className="flex items-center gap-2 text-[11px] font-medium tracking-[0.14em] text-subtle uppercase">
              {icon}
              {title}
            </h2>
          )}
          {action}
        </div>
      )}
      {children}
    </div>
  )
}
