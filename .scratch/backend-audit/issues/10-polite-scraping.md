# 10 — Polite scraping: robots.txt, rate limiting, backoff

Type: grilling
Status: open
Blocked by: none — can start immediately

## Question

Spun out of [Source identity: adopt Source/SourceFeed now?](02-source-identity-model.md) — **P1-13** confirmed real while investigating that ticket: `articleScraper.ts`/`articleFetchClient.ts` have no robots.txt check, no per-host rate limiting, and no retry/backoff on failure. Every fetch (seed scrape, custom URL, Discovery candidate, Ingestion RSS item) goes straight to the network with no politeness layer at all.

The `Source` model (now shipped) has room for this — the audit's §7.1 proposed `Source.honorRobots`/`Source.maxRps` fields — but this ticket didn't add them, since nothing would read/write them yet without this work.

Decide:

1. Is per-host politeness worth building now, given current request volume (one seed scrape at a time, RSS polling every 20 minutes across 8 feeds)? Or does it wait until Ingestion's fetch pattern actually causes a problem (rate-limited/blocked by an outlet)?
2. If building now: does it need the full token-bucket + robots.txt-cache design from the audit's §9.7 (`politeFetch`), or does a simpler fixed delay between requests to the same host cover today's actual risk?
3. Where do `honorRobots`/`maxRps`-equivalent settings live — new columns on `Source` (schema migration), or a global constant until a Source ever needs its own override?
4. Retry/backoff on transient failures (429/5xx) — same ticket, or split further?
