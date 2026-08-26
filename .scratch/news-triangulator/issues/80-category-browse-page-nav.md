# 80 — Wire `chromeNav` rubrics to a real `/category/:slug` browse page

**Type:** feature

**What to resolve:** Follow-up from ticket 77's grilling session. `chromeNav.ts`'s 7 topic rubrics
(`Domácí`/`Ekonomika`/`Svět`/`Energetika`/`Regiony`/`Sport`/`Kultura`) are dead `to: '#'` placeholders
today. Once ticket 78 gives Story/Analysis a real derived category, replace them with a working
`/category/:slug` browse page — same "browse everything" role `/history`/`/threads` already play —
and real nav links.

**Blocked by:** 78 (needs the `ArticleCategory` enum + Story-level aggregate to exist). Does not need
ticket 79 — works with whatever categorization coverage exists at the time, real data only, same
never-fabricate posture every other page in this codebase already takes.

**Status:** ready-for-agent

- [x] Decide the rubric list against the real enum: `chromeNav.ts`'s current 7 labels don't match
      `ArticleCategory` 1:1 (no `ENERGY` value exists — ticket 77's Answer dropped it; `Regiony`
      isn't one of the 13 enum values either, and would need its own design pass, likely tied to
      ticket 79's regional feeds rather than this ticket). Pick the real subset of `ArticleCategory`
      values worth a top-level nav entry, and drop or rework whatever doesn't map cleanly — don't
      carry the placeholder list forward unexamined.
- [x] Backend: paginated listing of COMPLETE Analyses whose derived (Story-level, ticket 78) category
      matches a given `ArticleCategory` — reuse `fetchPage`/`Page<T>` (this codebase's existing
      pagination convention, same as `/history`/`/threads`), same row shape as `/history`'s existing
      listing where reasonable.
- [x] New route, e.g. `GET /api/category/:category`, public — validate `:category` against the real
      enum (400 on an unknown value, never a silent empty result that looks like "no articles in this
      category").
- [x] Frontend: new route `/category/:slug`, a `CategoryPage.tsx` (or similar) reusing the existing
      list-row shape/pagination pattern.
- [x] `chromeNav.ts`: replace the dead rubric placeholders with real entries pointing at
      `/category/:slug` for the categories kept in scope above.
- [x] Tests: backend pagination/filtering query, category-validation 400 case.
- [x] Typecheck + full test suites pass. `/code-review` clean.
