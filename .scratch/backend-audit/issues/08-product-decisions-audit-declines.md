# 08 — Product decisions the audit explicitly declines to make

Type: grilling
Status: resolved
Blocked by: none — can start immediately

## Question

Audit §13 ("Otevřené otázky, které audit nerozhodne") lists four items it deliberately leaves to the product owner, not technical findings:

1. **Real Story-creation volume** — unmeasured; the audit says Etapa 1 (ticket 01/03's measurement work) will surface this, and it's a prerequisite for judging "one Postgres instance is fine" vs. "you'll need more" — informational, not really a decision, likely resolves itself as a byproduct of ticket 03.
2. **Is `Story` ↔ `Analysis` 1:1 right long-term?** Fine under the target design (`Thread` handles multi-Story arcs), *unless* you want to re-analyze the same event a month later with new sources — which would need `Analysis` versioning, a different migration entirely.
3. **Paywall handling philosophy** — today's approach (detect a block page, let an admin manually paste text) is legally safe. `Source.paywalled` in the proposed schema (ticket 02) would allow going further: treat a paywalled source as "coverage exists, but we don't have the text" and work from title+lead alone. That's a product call about what "Coverage" is allowed to mean, not a bug fix.
4. **Per-Source custom extractor profiles** — the audit says don't build this speculatively; only worth it once Etapa 1's error-rate-per-Source metric (from ticket 01) shows Readability systematically failing on a specific outlet.

Decide, for each: is this actually in scope for *this* map (backend-audit remediation), or does it belong to a separate future effort since none of these are things the audit found broken — they're just things it noticed were undecided? Recommend keeping 1 and 4 folded into ticket 01/03's follow-up rather than a standalone decision, and spinning 2 and 3 out as their own future wayfinder map once the accepted-now tickets in this one are further along, since both are real product-shape decisions deserving their own dedicated grilling session rather than being squeezed in as a side effect of a technical audit.

## Answer

Tickets 01 and 03 are both resolved now (this session revisits them to check the original recommendation still holds, since neither ended up building the "follow-up" 1/4 was meant to fold into):

1. **Real Story-creation volume** — still purely informational, not a decision to make. Ticket 03's own Answer already confirmed the DB was completely empty (0 rows) at implementation time — the audit's "measure on ~50k seeded rows" step never applied, and still doesn't. This isn't something to fold into any ticket's follow-up; it self-resolves as an observation once the app has real usage, the same way it would have whether or not tickets 01/03 had anything to say about it. No action, no ticket — correctly informational, not a finding.

2. **`Story` ↔ `Analysis` 1:1, long-term** — confirmed out of scope for this map. A real product-shape decision (does re-analyzing the same event later need `Analysis` versioning?), not a technical remediation the audit found broken — it's explicitly one of the four things audit §13 says it *declines* to decide. Moved to Out of scope (map.md) rather than actioned here or folded into anything; worth its own dedicated session whenever the product actually wants "re-run this analysis with new sources" as a feature, not before.

3. **Paywall handling philosophy** — same disposition as #2 and for the same reason: a call about what "Coverage" is allowed to mean (text-required vs. title+lead-is-enough for a paywalled Source), not a bug. `Source.paywalled` (ticket 02, already shipped) gives this a schema seam to build on *if* the product later decides to go further than "admin pastes text manually" — but deciding whether to actually use that seam that way is the out-of-scope product call itself. Moved to Out of scope.

4. **Per-Source custom extractor profiles** — stays deferred, on the audit's own original trigger (Readability systematically failing on a specific outlet), not folded into a ticket 01/03 follow-up that never materialized. Neither ticket built a standing error-rate-per-Source metric as a byproduct — ticket 01 shipped P0-1/P0-4/P2-17/P2-20/P2-26 only (see its own Answer), and ticket 03's "measurement" step was the row-count check, not an ongoing extraction-error metric. Building that metric now, with an empty DB and no observed Readability failures to justify it, would be exactly the speculative-generality ADR 0009 warns against. No new ticket; the audit's own trigger condition is the one that still applies whenever real extraction-failure data exists to look at.

Net effect on this map: nothing new gets implemented from this ticket. #2 and #3 move to Out of scope (map.md) as real product decisions for a future, separate session; #1 and #4 stay exactly where the audit itself left them — informational and trigger-deferred respectively, with no standing follow-up ticket to fold them into after all.
