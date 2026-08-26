import { useEffect, useRef, useState } from 'react'
import { MessageCircle, Mail, Copy, Check } from 'lucide-react'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import { buildShareLinks } from '@/lib/shareLinks'

const COPY_CONFIRMATION_MS = 1800

// lucide-react's own Facebook/Twitter/Instagram brand icons are deprecated (removed in its v1.0
// — see https://github.com/lucide-icons/lucide/issues/670) and TypeScript already flags them as
// such; these are the standard, license-compatible glyphs (Font Awesome's "f" mark, simple-icons'
// current X wordmark and Instagram glyph) inlined directly rather than pulling in a whole
// brand-icon package for three paths. One shared shell (`currentColor` fill, so each inherits
// `.sharebar__btn`'s ink color like every other icon here) parameterized by path data — not three
// near-identical components (code review, ticket 81).
function BrandIcon({ size, path }: { size: number; path: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d={path} />
    </svg>
  )
}

const FACEBOOK_PATH =
  'M22 12.06C22 6.53 17.52 2 12 2S2 6.53 2 12.06c0 5 3.66 9.15 8.44 9.94v-7.03H7.9v-2.91h2.54V9.85c0-2.51 1.49-3.9 3.78-3.9 1.09 0 2.24.2 2.24.2v2.46h-1.26c-1.24 0-1.63.77-1.63 1.56v1.88h2.78l-.45 2.91h-2.33V22c4.78-.79 8.44-4.94 8.44-9.94z'

const X_PATH =
  'M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z'

const INSTAGRAM_PATH =
  'M12 2.163c3.204 0 3.584.012 4.85.07 1.366.062 2.633.334 3.608 1.308.974.974 1.246 2.241 1.308 3.608.058 1.266.07 1.646.07 4.85s-.012 3.584-.07 4.85c-.062 1.366-.334 2.633-1.308 3.608-.974.974-2.242 1.246-3.608 1.308-1.266.058-1.646.07-4.85.07s-3.584-.012-4.85-.07c-1.366-.062-2.633-.334-3.608-1.308-.974-.974-1.246-2.241-1.308-3.608-.058-1.266-.07-1.646-.07-4.85s.012-3.584.07-4.85c.062-1.366.334-2.633 1.308-3.608.974-.974 2.241-1.246 3.608-1.308 1.266-.058 1.646-.07 4.85-.07zM12 0C8.741 0 8.332.014 7.052.072 5.775.13 4.602.396 3.635 1.363c-.967.967-1.233 2.14-1.291 3.417C2.286 6.06 2.272 6.47 2.272 12s.014 5.94.072 7.22c.058 1.277.324 2.45 1.291 3.417.967.967 2.14 1.233 3.417 1.291 1.28.058 1.689.072 7.22.072s5.94-.014 7.22-.072c1.277-.058 2.45-.324 3.417-1.291.967-.967 1.233-2.14 1.291-3.417.058-1.28.072-1.689.072-7.22s-.014-5.94-.072-7.22c-.058-1.277-.324-2.45-1.291-3.417-.967-.967-2.14-1.233-3.417-1.291C15.94.014 15.531 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z'

function ShareIconButton({
  label,
  href,
  newTab = true,
  onClick,
  children,
}: {
  label: string
  href?: string
  /** False for the `mailto:` channel — unlike the social ones, a `mailto:` link never renders
   *  anything, so `target="_blank"` just leaves a stray empty tab behind after the OS mail client
   *  opens (code review, ticket 81). */
  newTab?: boolean
  onClick?: () => void
  children: React.ReactNode
}) {
  const content = href ? (
    <a
      className="btn btn--ghost sharebar__btn"
      href={href}
      {...(newTab ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
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

/** Instagram has no share-intent URL of its own (unlike Facebook/X/WhatsApp) — it's never exposed
 *  a `https://instagram.com/share?...`-style link a third-party site can navigate to, only
 *  Stories' own in-app link sticker. The real way a web page reaches Instagram is the OS-level
 *  share sheet (`navigator.share`, the Web Share API): on a phone with the Instagram app
 *  installed, Instagram Stories/Direct is one of the destinations that sheet offers. Feature-
 *  detected — unsupported browsers (most desktop ones) just don't get this button, never a dead
 *  one (user request, ticket 81). */
function supportsNativeShare(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.share === 'function'
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

  async function handleNativeShare() {
    try {
      await navigator.share({ title, url })
    } catch (err) {
      // AbortError: the reader closed the OS share sheet without picking anything -- routine, not
      // a failure to surface. Any other rejection (e.g. a permission denial) is swallowed the same
      // way the clipboard handler above swallows its own failures: there's no in-house error/toast
      // surface on this page to report into, and every other channel in this row still works, so
      // silently leaving this one button inert is preferable to introducing one.
      if (err instanceof Error && err.name === 'AbortError') return
    }
  }

  return (
    <div className="sharebar" role="group" aria-label="Sdílet článek">
      {supportsNativeShare() && (
        <ShareIconButton
          label="Sdílet přes systémovou nabídku (Instagram a další aplikace)"
          onClick={() => void handleNativeShare()}
        >
          <BrandIcon size={16} path={INSTAGRAM_PATH} />
        </ShareIconButton>
      )}
      <ShareIconButton label="Sdílet na Facebooku" href={links.facebook}>
        <BrandIcon size={16} path={FACEBOOK_PATH} />
      </ShareIconButton>
      <ShareIconButton label="Sdílet na X" href={links.x}>
        <BrandIcon size={16} path={X_PATH} />
      </ShareIconButton>
      <ShareIconButton label="Sdílet na WhatsAppu" href={links.whatsapp}>
        <MessageCircle size={16} aria-hidden="true" />
      </ShareIconButton>
      <ShareIconButton label="Sdílet e-mailem" href={links.email} newTab={false}>
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
