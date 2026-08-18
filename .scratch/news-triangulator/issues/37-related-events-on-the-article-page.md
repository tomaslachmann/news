# 37 — Related Events on the Article Page

**What to build:** A reader viewing a completed Article sees a "Related Events" section listing the other Events (Stories) it's been linked to — each with its own title and source count — so they can navigate a developing story without searching for it themselves. This is the ticket that makes the Event Graph actually visible to a reader.

**Blocked by:** 35 — Story Relation Candidate Generation, Confirmation & Persistence (needs `PUBLISHED` `StoryRelation` rows to display)

**Status:** done

- [x] `AnalysisDetail` gains a new field (e.g. `relatedEvents: RelatedEventItem[]`) populated by `toAnalysisDetail` — no separate endpoint, one round-trip for the whole Article page
- [x] Only `PUBLISHED` `StoryRelation`s are included, read bidirectionally (the current Story as either `fromStoryId` or `toStoryId`)
- [x] Only relations where the *other* Story's Analysis is `COMPLETE` are included — nothing links to a Draft/PENDING page that isn't a stable Article yet; a `StoryRelation` to a non-COMPLETE Story still exists in the database but isn't surfaced here
- [x] Each `RelatedEventItem` includes the related Story's display title (`resolveDisplayTitle`/the `title` field already shipped in ticket 33), its Analysis id (for linking), and its source count
- [x] `AnalysisPage.tsx` gains a "Related Events" section on the completed-Analysis view, rendering this list with working links to each related Article
- [x] The relation `type` (`RELATED`/`FOLLOW_UP`) is distinguishable in the UI — a reader can tell a follow-up from a merely-related Event, not just that a connection exists
- [x] "Event" is introduced as `Story`'s reader-facing name in this section's copy, mirroring the existing Article/Analysis pattern; `CONTEXT.md` gets a new entry documenting it
- [x] An Article with no related Events renders exactly as it does today — this feature is additive, no regression for the common case
- [x] The mapper/service-layer change (`toAnalysisDetail`'s new field) is tested following ticket 33's precedent — the fallback/filtering logic (PUBLISHED-only, COMPLETE-other-side-only) is covered once at the mapper/service layer, not duplicated
- [x] Existing `AnalysisDetail`/`AnalysisPage` tests continue passing, updated only for the new field where fixtures need it

## Notes

Spec: `docs/spec-event-graph.md`. Fourth of a four-ticket chain (34 → 35 → {36, 37}). Does not depend on ticket 36; both can be built in parallel once 35 is done.
