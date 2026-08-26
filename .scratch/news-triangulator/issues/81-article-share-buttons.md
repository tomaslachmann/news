# 81 — Sharing channels on the Article detail page

**Type:** feature

**What to resolve:** User request: the Article page (`/article/:id`) needs share buttons for
common channels, styled to this codebase's own design system (`ds/`), not a stock widget. No
external share-widget library needed — every real channel here (Facebook, X, WhatsApp, e-mail) is
just a plain, no-JS-SDK share-intent URL; only "copy link" needs any JS at all (`navigator.clipboard`).
`lucide-react` (already a dependency) already ships brand icons for Facebook/Twitter, plus generic
Mail/MessageCircle/Copy/Check icons — no new dependency required.

**Blocked by:** none.

**Status:** ready-for-agent

- [x] `lib/shareLinks.ts`: pure function(s) building each channel's share-intent URL from a title +
      absolute URL (Facebook, X/Twitter, WhatsApp, e-mail `mailto:`) — properly URL-encoded. No
      network/DOM access, so it's unit-testable directly (this frontend has no component-render
      test infra — see ticket 76's own Implementation notes — pure logic is what's actually tested).
- [x] `components/ShareBar.tsx`: renders one icon-only ghost button (`.btn.btn--ghost`, the existing
      icon-button treatment) per channel, each wrapped in the existing Radix `Tooltip` naming the
      channel, plus a real `aria-label` on the button itself. External channels open
      `target="_blank" rel="noopener noreferrer"`; e-mail is a plain `mailto:` navigation. "Copy
      link" is a real button (not an `<a>`) that writes the URL via `navigator.clipboard.writeText`
      and swaps its icon to a checkmark for a couple of seconds as confirmation.
- [x] Wire `ShareBar` into `ArticlePage.tsx`'s `.arthead`, using the current page's own URL
      (`window.location.href`) and the Article's resolved title. Small CSS addition
      (`AnalysisPage.css`, the sole consumer today — matches this codebase's own "extract to
      `ds/components.css` only once a class is about to be duplicated a third time" convention).
- [x] Tests: `shareLinks.ts`'s URL-building (correct encoding of a title/URL with spaces and special
      characters, one test per channel).
- [x] Manually verify in the running dev app — see Implementation notes: no real COMPLETE Article
      exists in this dev DB to click through, so full click-through verification wasn't possible;
      did what actually was (Vite transforms both new files with no errors, real Node-verified URL
      encodings).
- [x] Typecheck + full test suites pass. `/code-review` clean.

## Implementation notes

**`lucide-react`'s own Facebook/Twitter icons turned out to be deprecated** — TypeScript flags
both (`@deprecated`, removed in lucide's v1.0 — [lucide-icons/lucide#670](https://github.com/lucide-icons/lucide/issues/670)).
Used two small inlined `currentColor` SVGs instead (Font Awesome's "f" mark, simple-icons' current
X wordmark — both standard, license-compatible glyphs) rather than either shipping a
soon-to-break icon or pulling in a whole brand-icon package for two paths. Every other icon
(Mail/MessageCircle/Copy/Check) is a real, non-deprecated `lucide-react` icon.

**Full browser click-through wasn't achievable this round** — `GET /api/articles` returns zero
items in this dev DB (no real COMPLETE Analysis exists to categorize or, here, to share). Verified
what was actually possible instead: Vite transforms `ArticlePage.tsx`/`ShareBar.tsx` with no
compile/import errors, `tsc --noEmit` is clean, and every share URL's exact encoding (Czech
diacritics, spaces, `&`, `?`/`=` in the target URL) is verified against Node's own
`encodeURIComponent` in `shareLinks.test.ts`, not hand-computed.
