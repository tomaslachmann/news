# 95 — /review/:id: auto-excluded sources are re-addable (shown unchecked)

**Type:** feature

**What to resolve:** User ask (verbatim): "jak se automaticky odstrani ty propojeni nebo se skryjou,
tak mit moznost je pridat zpatky, jen proste nebudou checknuty ty checkboxy." Confirmed target:
the source picker on `/review/:id`.

When a Draft is approved, `approveDraft`'s pre-Extraction quality gate excludes sources that failed
same-story verification or had no scraped title (ticket 87 — the yellow `DraftExclusionBanner`).
`Coverage.excluded` is set to `true`. But `findAnalysisWithDetails` filters `where: { excluded:
false }`, so on `/review/:id` those sources **vanish from the picker entirely** — the Admin can read
the banner but can't act on it. The banner's own copy already promises otherwise: *"vyřazené zdroje
zůstávají u konceptu jen označené jako vyloučené."*

The exclusion should be a **default, not a removal**: show the excluded sources in the picker with
their checkbox **unchecked**, so the Admin can tick any back on and re-include it. The backend
plumbing for re-inclusion already exists — `reconcileCoverages` sets `excluded: false` for every id
in `confirmedIds` — the gap is purely that the UI never shows them.

**Research done before filing** (2026-08-28, against the code):

- `Coverage.excluded` boolean. `excludeCoverageIds` (approveDraft) and `reconcileCoverages`
  (`notIn confirmedIds` → excluded, `in confirmedIds` → not excluded) are the only writers.
- `findAnalysisWithDetails(id)` hard-filters `excluded: false`; used by `getAnalysisDetail(id,
  isAdmin)` → `GET /api/analyses/:id` → `fetchAnalysis` on `ReviewPage`.
- Reader-facing `/article/:id` uses the same endpoint (non-admin, COMPLETE only) — excluded
  sources must **stay hidden** there.
- `ReviewPage` seeds `checkedIds` from `analysis.coverages.map(c => c.id)` (all checked) and sends
  `[...checkedIds]` as `confirmedIds` on confirm.
- `toAnalysisDetail` derives `sourceOverlap` count via `countValidExtractions(analysis.coverages)`
  — must NOT start counting excluded rows.
- `draftExclusions` (the `{ coverageId, outlet, reason }[]` from `approveDraft`) is passed to
  `/review/:id` as router nav state and drives the banner. It's gone on a plain reload.
- The exclusion *reason* is not stored on `Coverage` — it's derived at approve time. An
  admin-deselected source is also `excluded: true` with no reason. So per-row we can only show the
  specific reason when this approval's `draftExclusions` still names it.

**Blocked by:** none.

**Status:** todo

### Backend

- [x] `findAnalysisWithDetails(id, opts?: { includeExcluded?: boolean })` — when `includeExcluded`,
      additionally load the analysis's `excluded: true` coverages (separate query keyed by
      `analysisId`, `include: { source }`, `orderBy: id`) onto a new `excludedCoverages` field on
      `AnalysisWithDetails`. The existing `coverages` include stays `excluded: false` verbatim, so
      every count / mapper that reads `analysis.coverages` is untouched.
- [x] `getAnalysisDetail(id, isAdmin)` passes `{ includeExcluded: isAdmin }`. A non-admin caller
      never gets excluded rows (they only ever see COMPLETE anyway).
- [x] `AnalysisDetail` (shared) gains `excludedCoverages: CoverageInfo[]` — `[]` for non-admin /
      when there are none. `toAnalysisDetail` maps `analysis.excludedCoverages ?? []` through
      `toCoverageInfo`.
- [x] No change to `reconcileCoverages` / `confirmCoverages` — re-inclusion already works (an
      excluded id arriving in `confirmedIds` is set `excluded: false`, then scraped if PENDING).
      Confirm with a test rather than assuming.

### Frontend — ReviewPage

