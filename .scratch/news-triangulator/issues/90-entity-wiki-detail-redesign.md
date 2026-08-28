# 90 — Entity detail page: real "wiki" surface, not just a name

**Type:** feature

**What to resolve:** User ask (verbatim): "lets continue with entity detail, we need to create human
trendy design that will be our 'wiki' like, we need to have some information about that entity as
well not just name." Asked for "everything" when offered a scoped-vs-full choice.

Today `/entity/:key` (`EntityDetailPage.tsx`) is a bare utility header (type kicker, name, a
Wikidata-link line, an aliases line) plus two flat lists — mentioning Events, entity relations. No
image (even though `EntityImage` is fetched and stored — the Narrative renders it, this page
doesn't), no description, no stats. It reads like a debug view, not a wiki entry.

**Research done before filing** (2026-08-28, confirmed against the code):

- `Entity` has `wikidataId`, `storyCount`, and `EntityImage[]` (0/1, Wikimedia, fetched by the
  `entity.image.enrich` job once an Admin links `wikidataId`). No description field.
- `searchWikidataEntities` (`wikidataSearchClient.ts`) already returns the Wikidata one-line
  `description` — the Admin sees it when picking the link, but it's never persisted.
- The `entity.image.enrich` job already has `wikidataId` in hand and calls Wikidata's `wbgetclaims`
  for `P18`. It's the natural place to also pull the Wikidata description and the Czech Wikipedia
  intro extract (via the `cswiki` sitelink → `cs.wikipedia.org/api/rest_v1/page/summary/{title}`,
  free, no key).
- `docs/spec-entity-wiki.md` — User Story 4 / Out of Scope / ADR 0012: an entity page is "a
  navigational aggregation of what this tool's coverage has said, not an authoritative
  biography/encyclopedia entry." Any external prose must be visibly attributed as external, never
  presented as this tool's own reporting. (An LLM-authored "what our coverage says about X" summary
  is deliberately **not** in scope — it's exactly the authoritative-bio framing the spec warns
  against, and it costs money per entity.)
- `.layout` / `.layout__rail` (ds/components.css) is the existing main-column + right-rail grid —
  the infobox shape a wiki page needs, already in the design system.
- `docs/research/2026-news-portal-visual-design.md`: "no major outlet frames its redesign around
  abstract 'trends' — each choice is justified by a concrete problem." "Trendy" here = the same
  editorial serif/semantic-token/mobile-first system the polished pages already use, applied to a
  wiki layout — not a novel visual language.

**Blocked by:** none.

**Status:** done

### Backend — enrichment

- [x] `Entity` gains `wikidataDescription String?`, `wikipediaExtract String?`, `wikipediaUrl
      String?`. Hand-written migration (no `prisma migrate dev`), additive nullable columns, no
      backfill (ADR 0021).
- [x] Persist the Wikidata `description` at link-confirm time (`linkEntityWikidata` /
      `setEntityWikidataId`) — it's already in the `searchWikidataEntities` result the Admin picked
      from; thread it through rather than re-fetching.
