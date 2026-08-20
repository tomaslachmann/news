import { useEffect, useRef } from 'react'
import styleguideHtml from './styleguide-content.html?raw'
import '@/components/Chrome.css'
import './AnalysisPage.css'
import './StyleguidePage.css'

// Ported verbatim from news_design's shared/data*.js, ds/ui.js, ds/admin.js, ds/styleguide.js —
// global-namespace scripts (window.NT / window.NTUI / window.NTAdmin) that populate the
// styleguide's token swatches, type scale, spacing scale and component demos by element id.
// Loaded in the reference's own script order (ticket 39: "cannot rot" means running the actual
// reference behavior, not a hand-reimplementation that could quietly drift from it).
// shared/switcher.js/.css (a variant-comparison bar for browsing the design exploration's other
// mockup files) is deliberately not ported — it's mockup-browsing tooling, not part of the system.
const SCRIPTS = [
  '/styleguide-assets/data.js',
  '/styleguide-assets/data2.js',
  '/styleguide-assets/data3.js',
  '/styleguide-assets/data4.js',
  '/styleguide-assets/ui.js',
  '/styleguide-assets/admin.js',
  '/styleguide-assets/styleguide.js',
]

function loadScriptsSequentially(srcs: string[]): () => void {
  const elements: HTMLScriptElement[] = []
  let cancelled = false

  ;(async () => {
    for (const src of srcs) {
      if (cancelled) return
      await new Promise<void>((resolve, reject) => {
        const el = document.createElement('script')
        el.src = src
        el.onload = () => resolve()
        el.onerror = () => reject(new Error(`Failed to load ${src}`))
        document.body.appendChild(el)
        elements.push(el)
      })
    }
  })().catch((err: unknown) => console.error('Styleguide asset failed to load', err))

  return () => {
    cancelled = true
    for (const el of elements) el.remove()
  }
}

/** Ticket 39: `styleguide.html` ported as a dev-only route so it can't drift from
 *  DESIGN-SYSTEM.md's living reference. `dangerouslySetInnerHTML` renders the reference markup
 *  verbatim (a hand-transcription into JSX risks silent divergence, exactly what this route
 *  exists to prevent) — styled by the same tokens.css/base.css already loaded globally, plus
 *  Chrome.css (imported explicitly here since this route sits outside `<Chrome>` — see App.tsx)
 *  and every other colocated component CSS file the real app itself uses. As more screens are
 *  ported, their CSS imports join this page too, so it never needs its own separate copy. */
export default function StyleguidePage() {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    return loadScriptsSequentially(SCRIPTS)
  }, [])

  return <div ref={containerRef} dangerouslySetInnerHTML={{ __html: styleguideHtml }} />
}
