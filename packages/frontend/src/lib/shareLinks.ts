/** Share-intent URLs for ArticlePage.tsx's ShareBar (ticket 81) — every real channel here is a
 *  plain, no-SDK link the browser just navigates to (a new tab for the social ones, the mail
 *  client for `mailto:`); "copy link" is the only channel with no URL of its own, handled
 *  entirely in the component via `navigator.clipboard`. Pure string-building, no DOM/network
 *  access, so it's unit-testable directly — this frontend has no component-render test infra (see
 *  ticket 76's own Implementation notes). */
export interface ShareLinks {
  facebook: string
  x: string
  whatsapp: string
  email: string
}

export function buildShareLinks(title: string, url: string): ShareLinks {
  const encodedUrl = encodeURIComponent(url)
  const encodedTitle = encodeURIComponent(title)

  return {
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`,
    x: `https://twitter.com/intent/tweet?url=${encodedUrl}&text=${encodedTitle}`,
    whatsapp: `https://api.whatsapp.com/send?text=${encodedTitle}%20${encodedUrl}`,
    email: `mailto:?subject=${encodedTitle}&body=${encodedUrl}`,
  }
}