- [x] Render `analysis.excludedCoverages` below the active picker list (a labelled subsection,
      e.g. *"Automaticky vyloučené zdroje — zaškrtnutím je vrátíte do analýzy"*). Each row: the
      same `pick__i` layout, checkbox `checked={checkedIds.has(id)}` (starts **unchecked** — they
      are not in the `checkedIds` seed), a muted "vyloučeno" treatment, and — when this approval's
      `draftExclusions` names the row — the specific reason label.
- [x] `checkedCount` / the "Vybráno X z Y" line count the excluded rows in Y.
- [x] Ticking an excluded row adds its id to `checkedIds` → it flows into `confirmedIds` on
      confirm exactly like an active row. Nothing else to wire.
- [x] `reviewPageViewModel.ts`: `coverageExclusionLabel(coverageId, exclusions)` — the specific
      `REASON_GROUPS` label when `exclusions` names the id, a neutral fallback otherwise. Unit
      tested.

### Cross-cutting

- [x] Tests: repo integration (`findAnalysisWithDetails` with/without `includeExcluded`);
      `getAnalysisDetail` service (admin sees `excludedCoverages`, non-admin gets `[]`);
      `toAnalysisDetail` mapper (excluded rows mapped, counts unaffected); `confirmCoverages`
      re-includes an excluded id passed in `confirmedIds`; `reviewPageViewModel` unit.
- [x] Typecheck + full suites + lint. `/code-review` clean.
- [x] No ADR — this finishes ticket 87's stated intent ("zůstávají u konceptu jen označené jako
      vyloučené"), not a new architectural call.

## Implementation notes (2026-08-28)

- `findAnalysisWithDetails(id, { includeExcluded })` runs a second `coverage.findMany` for the
  excluded rows (Prisma can't include one relation twice with different `where`). Only the Admin
  `/review/:id` read pays for it; `AnalysisWithDetails.excludedCoverages` is `undefined` otherwise,
  so `countValidExtractions` / `sourceOverlap` and every other `analysis.coverages` reader is
  untouched.
- `AnalysisDetail.excludedCoverages` is a required `CoverageInfo[]` in the shared type, `[]` for
  readers / when nothing is excluded — `toAnalysisDetail` maps `analysis.excludedCoverages ?? []`.
- ReviewPage: the excluded rows render in a labelled `.pick__sub` subsection below the active
  list, muted (`.pick__i.is-off`), checkbox unchecked (they're not in the `checkedIds` seed).
  Ticking one flows into `confirmedIds` exactly like an active row — `reconcileCoverages` already
  sets `excluded: false` for every confirmed id, no backend change. The empty-state guard and the
  "Vybráno X z Y" count now use a single `totalCount` (active + excluded + custom URLs), so an
  analysis where *every* source was auto-excluded still shows them instead of "žádné pokrytí".
- `coverageExclusionLabel(coverageId, draftExclusions)` shows the specific quality-gate reason
  when this approval's nav state still names the row, a neutral "zaškrtnutím vrátíte" fallback on
  a reload or for an Admin-deselected source (no stored reason).

## Code-review fixes (2026-08-28)

Two-axis review — no hard violations, nothing "implemented wrong". Addressed:

- **Duplicated row markup** (Standards): extracted `<PickRow>` — the active and excluded coverage
  rows now share one renderer (`note` prop drives the muted `is-off` + reason label). Custom-URL
  rows stay separate (unchecking one deletes it — genuinely different).
- **`is-bad` semantic overload** (both axes): the exclusion label was rendering in the error-red
  `.pick__x.is-bad` (elsewhere "Nelze extrahovat"). Now plain `.pick__x` (muted `--ink-3`), which
  is what "vyloučeno" should read as; the row is already muted via `is-off`.
- **Banner copy scope creep** (Spec): reverted the extra sentence added to ticket 87's
  `buildDraftExclusionNotice` detail text — the `.pick__sub` subsection heading already carries
  the "zaškrtnutím je vrátíte" message.
- **"counts unaffected" half untested** (Spec): added a `getAnalysisDetail` test that an excluded
  coverage with a valid extraction does not inflate `sourceOverlap.sourceCount`.
- Fallback exclusion label trimmed to just "Vyloučeno" (the heading already says the rest).
