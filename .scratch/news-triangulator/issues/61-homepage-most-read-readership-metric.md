# 61 — Homepage "Nejčtenější" readership metric

**What to build:** Replace the homepage's fabricated `Nejčtenější` rail with a real readership
metric, or explicitly decide that the rail should not exist until readership tracking is in scope.
Ticket 60 must not invent a ranking from unrelated signals such as source count or contradiction
count.

**Blocked by:** none.

**Status:** ready-for-agent

- [ ] Decide what "read" means for this local product: Article page view, distinct session view,
      time-on-page threshold, or another concrete metric.
- [ ] Add the persistence needed to record that metric without leaking private reader identity.
- [ ] Add a backend/API surface returning homepage-ready most-read Articles for a defined time
      window.
- [ ] Wire the homepage `Nejčtenější` rail to that real metric.
- [ ] Remove the fabricated sample ranking once the real metric exists.

## Notes

Filed from ticket 60 implementation planning on 2026-08-21. The existing homepage mock ranks items
without any readership data. That should be a separate product/data decision, not folded into the
aggregate rails ticket by substituting another available count.
