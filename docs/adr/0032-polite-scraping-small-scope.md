# ADR 0032 — Polite scraping: small scope now, not the audit's full `politeFetch` design

## Status
Accepted

## Context
`docs/audit.md` P1-13 (§9.7) found no politeness layer anywhere in the fetch path: `articleFetchClient.ts` has a 12s timeout and a static User-Agent, nothing else — no robots.txt check, no rate limiting, no retry/backoff. The audit's proposed fix, `politeFetch`, is a per-host token bucket (`Source.maxRps`) plus a 24h-TTL robots.txt LRU cache plus a 3-attempt `Retry-After`-aware backoff, all gated by new `Source.honorRobots`/`Source.maxRps` columns.

[Ticket 10](../../.scratch/backend-audit/issues/10-polite-scraping.md)'s own grilling session found the actual risk narrower than the audit's framing suggests: today's only unbounded fan-out is `confirmCoverages` (`analysisService.ts`) firing `Promise.allSettled` over every PENDING Coverage on an Analysis with no concurrency cap — a 25-Coverage draft means 25 simultaneous fetches, possibly to the same host, from one UA, in one second. Everything else in the fetch path is either already small and fixed (RSS polling: 8–13 feeds every 20 minutes) or out of scope for this ticket entirely (GDELT, which needs its own `latest.txt`-then-CSV flow, not a single-URL fetch).

Robots.txt on the target outlets is not hypothetical — `ceskenoviny.cz` and `denik.cz` were checked directly and both explicitly `Disallow` named AI agents (`ClaudeBot`, `anthropic-ai`, `GPTBot`, and others) — but the generic `User-agent: *` block this app's own UA falls under is permissive on the article/feed paths this app actually fetches.

## Decision
Ship the narrow fix for the one confirmed risk, not the audit's general-purpose crawler-politeness layer:

- A fixed 4-concurrent-fetch cap on `confirmCoverages`'s scrape loop. No per-host limiting — the global cap already throttles the case where two Coverage rows happen to share a host.
- Retry on HTTP 429/5xx, up to 3 attempts total, honoring `Retry-After` when the response sends one, else a fixed 1s/2s backoff (no jitter — request volume here is far below the scale jitter exists to protect against).
- An honest User-Agent: `NewsTriangulator/1.0 (+https://github.com/tomaslachmann/news)`, replacing the old contact-free string.
- No robots.txt check. No per-host token bucket. No new `Source.honorRobots`/`Source.maxRps` columns — the concurrency cap and retry policy are fixed constants in the fetch wrapper, not per-`Source` configuration, since nothing today needs an override.
- Only `articleFetchClient.ts` is wrapped (the function behind `confirmCoverages`'s fan-out). `gdeltClient.ts` and `rss.ts`'s use of `rss-parser` are untouched.

## Consequences
- `confirmCoverages`'s worst case drops from "N simultaneous requests to N hosts" to "at most 4 concurrent, regardless of N" — the actual problem this ticket set out to fix.
- A sustained-load or robots.txt-compliance problem (an outlet actually rate-limiting or blocking this app) is not prevented by this change — it's deferred, deliberately, until a real incident justifies the audit's fuller per-host token-bucket/robots-cache design. Building that now, against zero observed load, would be exactly the kind of speculative infrastructure this project's [CLAUDE.md](../../CLAUDE.md) and ADR 0009 already argue against.
- `Source.honorRobots`/`Source.maxRps` remain unadded. A future ticket that does build the full `politeFetch` design starts from a clean slate on those columns, not a half-used pair of flags nothing has exercised.
- GDELT's fetch path (`gdeltClient.ts`) stays exactly as unprotected as it was before this ticket. It needs a `latest.txt` → CSV-download flow before "politeness" is even a well-formed question for it — a distinct future ticket, not a gap this one silently leaves unlabeled.
- **`confirmCoverages`'s worst-case latency goes up, not just down.** The old code's worst case was bounded by one 12s timeout (all fetches ran in parallel); the new code trades that for a lower concurrent-request ceiling at the cost of a higher worst-case wall-clock time when many Coverage rows hit a slow, erroring host: up to 3 attempts × (12s timeout + backoff) per item, in rounds of 4, before `confirmCoverages` (a synchronous PATCH handler) returns. A caught-by-review-not-by-design-session trade-off: the concurrency cap and retry count were both explicit decisions (this ADR's own numbers), but their multiplicative interaction on total request latency wasn't weighed against each other at decision time. Accepted here rather than re-opened, since a multi-minute admin-triggered request is a real but tolerable cost at today's traffic, not a correctness bug — revisit if it ever actually blocks an admin, e.g. by moving the scrape loop off the request path entirely (a job, matching tickets 14/15/17's pattern) rather than tuning these two numbers against each other.
