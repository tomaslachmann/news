# 64 — Fix `approveDraft` mischaracterizing title-less Coverage as a verification failure

**Type:** fix

**What to resolve:** `.scratch/backend-audit/issues/01-quick-fixes-no-brainers.md`'s P1-12,
confirmed still live: `approveDraft` (`ingestionService.ts`) computes `failedIds` by filtering
**all** `coverages` against `verifiedIds`, not just the `verifiable` subset that was actually sent
to `verifyCandidatesAgainstAnchorInBatches`. A title-less Coverage (never eligible for
verification — filtered out of `verifiable` before the LLM call) is silently swept into the same
`failedIds` bucket as Coverage the LLM genuinely rejected, then logged as having "failed or errored
during same-story verification," which is false — it was never attempted.

The audit's own P2-23 (`EXTRACTION_FAILED` block-reason enum) deferred this fix, reasoning the two
could share enum-taxonomy machinery. On inspection they don't actually overlap: P2-23 is about
*scrape outcome* (paywall/bot-wall/network error) recorded on Coverage at scrape time; P1-12 is
about *why a Coverage was excluded from Extraction* during `approveDraft`'s quality gate, a
different moment and a different Coverage set. P2-23 stays its own future ticket, deliberately not
picked up here — it needs its own scope decision (does the admin UI need to show a reason?) that
this ticket doesn't touch.

**Blocked by:** none.

**Status:** done

- [x] `approveDraft` splits its exclusion set into two distinct buckets — Coverage that actually
      underwent verification and failed, vs. Coverage with no title that was never sent to
      verification at all — and logs each with accurate, distinct wording. The excluded-id set
      written via `coverageRepo.excludeCoverageIds` is unchanged (both buckets are still excluded);
      only the classification/logging is fixed.
- [x] Existing `approveDraft` tests still pass unmodified where they assert exclusion behavior
      (the *what gets excluded* contract doesn't change) — add a new/updated assertion covering the
      corrected log wording for the title-less case specifically.
- [x] Typecheck + full `ingestionService.test.ts` pass.

## Implementation notes

Confirmed via direct code reading (not just the audit doc) that the bug is real and current:
`ingestionService.test.ts`'s existing "never sends a title-less Coverage to verification, treating
it as unverifiable" test already proves the *exclusion* behavior is correct today — only the
*log message* mischaracterizes it. Fix keeps `excludeCoverageIds` called with the same combined id
list (order: failed-verification ids first, then unverifiable ids) so no existing assertion on
*what* gets excluded needed to change; only the two `log?.warn` calls were split so each fires with
accurate wording only for its own bucket (a mixed batch now logs both warnings, not one misleading
one covering everything).
