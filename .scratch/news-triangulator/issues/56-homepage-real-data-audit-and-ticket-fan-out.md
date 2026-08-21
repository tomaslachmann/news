# 56 — Homepage real-data audit + ticket fan-out

**What to build:** `HomePage.tsx` keeps its current information architecture, but it is still
entirely sample content. Before replacing sections piecemeal, audit what each existing homepage
section needs from the backend/data model so the current shape can be wired to real data, then fan
that audit out into multiple concrete implementation tickets.

**Blocked by:** none.

**Status:** ready-for-agent

- [ ] Inventory every current homepage section and identify which ones are still fabricated sample
      content (`lead`, story cards/listing, entities panel, ticker, minute feed, conflicts, most
      read, any remaining placeholder imagery/captions).
- [ ] For each section, record the current backend/API/data-model support that already exists and
      the exact missing shape needed to render it with real data while keeping the current homepage
      structure.
- [ ] Distinguish "can be wired with existing endpoints + transforms" from "needs new backend/API
      work" from "needs a product call because no honest real-data equivalent exists yet."
- [ ] Produce multiple follow-up implementation tickets from that audit, grouped into buildable
      chunks rather than one giant homepage rewrite ticket.
- [ ] Note explicitly any homepage section that the audit concludes should remain absent or degrade
      to an empty state until a real backing signal exists, rather than being filled with invented
      data.

## Notes

Scoped directly from ticket 54's grilling session on 2026-08-21. The user's decision was to keep
the homepage's current structure and use this ticket to answer a narrower question first: "what
backend/data shape is missing in which form so we can connect it to real data?" This ticket is not
a redesign and not the implementation itself; it is the dependency/spec pass that should generate
the implementation tickets.
