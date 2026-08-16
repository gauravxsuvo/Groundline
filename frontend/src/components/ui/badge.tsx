import type { HTMLAttributes } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../../lib/utils'

const badgeVariants = cva(
  'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium',
  {
    variants: {
      variant: {
        success: 'bg-accent/12 text-accent',
        muted: 'bg-line/50 text-muted',
        danger: 'bg-danger/10 text-danger',
      },
    },
    defaultVariants: { variant: 'muted' },
  },
)

interface BadgeProps extends HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />
}
