import { useEffect, useRef, type CSSProperties } from 'react'

export function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

/** Staggers a reveal. Small numbers only: the point is that a row of items
 *  arrives as a sequence rather than a block, not that the reader waits. */
export function delay(ms: number): CSSProperties {
  return { '--reveal-delay': `${ms}ms` } as CSSProperties
}

/** Reveals every `[data-reveal]` element inside a section as it scrolls in.
 *
 *  One intersection observer per section, not one per element: the section is
 *  the unit that enters the viewport, and a page of individually observed nodes
 *  costs more than it buys. Elements are unobserved once shown, so nothing
 *  re-animates on the way back up.
 *
 *  The mutation observer is not optional. Half this page renders from
 *  `GET /api/meta`, which lands after mount, and React swaps the new markup
 *  into the same section node rather than remounting it. Scanning only once on
 *  mount left those elements observed by nothing and stuck at opacity 0, which
 *  is a blank section rather than a missing animation.
 */
export function useRevealScope<T extends HTMLElement = HTMLElement>() {
  const ref = useRef<T>(null)

  useEffect(() => {
    const root = ref.current
    if (!root) return

    const show = (el: HTMLElement) => {
      el.dataset.reveal = 'shown'
    }

    // No observer support, or the reader asked for less motion: everything is
    // shown as it appears. The CSS also neutralises the hidden state under that
    // media query, so this is belt and braces rather than the only guard.
    const staticMode = typeof IntersectionObserver === 'undefined' || prefersReducedMotion()

    const intersection = staticMode
      ? null
      : new IntersectionObserver(
          (entries) => {
            for (const entry of entries) {
              if (!entry.isIntersecting) continue
              show(entry.target as HTMLElement)
              intersection?.unobserve(entry.target)
            }
          },
          // Fires a little before the element is fully in view, so the motion
          // finishes about when the reader's eye arrives.
          { threshold: 0.12, rootMargin: '0px 0px -6% 0px' },
        )

    const arm = (el: HTMLElement) => {
      if (el.dataset.reveal === 'shown') return
      if (intersection) intersection.observe(el)
      else show(el)
    }

    const scan = () => {
      if (root.hasAttribute('data-reveal')) arm(root)
      root.querySelectorAll<HTMLElement>('[data-reveal]').forEach(arm)
    }

    scan()

    // Coalesced to one scan per frame: a section re-renders on every keystroke
    // and every result, and each of those is a batch of mutations.
    let queued = 0
    const mutations = new MutationObserver(() => {
      if (queued) return
      queued = requestAnimationFrame(() => {
        queued = 0
        scan()
      })
    })
    mutations.observe(root, { childList: true, subtree: true })

    return () => {
      intersection?.disconnect()
      mutations.disconnect()
      if (queued) cancelAnimationFrame(queued)
    }
  }, [])

  return ref
}
