# 93 — Semi-automated entity → Wikidata linking

**Type:** feature

**What to resolve:** User ask (verbatim): "lets continue with implementing the research". The
research is `docs/research/2026-automated-entity-wikidata-linking.md` — a first-party investigation
of how to move `Entity.wikidataId` off its deliberately-manual stance (`docs/spec-entity-resolution.md`
User Story 11, ADR 0022) toward a safe *semi*-automated design.

Today every `Entity.wikidataId` link is typed in by hand: an Admin opens `/admin/entities`, picks
the entity, types its name into a Wikidata search box, eyeballs the candidates, clicks "Propojit".
The research's headline finding: the fully-manual stance is right for the *hard* cases but is
currently applied uniformly to cases that are not hard at all — a `PERSON` with exactly one human
bearer of that exact Czech name who owns the `cswiki` article of that name, a `COUNTRY`, a major
`ORGANIZATION`. Those can be linked by a deterministic rule with a false-positive rate low enough
to auto-accept; everything ambiguous falls through to a review queue.

**Scope decision (user, 2026-08-28):** build **both** halves — the deterministic auto-link
fast-path *and* the suggestion queue for everything else. Include the hosted Wikidata
reconciliation endpoint as an **optional** cross-check before auto-linking (never blocking — a
429/timeout/disagreement routes the entity to the queue). Trigger via a **scheduled batch job**
(like `homepage.entity-stats.refresh`), not an admin button.

**Research already done** — see the doc in full. Key load-bearing facts:

- `wbsearchentities` (what `wikidataSearchClient.ts` calls today) has **no type filter** and carries
  none of the signals needed to decide a match — it is a candidate generator only.
- `wbgetentities&sites=cswiki&titles=<name>` resolves a Czech Wikipedia article title → exactly one
  Q-id (Wikipedia titles are unique per language, unlike Wikidata labels). This is the single
  strongest cheap disambiguation signal for Czech news. `wikipediaClient.ts` already uses
  `wbgetentities` with `sitefilter=cswiki`.
- `action=query&list=search&srsearch=<name> haswbstatement:P31=Q5` returns type-constrained
  candidates (humans only, disambiguation pages gone). `haswbstatement` does **not** do the `P279*`
  subclass walk itself — enumerate the subtype Q-ids in an OR clause, or check `P31` client-side
  after fetching it.
- OpenRefine-Wikibase's battle-tested auto-match rule (its default for years): auto-match iff top
  candidate scores **> ~95/100** (relaxed 5 per contextual property supplied) **AND** beats the
  runner-up by **> 10 points**. Every prior-art tool (OpenTapioca, DBpedia Spotlight,
  spaCy-entity-linker) needs *both* an absolute floor and a margin over #2.
- Hosted reconciliation endpoint: `https://wikidata-reconciliation.wmcloud.org/cs/api`, plain
  `GET`/`POST` JSON, no auth. Volunteer-run WMCloud, **no published rate limits** — be gentle,
  handle 429, self-host if volume ever grows.
- Etiquette: serial requests, `maxlag=5` on Action API calls, the repo's existing honest
  `NewsTriangulator/1.0 (+…)` UA (do **not** use ADR 0040's browser-shaped headers — the policy
  calls copying a browser UA "potentially malicious"), retry 429/503 with `Retry-After` backoff.
- No LLM anywhere on the auto path — none of the auto-link conditions needs one, and adding one
  would reintroduce an unverifiable judgement into the one path we want mechanical (ADR 0012).

**Blocked by:** none.

**Status:** todo

### Data model

- [ ] New Prisma model `EntityWikidataSuggestion`: `id`, `entityId` (`@unique` — one live
      suggestion per entity; a re-scan replaces it), `candidates Json` (ranked
      `{ qid, label, description, score, reasons: string[] }[]`), `createdAt`, `updatedAt`. Deleted
      when an Admin confirms or dismisses it. Hand-written migration, no `prisma migrate dev`.
- [ ] New Prisma model `EntityWikidataCandidateRejection`: `id`, `entityId`, `qid`, `rejectedBy`,
      `createdAt`, `@@unique([entityId, qid])`. "This specific Q-id is not this entity" — permanent,
      mirrors `EntityAliasRejection`'s REJECTED-permanence semantics. The scan excludes these qids;
      dismissing a whole suggestion writes one rejection row per candidate currently shown, so an
      identical candidate set is never re-suggested (a genuinely new/different candidate later still
      creates a fresh suggestion).
