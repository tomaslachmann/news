# 68 — Thread detail backend

**Type:** feature

**What to resolve:** Follow-up from ticket 65's grilling session. Builds the read model + endpoint
a dedicated Thread page needs: `GET /api/thread/:slug`, public, never-leak-existence (404 for an
unknown slug or a Thread whose *visible* member count has dropped below 2 — same gate
`toThreadSummary` already applies).

**Blocked by:** none.

**Status:** ready-for-agent

- [ ] `packages/backend/src/repositories/threadDetail.ts` (new, read-model repository per ADR
      0037): `findThreadDetailBySlug(slug)` — the Thread row plus every COMPLETE member's Analysis
      (headline/seedHeadline, `sourceOverlap`-equivalent fields, `dimensions`, `entities`), plus
      every one of those members' Coverage rows (source name, `articleUrl`, title, `createdAt`).
- [ ] `packages/shared/src/index.ts`: add `ThreadDetail` (title, slug, status, firstEventAt,
      lastEventAt, memberCount, averageAgreementPercentage, contradictionCount), `ThreadTimelineItem`
      (member-granularity: analysisId, title, eventTime, sourceCount, agreementPercentage,
      agreementCategory), `ThreadArticleRow` (Coverage-granularity: outlet, publishedAt/createdAt,
      title, articleUrl, tags: array of `'agrees' | 'contradicts' | 'unique' | 'none'`), `ThreadSourceRow`
      (outlet, coverageCount), reuse existing `EntityMentionItem` for the entities rail. Add `slug`
      to `ThreadMemberItem`/`ThreadSummaryItem` too (ticket 69 needs it to link from `ArticlePage`).
- [ ] `packages/backend/src/mappers/threadDetail.ts` (new): builds `ThreadTimelineItem[]` from
      members ordered by `eventTime` (fallback `createdAt`, ticket 16 convention); builds
      `ThreadArticleRow[]` by, for each member's Coverage, matching `Coverage.articleUrl` against
      every `DimensionItem`/`ContradictionItem.attributions[].articleUrl` on that member's
      `dimensions` JSON, tagging every dimension it matches (not just the first) — 'agrees' for
      `agreement`, 'contradicts' for `contradiction`, 'unique' for `uniqueReporting`, framing
      matches fold into no separate tag (framing isn't one of the four the design settled on
      showing); 'none' when a Coverage matches no attribution at all; builds `ThreadSourceRow[]` by
      grouping all members' Coverage by `Source`; builds the entities rail by unioning every
      member's already-computed entity mentions (dedup by entity id).
- [ ] `packages/backend/src/services/threadDetailService.ts` (new): `getThreadDetail(slug)` — 404
      (`NotFoundError`) when the slug doesn't resolve or resolves to a Thread with fewer than 2
      currently-visible (COMPLETE) members, mirroring `getAnalysisDetail`'s existing thread gate.
- [ ] `packages/backend/src/routes/thread.ts` (new): `GET /api/thread/:slug`, public, no auth.
- [ ] Update `findThreadForStory`/`toThreadSummary` (existing `ArticlePage` inline surface) to also
      carry the Thread's `slug`, so ticket 69 can link the existing `ThreadSection` heading to the
      new page without a second lookup.
- [ ] Tests: `mappers/threadDetail.test.ts` (the attribution-matching tag logic is the one genuinely
      tricky piece — cover a Coverage matching zero/one/multiple dimensions), `services/threadDetailService.test.ts`
      (404 cases), route test for the new endpoint.
- [ ] Typecheck + full backend test suite pass. `/code-review` clean.

## Implementation notes

*Fill in once built.*
