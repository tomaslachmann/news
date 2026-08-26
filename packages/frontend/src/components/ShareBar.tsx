import { useEffect, useRef, useState } from 'react'
import { MessageCircle, Mail, Copy, Check } from 'lucide-react'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import { buildShareLinks } from '@/lib/shareLinks'

const COPY_CONFIRMATION_MS = 1800

// lucide-react's own Facebook/Twitter brand icons are deprecated (removed in its v1.0 — see
// https://github.com/lucide-icons/lucide/issues/670) and TypeScript already flags them as such;
// these two are the standard, license-compatible glyphs (Font Awesome's "f" mark, simple-icons'
// current X wordmark) inlined directly rather than pulling in a whole brand-icon package for two
// paths. `currentColor` fill so they inherit `.sharebar__btn`'s ink color like every other icon
// here.
function FacebookIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M22 12.06C22 6.53 17.52 2 12 2S2 6.53 2 12.06c0 5 3.66 9.15 8.44 9.94v-7.03H7.9v-2.91h2.54V9.85c0-2.51 1.49-3.9 3.78-3.9 1.09 0 2.24.2 2.24.2v2.46h-1.26c-1.24 0-1.63.77-1.63 1.56v1.88h2.78l-.45 2.91h-2.33V22c4.78-.79 8.44-4.94 8.44-9.94z" />
    </svg>
  )
}

function XIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  )
}

function ShareIconButton({
  label,
  href,
  onClick,
  children,
}: {
  label: string
  href?: string
  onClick?: () => void
  children: React.ReactNode
}) {
  const content = href ? (
    <a
      className="btn btn--ghost sharebar__btn"
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
    >
      {children}
    </a>
  ) : (
    <button type="button" className="btn btn--ghost sharebar__btn" onClick={onClick} aria-label={label}>
      {children}
    </button>
  )

  return (
    <Tooltip>
      <TooltipTrigger asChild>{content}</TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

/** Icon-only share row for the Article page (ticket 81) — Facebook/X/WhatsApp/e-mail are plain
 *  share-intent links (no JS SDK, no external library), "Kopírovat odkaz" is the one channel that
 *  needs actual JS (`navigator.clipboard`). Reuses `.btn.btn--ghost`, this codebase's existing
 *  icon-button treatment, rather than introducing a new button style. */
export function ShareBar({ title, url }: { title: string; url: string }) {
  const links = buildShareLinks(title, url)
  const [copied, setCopied] = useState(false)
  const resetTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => () => clearTimeout(resetTimer.current), [])

  async function handleCopyLink() {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      clearTimeout(resetTimer.current)
      resetTimer.current = setTimeout(() => setCopied(false), COPY_CONFIRMATION_MS)
    } catch {
      // Clipboard access can be denied (permissions, insecure context) -- the button just stays
      // unconfirmed rather than throwing; every other channel here still works.
    }
  }

  return (
    <div className="sharebar" role="group" aria-label="Sdílet článek">
      <ShareIconButton label="Sdílet na Facebooku" href={links.facebook}>
        <FacebookIcon size={16} />
      </ShareIconButton>
      <ShareIconButton label="Sdílet na X" href={links.x}>
        <XIcon size={16} />
      </ShareIconButton>
      <ShareIconButton label="Sdílet na WhatsAppu" href={links.whatsapp}>
        <MessageCircle size={16} aria-hidden="true" />
      </ShareIconButton>
      <ShareIconButton label="Sdílet e-mailem" href={links.email}>
        <Mail size={16} aria-hidden="true" />
      </ShareIconButton>
      <ShareIconButton
        label={copied ? 'Odkaz zkopírován' : 'Kopírovat odkaz'}
        onClick={() => void handleCopyLink()}
      >
        {copied ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
      </ShareIconButton>
    </div>
  )
}