- [x] New `wikipediaClient.ts`: given a `wikidataId`, resolve the `cswiki` sitelink title (Wikidata
      `wbgetentities?props=sitelinks&sitefilter=cswiki`) and fetch `cs.wikipedia.org`'s REST
      `page/summary` — return `{ extract, url }` or null. Uses the shared `fetchWithTimeout` with
      the honest contact UA (Wikimedia asks for it, doesn't bot-block — ADR 0040 scope note).
- [x] `entity.image.enrich` job (rename to `entity.enrich` — it's no longer only about the image)
      also fetches + persists `wikipediaExtract`/`wikipediaUrl`. Best-effort, same as the image: a
      failed lookup completes the job with no description, never blocks or rolls back. Redelivery-safe.

### Backend — read model

- [x] `EntityDetail` gains: `imageUrl`, `wikidataDescription`, `wikipediaExtract`, `wikipediaUrl`,
      `storyCount`, `firstEventAt`/`lastEventAt` (null when no COMPLETE Event mentions it),
      `relationCount`, and `coMentions: { key, canonicalName, type, sharedStoryCount }[]` (top N
      entities sharing the most Stories with this one), and `mentionTimeline: { month, count }[]`
      (COMPLETE-Event mentions bucketed by month).
- [x] New `repositories/entity.ts` reads: `findEntityStats(entityKey)` (first/last event date, event
      count), `findCoMentionedEntities(entityKey, limit)`, `findMentionTimeline(entityKey)`. All
      plain indexed Postgres, no LLM (spec User Story 9). Bounded (spec User Story 10).
- [x] `getEntityDetail` / `toEntityDetail` assemble the above; all reads run concurrently.

### Frontend — wiki redesign

- [x] `EntityDetailPage.tsx` → two-column `.layout` wiki layout:
      - Hero: type kicker, name (serif display), Wikidata one-liner as dek.
      - Rail infobox: `EntityImage` photo (with attribution), key-facts list (type, aliases,
        first/last seen, event count, relation count), external links (Wikidata, Wikipedia).
      - Lead: the Wikipedia extract in a bordered "external context" box with an explicit
        *"Z Wikipedie — není to zpravodajství tohoto nástroje"* disclaimer (spec User Story 4).
      - Mention timeline: a small bar/area chart (reuse the recharts setup ThreadPage/
        NarrativeArticle already use).
      - "Často zmiňováno spolu s": the co-mentions list, each linking to its own entity page.
      - Redesigned "Zprávy zmiňující tuto entitu" + "Vztahy" sections (keep the attributed-relation
        framing — ADR 0022).
      - Graceful when unlinked: no image / description / Wikipedia box, everything else still renders.
- [x] `EntityDetailPage.css`: new wiki vocabulary (`.ewiki*` / infobox / lead box / timeline),
      page-scoped per convention. Mobile: rail collapses under the main column.
- [x] Extract the page's derived display logic into `entityDetailViewModel.ts` + unit tests
      (the repo's pure-helper + `.test.ts` pattern).

### Cross-cutting

- [x] ADR: document the entity-page-as-external-context stance concretely (which external text is
      shown, how it's attributed, why no LLM summary) — the spec flagged "New ADR expected at
      implementation time" and this is the wave that surfaces external prose.
- [x] Tests: repo integration (stats, co-mentions, timeline against real Postgres); `wikipediaClient`
      unit (sitelink resolve + summary fetch + null paths); enrich job unit (description persisted,
      Wikipedia failure tolerated); service-layer `getEntityDetail` shape; frontend view-model.
- [x] Typecheck + full test suites pass. `/code-review` clean.


**Implementation notes (2026-08-28):**
- Job kept its name `entity.image.enrich` (not renamed to `entity.enrich`) — a rename orphans its
  pg-boss queue; the handler now runs two independent best-effort steps (image, external context).
- The Wikidata description is fetched by the job (`findWikidataContext`), not threaded through
  link-confirm — one source of truth, and it re-enriches an already-linked entity on job re-run.
- `EntityDetail.imageUrl` became `image: EntityWikiImage | null` (url + author/license/sourceUrl)
  so the infobox can credit the photo (Wikimedia licensing), same as the Narrative lead image.
- Stats field names landed as `firstMentionAt`/`lastMentionAt`/`eventCount` (not `firstEventAt`
  etc.); `storyCount` was *not* added to `EntityDetail` — `eventCount` (COMPLETE-only) is the
  reader-facing number, and the cross-status `Entity.storyCount` is an internal scoring signal.
- CSS vocabulary is `.ew*` (not `.ewiki*`).
- `formatCzechCount` moved from `homePageViewModel` to `lib/formatCount.ts` (4th consumer).
- ADR 0041 records the external-context stance; CONTEXT.md gains an "Entity page" entry.
- Route-level parameter-validation tests: the entity routes have no existing test harness and
  take only a path `:key` + optional `?cursor` (already covered) — no new route test added.
- Visually verified against the live dev app (Haakon VII. entity page): wiki layout renders,
  degrades gracefully. The photo/Wikipedia text are absent for entities linked before this ships
  — the enrich job only runs on `linkEntityWikidata`, and nothing re-enqueues it for the existing
  corpus (ADR 0021 no-backfill). A re-link, or a one-off re-enqueue, enriches them.
