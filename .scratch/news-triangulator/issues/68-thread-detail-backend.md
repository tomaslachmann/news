# 68 — Thread detail backend

**Type:** feature

**What to resolve:** Follow-up from ticket 65's grilling session. Builds the read model + endpoint
a dedicated Thread page needs: `GET /api/thread/:slug`, public, never-leak-existence (404 for an
unknown slug or a Thread whose *visible* member count has dropped below 2 — same gate
`toThreadSummary` already applies).

**Blocked by:** none.

**Status:** done

- [x] `packages/backend/src/repositories/threadDetail.ts` (new, read-model repository per ADR
      0037): `findThreadDetailBySlug(slug)` — the Thread row plus every COMPLETE member's Analysis
      (headline/seedHeadline, `sourceOverlap`-equivalent fields, `dimensions`, `entities`), plus
      every one of those members' Coverage rows (source name, `articleUrl`, title, `createdAt`).
- [x] `packages/shared/src/index.ts`: add `ThreadDetail` (title, slug, status, firstEventAt,
      lastEventAt, memberCount, averageAgreementPercentage, contradictionCount), `ThreadTimelineItem`
      (member-granularity: analysisId, title, eventTime, sourceCount, agreementPercentage,
      agreementCategory), `ThreadArticleRow` (Coverage-granularity: outlet, publishedAt/createdAt,
      title, articleUrl, tags: array of `'agrees' | 'contradicts' | 'unique' | 'none'`), `ThreadSourceRow`
      (outlet, coverageCount), reuse existing `EntityMentionItem` for the entities rail. Add `slug`
      to `ThreadMemberItem`/`ThreadSummaryItem` too (ticket 69 needs it to link from `ArticlePage`).
- [x] `packages/backend/src/mappers/threadDetail.ts` (new): builds `ThreadTimelineItem[]` from
      members ordered by `eventTime` (fallback `createdAt`, ticket 16 convention); builds
      `ThreadArticleRow[]` by, for each member's Coverage, matching `Coverage.articleUrl` against
      every `DimensionItem`/`ContradictionItem.attributions[].articleUrl` on that member's
      `dimensions` JSON, tagging every dimension it matches (not just the first) — 'agrees' for
      `agreement`, 'contradicts' for `contradiction`, 'unique' for `uniqueReporting`, framing
      matches fold into no separate tag (framing isn't one of the four the design settled on
      showing); 'none' when a Coverage matches no attribution at all; builds `ThreadSourceRow[]` by
      grouping all members' Coverage by `Source`; builds the entities rail by unioning every
      member's already-computed entity mentions (dedup by entity id).
- [x] `packages/backend/src/services/threadDetailService.ts` (new): `getThreadDetail(slug)` — 404
      (`NotFoundError`) when the slug doesn't resolve or resolves to a Thread with fewer than 2
      currently-visible (COMPLETE) members, mirroring `getAnalysisDetail`'s existing thread gate.
- [x] `packages/backend/src/routes/thread.ts` (new): `GET /api/thread/:slug`, public, no auth.
- [x] Update `findThreadForStory`/`toThreadSummary` (existing `ArticlePage` inline surface) to also
      carry the Thread's `slug`, so ticket 69 can link the existing `ThreadSection` heading to the
      new page without a second lookup.
- [x] Tests: `mappers/threadDetail.test.ts` (the attribution-matching tag logic is the one genuinely
      tricky piece — cover a Coverage matching zero/one/multiple dimensions), `services/threadDetailService.test.ts`
      (404 cases), integration test for the new repository query against a real Postgres (this
      codebase's established convention for backend "route"-level coverage — see
      `test/integration/thread.test.ts`, not a mocked-Fastify unit test).
- [x] Typecheck + full backend test suite pass. `/code-review` clean.

## Implementation notes

`ThreadDetail.sourceCount` is the distinct-outlet count (matches the design's "Zdrojů" tile), not
the total valid-Coverage count across the thread ("Článků") — ticket 69's frontend can derive the
latter as `articles.length` directly, no separate backend field needed for it.

Reused `countValidExtractions`/`interpretSourceOverlap`/`mergeAgreementCategory` (existing
services, already used by `toAnalysisDetail`/`toAnalysisListRow`) rather than reinventing
equivalents — kept `threadDetail.ts`'s own repository query independent of
`ANALYSIS_LIST_ROW_INCLUDE` rather than extending that shared include, since Thread's per-Coverage
needs (`articleUrl`, for attribution matching) don't overlap with what the homepage/list-row
consumers of that include need, and ADR 0037's "reuse existing mapping" is a should, not a must,
once the shape genuinely diverges.

`ThreadArticleTag` ended up as `'agrees' | 'contradicts' | 'unique'` (no `'none'` member) — an
empty `tags: []` array is the "not singled out in any dimension item" case, more honest than a
sentinel value that would need every consumer to special-case it.

**`/code-review` (high) findings, both fixed:** (1) a title-less Coverage was falling back to the
outlet's own name (`title: coverage.title ?? coverage.sourceName`), showing the outlet twice in
the same row — fixed to `?? undefined`, matching `CoverageInfo.title`'s existing convention;
`ThreadArticleRow.title` is now optional. (2) `getThreadDetail` was issuing one
`findEntityMentionsForStory` DB round trip per Thread member (up to 50, `findFollowUpComponent`'s
own safeguard bound) — added a batched `findEntityMentionsForStories(storyIds[])` to
`repositories/entity.ts` and switched to it, one query instead of N.

**Second `/code-review` round (during ticket 69), 2 more findings, both fixed:** (1) `firstEventAt`/
`lastEventAt` used the raw `Thread` row's span (covering every graph member) instead of the
visible (COMPLETE) members' own span — a still-DRAFT/PENDING member excluded from `members` could
still push `lastEventAt` forward, leaking that a newer, unpublished development exists. Fixed to
derive from `thread.members[0]`/`[length - 1]`'s own `eventTime` (safe to index: already ordered
oldest-first by the repository's `position asc` query). (2) The same Coverage `articleUrl` can
legitimately appear under two different Thread members (Coverage uniqueness is per-Analysis only,
not thread-wide) — `articles`/`sources` now dedupe by `articleUrl`, merging tags from whichever
member(s) cite it, instead of a duplicate row (and duplicate React key on the frontend) plus an
inflated per-source count.
