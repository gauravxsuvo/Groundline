import type { HTMLAttributes, ReactNode } from 'react'
import { cn } from '../../lib/utils'

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  title?: string
  icon?: ReactNode
  action?: ReactNode
}

export function Card({ title, icon, action, className, children, ...props }: CardProps) {
  return (
    <div
      className={cn('rounded-2xl border border-line bg-panel p-5', className)}
      {...props}
    >
      {(title || action) && (
        <div className="mb-4 flex items-center justify-between gap-3">
          {title && (
            <h2 className="flex items-center gap-2 text-sm font-semibold tracking-wide text-muted uppercase">
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