- [ ] `AdminAction` union gains `entity.wikidata_autolinked`, `entity.wikidata_suggestion_dismissed`,
      `entity.wikidata_candidate_rejected`. `entity.wikidata_linked` is reused when an Admin confirms
      a queued suggestion (same outcome as today's manual link).

### Backend — Wikidata clients

- [ ] `wikidataSearchClient.ts` gains, alongside `searchWikidataEntities`:
      - `resolveByCswikiTitle(title): Promise<WikidataItemDetail | null>` — `wbgetentities&
        sites=cswiki&titles=<title>&props=labels|aliases|descriptions|claims|sitelinks&
        languages=cs|en`, `maxlag=5`. Returns `{ qid, labels, aliases, description, p31: string[],
        sitelinkCount, hasCswikiSitelink }` or null.
      - `searchTypedCandidates(name, type): Promise<string[]>` — `action=query&list=search&
        srnamespace=0&srsearch="<name>" haswbstatement:P31=<orClause>` where `<orClause>` is the
        P31 Q-id set for the entity type. Returns candidate qids.
      - `fetchItemDetails(qids: string[]): Promise<WikidataItemDetail[]>` — batch `wbgetentities`
        (≤50 ids) for the scoring/rival checks.
      All serial, `maxlag=5`, honest UA, unit-tested by mocking the HTTP call (never hits real
      Wikidata — same convention as the existing client).
- [ ] New `wikidataReconcileClient.ts`: `reconcile(query, typeQids, properties?): Promise<{ qid,
      score, match } | null>` — form-encoded `queries` POST to
      `https://wikidata-reconciliation.wmcloud.org/cs/api`. Throws a typed `ReconcileUnavailableError`
      on 429 / timeout / non-OK so the scan job can fall back to "queue for admin" rather than
      block. Unit-tested with a mocked fetch.

### Backend — matching logic (pure, unit-tested)

- [ ] New `entityWikidataMatching.ts`:
      - `TYPE_P31_QIDS: Record<EntityType, string[]>` — the P31 targets per entity type (from the
        research §1.3 table: `PERSON`→`[Q5]`, `COUNTRY`→sovereign-state set, `PLACE`→settlement set,
        `ORGANIZATION`→org-subtype set). A tunable constant, same convention as `MATCH_THRESHOLD`;
        comment that the exact set is implementation-time judgement to be tuned against the corpus.
      - `WIKIMEDIA_INTERNAL_QIDS` — disambiguation / category / template / list P31 targets to
        exclude (reuse the reconciliation service's `Q17442446` family).
      - `normalizeName(s)` — lowercase, strip diacritics, collapse whitespace, trim; `cs` locale.
      - `scoreCandidate(candidate, entityType, canonicalName)` → `{ score: 0..100, labelMatch,
        typeCoherent, hasCswikiSitelink, isWikimediaInternal }`. `score` = weighted sum
        (label 60 / type 25 / cswiki 10 / popularity 5), for **queue ordering only**.
      - `evaluateAutoLink({ primary, rivals, entityType, canonicalName })` → `{ pass: boolean,
        reasons: string[] }`. Passes iff: exact normalized cs label/alias match **and** type
        coherent **and** has `cswiki` sitelink **and** not Wikimedia-internal **and** no rival
        candidate that also has an exact label/alias match *and* a coherent type.

### Backend — scan orchestration + job

- [ ] `JobName.EntityWikidataScan = 'entity.wikidata.scan'`, payload `Record<string, never>`,
      `EXTERNAL_HTTP_JOB_RETRY_POLICY`. Scheduled in `schedule.ts` (daily, `Europe/Prague`,
      singleton) exactly like `homepage.entity-stats.refresh`.
- [ ] `services/entityWikidataScanService.ts` — injectable-deps orchestration (mirrors
      `runEntityImageEnrichJob`'s deps object). Per run:
      - Load unlinked entities (`wikidataId IS NULL`) with `storyCount >= WIKIDATA_SCAN_MIN_STORY_COUNT`
        (tunable constant) that don't already have a suggestion refreshed within the last N days,
        **capped** at `WIKIDATA_SCAN_MAX_PER_RUN`; `log()` how many were left for the next run.
      - Per entity, **serially**: `resolveByCswikiTitle` + `searchTypedCandidates` → `fetchItemDetails`
        → drop already-rejected qids → `scoreCandidate` each → `evaluateAutoLink` on the primary.
      - Gate passes → optional `reconcile()` cross-check (must return the *same* qid with
        `match: true`); on agreement **auto-link**: `setEntityWikidataId`, `AdminActionLog`
        `entity.wikidata_autolinked` with `actorId = 'system:auto-wikidata'`, enqueue
        `entity.image.enrich`. On `ReconcileUnavailableError` / disagreement → fall through to queue.
      - Otherwise → `upsert` an `EntityWikidataSuggestion` with the ranked candidates (empty
        candidate list after rejection filtering → no suggestion row).
- [ ] `jobs/entityWikidataScanJob.ts` + wire into `worker.ts` (deps object) and the startup log line.

### Backend — suggestion review service + routes

- [ ] `repositories/entityWikidataSuggestion.ts`: `findUnlinkedEntitiesForScan`, `upsertSuggestion`,
      `deleteSuggestion`, `listSuggestions` (queue), `findSuggestionByEntityKey`, `rejectCandidate`,
      `findRejectedQidsByEntity`.
- [ ] `entityWikidataService.ts` gains: `getWikidataSuggestions()` (queue list),
      `confirmSuggestion(entityKey, wikidataId, actorId)` (validates the qid is one of the
      suggestion's candidates, then the same link + `entity.wikidata_linked` + enrich enqueue as
      `linkEntityWikidata`, then deletes the suggestion), `dismissSuggestion(entityKey, actorId)`
      (writes a rejection row per current candidate, deletes the suggestion, logs
      `entity.wikidata_suggestion_dismissed`), `rejectSuggestionCandidate(entityKey, wikidataId,
      actorId)` (one rejection row, drops that candidate from the suggestion, logs
      `entity.wikidata_candidate_rejected`).
- [ ] `routes/entityWikidata.ts` gains `GET /api/admin/entity-wikidata-suggestions`,
      `POST …/:key/confirm` (`{ wikidataId }`), `POST …/:key/dismiss`,
      `POST …/:key/reject-candidate` (`{ wikidataId }`) — all `requireAdmin`.
- [ ] Shared types: `EntityWikidataSuggestionItem { entityKey, canonicalName, type, candidates }`,
      `WikidataSuggestionCandidate { qid, label, description?, score, reasons }`, body schemas
      (reuse the `Q[1-9]\d*` regex).

### Frontend — review queue

- [ ] New `AdminEntityWikidataSuggestionsPage.tsx` at `/admin/entity-wikidata-suggestions`
      (registered in `App.tsx` under `AdminLayout`, `ProtectedRoute`). Mirrors `EntityAliasesPage`:
      a list of entities each with their ranked candidate rows; per candidate a "Propojit" button;
      per candidate a "To není ono" (reject-candidate); per entity a "Žádná shoda" (dismiss). Shows
      each candidate's `score` and `reasons`. Re-fetches after every action (no fixed candidate
      identity across polls — same as the other queues).
- [ ] `services/entityWikidataSuggestions/` client + hooks (mirror `services/entityAliases/`).
- [ ] Add the nav link wherever `AdminLayout` lists the other admin queues.
- [ ] Extract any non-trivial derived display logic into a `*ViewModel.ts` + unit test, per repo
      convention (only if there is real logic — don't invent it).

### Cross-cutting

- [ ] New ADR (0042): the six-condition auto-link rule and its rationale, `actorId =
      'system:auto-wikidata'` + the `entity.wikidata_autolinked` audit action, the suggestion-queue
      + candidate-rejection tables, the reconciliation endpoint as a **non-blocking** cross-check,
      the scheduled-scan trigger, and the explicit decision **not** to use an LLM on the auto path.
      Reference ADR 0022 / ADR 0012 for why this is still safe.
- [ ] Amend `docs/spec-entity-resolution.md` User Story 11: a Wikidata link **may** be auto-applied
      when the deterministic six-condition test passes; every other case stays admin-confirmed;
      alias merges are untouched. Update the Implementation Decisions + Out of Scope sections to
      match (the "Any automated/unconfirmed … Wikidata link" out-of-scope bullet is narrowed, not
      deleted).
- [ ] `CONTEXT.md`: entries for the auto-link rule and the suggestion queue / the
      `system:auto-wikidata` actor.
- [ ] Tests: `entityWikidataMatching` unit (normalization, every gate condition, scoring, type
      mapping); `wikidataReconcileClient` + new `wikidataSearchClient` functions unit (mocked
      fetch); `entityWikidataScanService` unit with all deps mocked (auto-link path; rival blocks
      auto-link; reconcile-unavailable → queue; reconcile-disagree → queue; rejected qid excluded;
      per-run cap respected); `entityWikidataService` suggestion actions unit (repo mocks +
      `AdminActionLog`); repo integration against real Postgres (scan query, upsert/delete,
      rejection uniqueness) + the migration; frontend hooks / view-model.
- [ ] Typecheck + full suites (`test`, `test:integration`, frontend `test`) + lint pass.
      `/code-review` clean.
