# ADR 0040 — Browser-shaped article fetch for outlets that bot-block the honest UA

## Status
Accepted. Supersedes in part [ADR 0032](./0032-polite-scraping-small-scope.md) — specifically its
"An honest User-Agent" decision, for the article-body fetch path only.

## Context
ADR 0032 decided article fetches send an honest, contact-URL User-Agent
(`NewsTriangulator/1.0 (+…)`) and deferred any bot-block handling until "a real incident justifies"
it. Ticket 89 is that incident: two of the eight configured outlets fail extraction on every Review
Step, so an Admin pastes the article body in by hand each time.

Confirmed against the live sites (2026-08-28):

- **irozhlas.cz** sits behind Cloudflare and answers a request that doesn't look like a real
  browser navigation — the honest UA included — with `HTTP 403` (and a full-size decoy body, so it
  isn't obviously a block). A browser-shaped header set (real `User-Agent` + `Accept` +
  `Accept-Language` + `Sec-Fetch-*` + `Upgrade-Insecure-Requests`) gets `200`. It also rate-limits
  short bursts with a transient `403` that a brief backoff clears.
- **idnes.cz** `302`s every article URL to `/nastaveni-souhlasu` (a GDPR consent wall) until a
  consent choice is recorded as a cookie; `Cookie: dCMP=1` is that choice. Separately, idnes still
  serves `charset=windows-1250`, which undici's `Response.text()` (always UTF-8) mangles.
- The other six outlets return `200` under either UA, so a browser-shaped fetch doesn't regress
  them.

The honest UA was a *values* choice, not only a technical one (cf. ADR 0004's no-caching stance).
Reversing it for two outlets, and stepping through idnes's consent wall with a cookie, is a real
trade-off a future reader revisiting ADR 0032 must be able to find.

## Decision
Fetch **article bodies only** (`articleFetchClient.ts`, the function behind `confirmCoverages`'s
fan-out) with a browser-shaped request:

- A realistic desktop-Chrome `User-Agent` plus `Accept` / `Accept-Language` (Czech-first) /
  `Sec-Fetch-Dest|Mode|Site` / `Upgrade-Insecure-Requests`. This set is sent to **every** outlet,
  not just the two that need it — a per-outlet header matrix is more moving parts than the problem
  warrants, and the honest UA bought us nothing the six unaffected outlets care about.
- A per-host consent-cookie map (`CONSENT_COOKIE_BY_HOST`), matched by exact hostname or dotted
  suffix. One entry today: `idnes.cz → dCMP=1`. Adding another outlet's consent cookie is a
  one-line change.
- `403` joins `429`/`5xx` as retryable in `articleFetchClient`'s existing 3-attempt fixed-backoff
  loop — irozhlas's burst rate-limit is a transient `403`. A genuinely forbidden URL still fails,
  reported as `HTTP 403`, after the 3 attempts.
- Charset-aware body decode: read the `Content-Type` charset, `TextDecoder(charset)`, fall back to
  UTF-8 for an unknown/absent/unparseable label.

**Everything else keeps the honest UA.** `httpClient.ts`'s `NEWS_TRIANGULATOR_USER_AGENT` is
unchanged and stays the default for `fetchWithTimeout`; the Wikidata and Wikimedia clients — APIs
that *ask* for a contact UA and don't bot-block — are untouched. `gdeltClient.ts` and `rss.ts` are
untouched (as in ADR 0032).

## Consequences
- The app now presents itself as a browser to news outlets on the article-fetch path. It still
  identifies honestly to the Wikimedia/Wikidata APIs. robots.txt is still not consulted (ADR 0032)
  — the generic `User-agent: *` blocks on the outlets checked there were permissive on article
  paths regardless of UA.
- ADR 0032's line-27 latency concern is slightly widened: a hard `403` (fast response, not a
  timeout) now costs 3 attempts × (~fast + 1s + 2s backoff) ≈ 3s extra on the synchronous
  `confirmCoverages` path, on top of the `429`/`5xx` case already noted there. Still bounded, still
  tolerable at today's traffic; the same "move the scrape loop off the request path" escape hatch
  applies if it ever bites.
- The consent-cookie and browser-header lists are maintenance surface: an outlet can change its
  consent-cookie name or tighten its bot detection, and the failure mode is the pre-ticket-89 one
  (extraction fails, Admin pastes text). That's a visible, non-silent degradation with a manual
  fallback already in the UI — acceptable without monitoring.
- If a third outlet needs bot-block handling beyond a cookie (a JS challenge, say), that's the
  point to reconsider a real headless-fetch path — not to keep growing per-host special cases here.
