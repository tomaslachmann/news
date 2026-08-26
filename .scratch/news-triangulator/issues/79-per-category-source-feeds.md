# 79 — Per-category `SourceFeed` configuration for iRozhlas/iDnes

**Type:** feature

**What to resolve:** Follow-up from ticket 77's grilling session. iRozhlas and iDnes both expose
real per-category RSS feeds, but their *currently-configured* `SourceFeed` rows point at all-articles
feeds with zero inline `<category>` signal (both were deliberately widened by
`20260820133322_add_feed_parser_kind_and_source_fixes`) — so unlike ticket 78's 6 sources, these two
can only be categorized via feed-implied categorization (`SourceFeed.category`, added in ticket 78),
not per-item tags.

Confirmed real feed URLs (ticket 77's research) for iRozhlas: `/section/zpravy-domov` (domestic),
`/section/zpravy-svet` (world), `/section/ekonomika`, `/section/sport`, `/section/kultura`,
`/section/veda-technologie`, `/section/komentare`, `/section/zivotni-styl`, plus a fact-check tag
feed and 14 regional feeds. iDnes uses a `?c=` query-parameter scheme (e.g. the pre-widening config
used `?c=zpravy`) — the exact set of category values wasn't confirmed in ticket 77's research pass
(its RSS index page didn't load) and needs its own lookup before this ticket can proceed.

**Blocked by:** 78 (needs `SourceFeed.category` to exist on the schema).

**Status:** ready-for-agent

- [x] Confirm iDnes's actual `?c=` category value set (ticket 77's research didn't get this far —
      `servis.idnes.cz`/`www.idnes.cz` didn't load for that research pass; try again, or find their
      RSS documentation page another way).
- [x] Decide per source: replace the single all-articles `SourceFeed` with N per-category feeds, or
      keep the all-articles feed *and* add per-category ones (risking the same article arriving via
      two feeds — check whether existing ingestion dedup, keyed on article URL, already handles this
      for free before treating it as a new problem).
- [x] Map each new feed's `ArticleCategory` — reuse the same enum ticket 78 defines, don't invent
      per-source-specific values (e.g. iRozhlas's `zivotni-styl`/`komentare`/regional feeds may not
      cleanly map to an existing enum value; decide null-vs-best-fit per case, don't silently drop a
      feed's articles as fully uncategorized without checking whether ticket 78's enum needs a real
      value added for one of these first).
- [x] Migration adding the new `SourceFeed` rows (raw SQL, matching this codebase's existing
      convention for `Source`/`SourceFeed` — see `20260818140000_add_source_identity`/
      `20260820133322_add_feed_parser_kind_and_source_fixes`), each with its `category` set.
- [x] Tests: whatever ticket 78's ingestion path needs to also honor `SourceFeed.category` (a
      Coverage from a feed with a set `category` uses it directly, no per-item mapping-table lookup
      needed) — check ticket 78's actual implementation for exactly where this branch belongs.
- [x] Typecheck + full test suites pass. `/code-review` clean.
