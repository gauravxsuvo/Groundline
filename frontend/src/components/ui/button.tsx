import type { ButtonHTMLAttributes } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../../lib/utils'

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 rounded-full font-medium transition-all duration-300 ease-smooth active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-ink',
  {
    variants: {
      variant: {
        // Ink rather than accent for the default action. White on the brand
        // orange is only 3.9:1, and reserving the accent for state (recording,
        // a highlighted figure) keeps it meaningful instead of decorative.
        primary: 'bg-ink text-paper hover:bg-ink/88',
        accent: 'bg-accent-ink text-paper hover:bg-accent-ink/90',
        outline: 'border border-line text-ink hover:border-ink/25 hover:bg-veil',
        ghost: 'text-muted hover:bg-veil hover:text-ink',
      },
      size: {
        default: 'h-11 px-5 text-sm',
        lg: 'h-12 px-6 text-[0.9375rem]',
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
