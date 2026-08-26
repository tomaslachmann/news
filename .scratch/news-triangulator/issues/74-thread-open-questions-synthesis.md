# 74 — Implementation: thread-level open-questions synthesis

**Type:** feature

**What to resolve:** Follow-up from ticket 67's grilling session. Replaces the mock/placeholder
"open questions" rail ticket 65 shipped on the Thread page with a real synthesis: a new background
job runs an LLM pass reading every Thread member's `contradiction`/`agreement`/`uniqueReporting`
dimension items and prose, judging which tensions are still genuinely open, and producing a list of
open questions each citing the specific `{ analysisId, dimensionItemId }` it's about.

**Blocked by:** none — the Thread aggregate, member Analyses, and dimension items all already exist.

**Status:** ready-for-agent

- [ ] New pg-boss job (e.g. `thread.synthesizeOpenQuestions`), separate from `thread.recompute`,
      with its own retry policy suited to LLM flakiness (not `thread.recompute`'s tight DB-only
      10×/5s policy). Enqueued from the same trigger points as `thread.recompute` (`StoryRelation`
      confirming as `FOLLOW_UP`, in `storyRelationPass.ts` and `ingestionService.ts`'s
      `approveStoryRelation`), or chained off `thread.recompute`'s completion — pick whichever avoids
      a race against the Thread/ThreadMember upsert the LLM pass needs to read.
- [ ] New service (e.g. `threadOpenQuestionsService.ts`): gathers every visible (COMPLETE) member's
      `contradiction`/`agreement`/`uniqueReporting` items + prose, calls the LLM to produce open
      questions, each shaped roughly as `{ question: string, detail: string, relatedItems: { analysisId: string, dimensionItemId: string }[] }`.
      Runs on every member addition, not just Thread creation.
- [ ] Dangling-reference verification: each `relatedItems` entry must resolve to a real dimension
      item on a real (visible) member Analysis of this Thread — same shape as Narrative's existing
      entity/source/value ref checks. On verification failure: retry the LLM call once, then catch
      and fall back to persisting no open questions for this Thread (empty rail) — do not fail the
      job chain or block the Thread page.
- [ ] Persist the result (new Prisma model or a JSON column on `Thread` — pick based on query needs:
      does the Thread detail read path need to join dimension items back in, or is a denormalized
      snapshot with prose + attributions enough to render directly?).
- [ ] `packages/backend/src/services/threadDetailService.ts` / `threadDetail.ts` mapper: replace the
      current mock/placeholder open-questions content with the real persisted data.
- [ ] Frontend Thread page: update the open-questions rail to render real data (should need no
      structural change if the mock content already matched this shape — confirm against ticket
      65/69's existing rail).
- [ ] Tests: verification-check unit tests (valid ref, dangling ref, retry-then-fallback-to-empty
      path), service test for gathering dimension items across members, integration test for the new
      job's trigger/enqueue path.
- [ ] Typecheck + full test suites pass. `/code-review` clean.
