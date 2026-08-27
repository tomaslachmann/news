# 87 — Admin isn't told why a Draft's source count shrinks on approval

**Type:** bug

**What to resolve:** User report (verbatim, translated): on `/admin/ingestion`, a Draft shows "5
zdrojů" (5 sources); after clicking approve and landing on `/review/:id`, only 3 sources appear —
with nothing anywhere explaining where the other 2 went. Nothing is actually lost or broken — this
is `approveDraft`'s own Pre-Extraction quality gate doing exactly what it's designed to do — but
the admin has no way to know that from the UI, and reasonably reads a shrinking number as data
loss or a bug.

**Research done before filing this ticket** (2026-08-27, confirmed by reading the actual code, not
guessed):

- `approveDraft` (`packages/backend/src/services/ingestionService.ts`) runs a same-story
  verification pass (`verifyCandidatesAgainstAnchorInBatches`, `storyVerification.ts`) on every
  attached Coverage right before the DRAFT→PENDING transition — one LLM call per Coverage, checking
  its title against the Story's `anchorHeadline`. Any Coverage that fails that check, or has no
  scraped `title` at all, gets `coverageRepo.excludeCoverageIds` called on it — a soft exclude
  (`excluded: true`, the row is never deleted).
- Two `log?.warn` lines already record exactly this happening ("Pre-Extraction quality gate
  excluded Coverage that failed or errored during same-story verification" / "...excluded Coverage
  with no title"), but only to the server logger — invisible to anyone not tailing Docker logs
  (and, ironically, ticket 86 just made those logs much more usable — but they're still not
  something an Admin looks at while clicking through the review queue).
- The `/admin/ingestion` list page's "N zdrojů" count (`IngestionReviewPage.tsx`,
  `draft.coverageCount`) is sourced from `findDraftsPage`'s raw SQL (`repositories/analysis.ts`),
  which counts `WHERE c.excluded = false` — accurate at list-render time, but exclusion only
  happens *inside* `approveDraft` itself, so the list always shows the pre-exclusion count. The
  review page's own source list also filters `excluded: false` (`repositories/coverage.ts`) — now
  correctly reflecting the 2 newly-excluded rows. Both counts are individually correct for the
  moment they're read; the confusion is entirely that approval is a silent, unannounced state
  change between the two reads.

**Blocked by:** none.

**Status:** todo

- [ ] Decide and implement a way for the Admin to see, at the moment of approval (or immediately
      after landing on `/review/:id`), which sources (if any) were excluded and why — same-story
      verification failure vs. no title. A toast/banner naming the excluded outlet(s) is the
      obvious shape; the backend already has everything needed (`excludedIds`,
      `failedVerificationIds` vs. `unverifiableIds` are already computed and distinguished inside
      `approveDraft`, just never returned to the caller).
- [ ] `approveDraft`'s route/service return shape likely needs to carry this exclusion summary back
      to the frontend, rather than a bare `void`.
- [ ] Consider whether the list page's "N zdrojů" pill should itself hint that this count is
      pre-verification (e.g. a tooltip), separate from the post-approval banner — avoid solving only
      half the confusion.
- [ ] Tests: `approveDraft` returning the right exclusion summary shape for both exclusion reasons
      and for the no-exclusions case; frontend test that the banner/toast renders correctly from
      that shape.
- [ ] Typecheck + full test suites pass. `/code-review` clean.
