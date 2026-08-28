# 89 — idnes.cz and irozhlas.cz article text has to be pasted in by hand every time

**Type:** bug

**What to resolve:** User report (verbatim): "we have to tweak getting source texts when accepting
analysis, because idnes a irozhlas I have to past it every time." On the Review Step (`/review/:id`),
after an Admin confirms the sources, `confirmCoverages` → `scrapeForCoverage` → `fetchArticleHtml`
runs per Coverage. For idnes.cz and irozhlas.cz it reliably comes back `EXTRACTION_FAILED`, so the
Admin ends up pasting the article body into the manual-text box on every single analysis that
includes either outlet.

**Research done before filing this ticket** (2026-08-28, confirmed against the live sites, not
guessed):

- **idnes.cz — consent wall.** Every article URL `302`s to
  `idnes.cz/nastaveni-souhlasu?url=...` until a consent choice is recorded as a cookie. Sending
  `Cookie: dCMP=1` makes the article return `200` directly. (`cookie_consent`, `euconsent-v2`,
  `CookieConsent`, `gdpr` etc. all still `302` — `dCMP=1` is the one that works.)
- **idnes.cz — legacy encoding.** idnes serves `Content-Type: text/html; charset=windows-1250`.
  `fetchArticleHtml` does `await res.text()`, and undici's `Response.text()` **always decodes as
  UTF-8** regardless of the declared charset — so even past the consent wall, idnes body text comes
  back with mangled Czech diacritics. Node's `TextDecoder('windows-1250')` decodes it correctly
  (full-ICU is on by default). Every other configured outlet already serves UTF-8; idnes is the
  only windows-1250 holdout.
- **irozhlas.cz — Cloudflare bot block.** Returns `HTTP 403` (with a full-size decoy HTML body, so
  it's not obviously a block) to a request that doesn't look like a real browser navigation — the
  project's honest `NewsTriangulator/1.0 (+contact)` User-Agent included. A browser-shaped header
  set (real `User-Agent` + `Accept` + `Accept-Language` + `Sec-Fetch-*` + `Upgrade-Insecure-
  Requests`) gets `200`. It also rate-limits short bursts with a `403` that a brief backoff clears;
  `isRetryableStatus` in `articleFetchClient.ts` currently only retries `429`/`5xx`, not `403`.
- The other six configured outlets (aktualne, ČT24, Deník, HN, Novinky, Seznam Zprávy) return `200`
  under either User-Agent — a browser-shaped header set for article fetches doesn't regress them.
- Scope note: the browser User-Agent is deliberately **article-body fetches only**
  (`articleFetchClient.ts`). `httpClient.ts`'s `NEWS_TRIANGULATOR_USER_AGENT`, used by the Wikidata
  and Wikimedia clients, stays the honest contact UA — those APIs ask for it and don't bot-block.

**Blocked by:** none.

**Status:** todo

- [ ] `articleFetchClient.ts`: fetch article bodies with a browser-shaped header set (realistic
      `User-Agent`, `Accept`, `Accept-Language`, `Sec-Fetch-*`, `Upgrade-Insecure-Requests`) instead
      of the honest contact UA. Keep `httpClient.ts`'s `NEWS_TRIANGULATOR_USER_AGENT` and the
      Wikidata/Wikimedia clients on the honest UA — this change is scoped to article scraping.
- [ ] `articleFetchClient.ts`: a small per-host cookie map (hostname-suffix match) — `idnes.cz` →
      `dCMP=1` for now, structured so another outlet's consent cookie is a one-line addition.
- [ ] `articleFetchClient.ts`: decode the response body by its declared charset (read `Content-Type`,
      `TextDecoder(charset)`, fall back to UTF-8 on an unknown/absent label) instead of the
      always-UTF-8 `res.text()`.
- [ ] `articleFetchClient.ts`: add `403` to `isRetryableStatus` (keeps the existing 3-attempt fixed
      backoff / Retry-After handling) — irozhlas's burst rate-limit is a transient `403`.
- [ ] `fetchWithTimeout` (`httpClient.ts`) needs to accept a caller-supplied header set rather than
      hardcoding the single UA header; its existing callers (Wikidata/Wikimedia) keep today's
      behaviour by default.
- [ ] Tests: `fetchArticleHtml` sends the browser header set and the per-host cookie for an
      idnes.cz URL (and does *not* for an unrelated host); decodes a windows-1250 body correctly;
      retries a `403`. Update the existing "sends an honest User-Agent" test to the new contract.
      `httpClient` tests still show Wikidata/Wikimedia unchanged.
- [ ] Typecheck + full test suites pass. `/code-review` clean.
