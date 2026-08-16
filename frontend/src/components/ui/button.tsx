import type { ButtonHTMLAttributes } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../../lib/utils'

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 rounded-full font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
  {
    variants: {
      variant: {
        primary: 'bg-ink text-paper hover:bg-ink/85',
        accent: 'bg-accent text-paper hover:bg-accent/90',
        outline: 'border border-line text-ink hover:bg-line/40',
        ghost: 'text-muted hover:text-ink hover:bg-line/40',
      },
      size: {
        default: 'h-11 px-5 text-sm',
        icon: 'h-11 w-11 shrink-0',
      },
    },
    defaultVariants: { variant: 'primary', size: 'default' },
  },
)

interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export function Button({ className, variant, size, ...props }: ButtonProps) {
  return <button className={cn(buttonVariants({ variant, size }), className)} {...props} />
}
