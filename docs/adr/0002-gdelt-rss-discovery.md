# ADR 0002 — Two-layer Discovery (GDELT primary, RSS fallback)

## Status
Accepted

## Context
The tool needs to find 5+ Czech Coverages of the same Story automatically. Several options were evaluated: NewsAPI (insufficient Czech source coverage — 2–3 outlets only), Google News RSS (excellent coverage but unofficial — Google can break it without notice), GDELT DOC API (free, 20+ Czech outlets, structured, `sourcelang:Czech` filter), direct RSS polling (free, reliable, covers 8 major outlets, no third-party dependency).

## Decision
Use GDELT DOC API as the primary Discovery layer. Poll RSS feeds of eight major Czech outlets (iDnes, Novinky, Aktuálně, ČT24, Seznam Zprávy, iRozhlas, Hospodářské noviny, Deník) as a fallback for stories published too recently to appear in GDELT's 15-minute index.

## Consequences
GDELT handles the majority of searches reliably and returns structured metadata including source domain. The RSS layer ensures breaking news (< 15 minutes old) is still discoverable without depending on an unofficial service.

The two-layer approach adds implementation complexity over a single source, but eliminates the availability risk of relying solely on GDELT (which has occasional downtime with no SLA).

Deduplication between layers: one Coverage per unique domain, first match wins.
