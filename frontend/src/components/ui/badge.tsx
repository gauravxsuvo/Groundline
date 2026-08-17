import type { HTMLAttributes } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../../lib/utils'

const badgeVariants = cva(
  'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium tracking-[0.01em]',
  {
    variants: {
      variant: {
        verified: 'bg-verified/10 text-verified',
        accent: 'bg-accent/12 text-accent-ink',
        muted: 'bg-veil text-muted',
        outline: 'border border-line text-muted',
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
