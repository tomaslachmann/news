# 08 — Product decisions the audit explicitly declines to make

Type: grilling
Status: open
Blocked by: none — can start immediately

## Question

Audit §13 ("Otevřené otázky, které audit nerozhodne") lists four items it deliberately leaves to the product owner, not technical findings:

1. **Real Story-creation volume** — unmeasured; the audit says Etapa 1 (ticket 01/03's measurement work) will surface this, and it's a prerequisite for judging "one Postgres instance is fine" vs. "you'll need more" — informational, not really a decision, likely resolves itself as a byproduct of ticket 03.
2. **Is `Story` ↔ `Analysis` 1:1 right long-term?** Fine under the target design (`Thread` handles multi-Story arcs), *unless* you want to re-analyze the same event a month later with new sources — which would need `Analysis` versioning, a different migration entirely.
3. **Paywall handling philosophy** — today's approach (detect a block page, let an admin manually paste text) is legally safe. `Source.paywalled` in the proposed schema (ticket 02) would allow going further: treat a paywalled source as "coverage exists, but we don't have the text" and work from title+lead alone. That's a product call about what "Coverage" is allowed to mean, not a bug fix.
4. **Per-Source custom extractor profiles** — the audit says don't build this speculatively; only worth it once Etapa 1's error-rate-per-Source metric (from ticket 01) shows Readability systematically failing on a specific outlet.

Decide, for each: is this actually in scope for *this* map (backend-audit remediation), or does it belong to a separate future effort since none of these are things the audit found broken — they're just things it noticed were undecided? Recommend keeping 1 and 4 folded into ticket 01/03's follow-up rather than a standalone decision, and spinning 2 and 3 out as their own future wayfinder map once the accepted-now tickets in this one are further along, since both are real product-shape decisions deserving their own dedicated grilling session rather than being squeezed in as a side effect of a technical audit.
