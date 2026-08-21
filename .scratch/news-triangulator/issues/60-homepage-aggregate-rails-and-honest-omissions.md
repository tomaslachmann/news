# 60 — Homepage aggregate rails + honest omissions

**What to build:** Resolve the homepage sections that depend on cross-Analysis aggregates or on a
product decision about whether a real signal exists at all: `DayStatsBar`, `Minuta`, `Rozpory ve
zdrojích`, `Nejčtenější`, and the pull-quote spotlight. This ticket is deliberately the place that
separates "build a real aggregate" from "omit the section until a real signal exists."

**Blocked by:** none.

**Status:** ready-for-agent

- [x] Decide and document what `Minuta` represents in this product (latest completed Articles,
      latest updates to unfolding Stories, or something else reader-facing enough to justify the
      rail).
- [x] Add the backend/API aggregates needed for the sections that *do* have an honest current
      signal: at minimum the stats strip fields that can be computed today, and a homepage-ready
      "top contradictions" rail if the product still wants one.
- [x] Wire those sections to real aggregates with honest empty states when the aggregate is empty.
- [x] Split `Nejčtenější` to ticket 61 unless this ticket also introduces a real readership metric;
      no fabricated "most read" ranking is allowed by the real-data work.
- [x] Leave the homepage pull quote absent unless this ticket settles a real selection rule for
      why one quote is spotlighted; no arbitrary contradiction quote should be elevated by default.
- [x] Leave `DayStatsBar`'s "Nejrychlejší zdroj" absent unless this ticket defines and exposes a
      concrete backend metric for it.

## Notes

Filed from ticket 56's homepage audit on 2026-08-21. This ticket exists because not every current
homepage section should be forced into existence. Some rails need new aggregate reads; others need
an explicit product decision to stay absent until a real signal exists.

Implementation decision:

- `Minuta` means latest completed reader-visible Articles. It is not an unfolding-story update
  feed because the backend has no durable story-update timestamp yet.
- `Minuta` is fetched by the frontend every 60 seconds.
- `Nejčtenější` is split to ticket 61 for a real readership metric instead of being removed in
  this ticket.
