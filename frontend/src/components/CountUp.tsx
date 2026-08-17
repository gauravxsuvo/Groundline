import { useEffect, useRef, useState } from 'react'
import { prefersReducedMotion } from '../lib/motion'

interface CountUpProps {
  value: number
  decimals?: number
  /** Thousands separators. Off for millisecond figures, on for corpus counts. */
  grouped?: boolean
  durationMs?: number
}

function format(value: number, decimals: number, grouped: boolean): string {
  return value.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
    useGrouping: grouped,
  })
}

/** Counts a measured figure up when it scrolls into view.
 *
 *  The final value is rendered underneath at full width and the animating copy
 *  sits on top of it, so the number never changes the width of its column
 *  mid-count and nothing around it moves. Screen readers get the final value
 *  only; the animating copy is hidden from them.
 */
export function CountUp({ value, decimals = 0, grouped = false, durationMs = 1000 }: CountUpProps) {
  const ref = useRef<HTMLSpanElement>(null)
  const [shown, setShown] = useState(value)

  useEffect(() => {
    const node = ref.current
    if (!node) return

    if (typeof IntersectionObserver === 'undefined' || prefersReducedMotion()) {
      setShown(value)
      return
    }

    let frame = 0
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return
        observer.disconnect()

        const started = performance.now()
        const step = (now: number) => {
          const t = Math.min(1, (now - started) / durationMs)
          // Same decelerating shape as the reveal easing, so the numbers and
          // the panels they sit in settle together.
          setShown(value * (1 - Math.pow(1 - t, 3)))
          if (t < 1) frame = requestAnimationFrame(step)
        }
        frame = requestAnimationFrame(step)
      },
      { threshold: 0.4 },
    )

    setShown(0)
    observer.observe(node)
    return () => {
      observer.disconnect()
      cancelAnimationFrame(frame)
    }
  }, [value, durationMs])

  return (
    <span ref={ref} className="relative inline-block tabular-nums">
      <span className="opacity-0">{format(value, decimals, grouped)}</span>
      <span className="absolute inset-0" aria-hidden="true">
        {format(shown, decimals, grouped)}
      </span>
    </span>
  )
}
