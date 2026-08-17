import { useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ChevronLeft, ChevronRight } from 'lucide-react'

/**
 * PROTOTYPE-ONLY — throwaway UI-exploration switcher, not part of the shipped product.
 * Renders a floating variant picker gated on `?variant=`. Never rendered in production builds.
 * See ticket 26 (masthead/footer/login/component brand-identity round) for context.
 */
export interface PrototypeVariant {
  key: string
  label: string
}

export function PrototypeSwitcher({
  variants,
  paramName = 'variant',
}: {
  variants: PrototypeVariant[]
  paramName?: string
}) {
  const [searchParams, setSearchParams] = useSearchParams()
  const current = searchParams.get(paramName) ?? variants[0].key
  const index = Math.max(
    0,
    variants.findIndex((v) => v.key === current)
  )

  const go = (delta: number) => {
    const next = variants[(index + delta + variants.length) % variants.length]
    setSearchParams((prev) => {
      const copy = new URLSearchParams(prev)
      copy.set(paramName, next.key)
      return copy
    })
  }

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      if (
        target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
      ) {
        return
      }
      if (e.key === 'ArrowLeft') go(-1)
      if (e.key === 'ArrowRight') go(1)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index])

  if (import.meta.env.PROD) return null

  const activeVariant = variants[index]

  return (
    <div className="fixed bottom-4 left-1/2 z-[100] -translate-x-1/2 flex items-center gap-1 rounded-full border border-yellow-500/50 bg-black/90 px-2 py-1.5 text-white shadow-lg backdrop-blur">
      <button
        onClick={() => go(-1)}
        aria-label="Previous variant"
        className="rounded-full p-1.5 hover:bg-white/10"
      >
        <ChevronLeft size={16} />
      </button>
      <span className="px-2 text-xs font-mono">
        <span className="rounded bg-yellow-500 px-1.5 py-0.5 font-bold text-black">PROTOTYPE</span>{' '}
        {activeVariant.key} — {activeVariant.label}
      </span>
      <button
        onClick={() => go(1)}
        aria-label="Next variant"
        className="rounded-full p-1.5 hover:bg-white/10"
      >
        <ChevronRight size={16} />
      </button>
    </div>
  )
}

export const CHROME_PROTOTYPE_VARIANTS: PrototypeVariant[] = [
  { key: 'A', label: 'Two-Band Wire Masthead' },
  { key: 'B', label: 'BBC Global/Local, Lean Footer' },
  { key: 'C', label: 'Bloomberg Terminal Minimal' },
]

export function useChromeVariant(): 'A' | 'B' | 'C' {
  const [searchParams] = useSearchParams()
  const raw = searchParams.get('variant')
  return raw === 'B' || raw === 'C' ? raw : 'A'
}
