# ADR 0034 — NarrativeDocument: structured, provenance-linked narrative; automatic Entity Image enrichment

## Status
Accepted

## Context
The Cross-Source Narrative today is a flat `DimensionItem[]` — the same shape reused from Analysis Dimensions, just called "segments." It reads as prose but carries no structure a reader can act on: no way to jump from a sentence to the Entity it's about, no way to see which specific Dimension item a passage is restating, no headings/lists for longer stories. Readers want something closer to a written article, with inline references to the people/places/figures involved and their originating Sources, not a wall of undifferentiated paragraphs.

ADR 0012 established the mechanism that keeps the Narrative from adjudicating anything itself: Synthesis computes the four Analysis Dimensions first; the Narrative pass receives them as a binding classification it must respect. That mechanism is not being revisited here — **ADR 0012 remains authoritative for the synthesis → narrative ordering and the rule that Narrative must not introduce, alter, or contradict the authoritative Dimensions.** This ADR only defines a new, richer representation for the Narrative's output and the provenance links inside it.

## Decision

**Document shape.** `SynthesisResult.narrative` becomes a `NarrativeDocument` (`version: 1`), replacing `DimensionItem[]` in place — one canonical narrative representation, not two maintained in parallel:

```ts
interface NarrativeDocument {
  version: 1
  blocks: NarrativeBlock[]
  assertions: NarrativeAssertion[]
  entityRefs: NarrativeEntityRef[]
  sourceRefs: NarrativeSourceRef[]
  valueRefs: NarrativeValueRef[]
}

type NarrativeBlock =
  | { type: 'heading'; level: 2 | 3; children: NarrativeInline[] }
  | { type: 'paragraph'; children: NarrativeInline[] }
  | { type: 'quote'; sourceId: string; children: NarrativeInline[] }
  | { type: 'list'; style: 'ordered' | 'bullet'; items: { children: NarrativeInline[] }[] }

type NarrativeInline =
  | { type: 'text'; text: string }
  | { type: 'entity'; entityId: string; text: string }
  | { type: 'source'; sourceIds: string[]; text: string }
  | { type: 'value'; valueId: string; text: string }
```

The persisted shape is the parsed AST, never raw markup. The LLM emits transport-only inline tags (`<nt:e e1>Petr Fiala</nt:e>`, `<nt:v v1>241 miliard korun</nt:v>`, `<nt:s s1,s2>ČTK a iDNES</nt:s>`) inside plain block text; the backend parses these into `NarrativeInline` runs exactly once, immediately after verification passes, and only the parsed structure is stored. A `paragraph.text` (or any block) containing literal `<nt:...>` syntax in the database is a bug, not a valid state.

A `quote` block always names exactly one `sourceId` — a verbatim quotation has one origin. Two Sources independently reporting the same fact in different words is an `agreement`-type `NarrativeAssertion` over a `paragraph`, never a `quote` block claiming shared authorship of one exact wording.

**Provenance: `NarrativeAssertion`.** Every claim the Narrative makes about agreement/contradiction/unique-reporting/framing must cite back to a specific, already-computed Dimension item:

```ts
interface NarrativeAssertion {
  id: string
  dimension: 'agreement' | 'contradiction' | 'unique_reporting' | 'framing'
  dimensionItemId: string
  entityRefs: string[]
  sourceRefs: string[]
  valueRefs: string[]
}
```

`DimensionItem`/`ContradictionItem` gain a stable `id`, generated once at Synthesis time and persisted — `dimensionItemId` references it directly. Array index is never used as a reference: `verifyAndRepair` (ADR 0014) can reshuffle array contents on retry, which would silently invalidate an index-based reference.

(Named `NarrativeAssertion`, not `NarrativeClaim` — this codebase's `Claim` already means something specific and different: the Factual/Attributed/Interpretive statements Extraction produces per Coverage. Reusing "claim" for a Dimension-citation would collide with that.)

**Values are not LLM arithmetic.** `NarrativeValueRef` is `{ ref, text, sourceIds, normalizedValue, unit }`, but the LLM only ever emits `text` and `sourceIds`. `normalizedValue`/`unit` (e.g. "241 miliard korun" → `241000000000` / `CZK`) are derived by a deterministic backend parser as a post-processing enrichment step, `null` when the text can't be safely parsed — consistent with how this codebase never trusts an LLM with a computation a deterministic check can verify instead (ADR 0014).

**Validation, layered — schema validation is not semantic verification:**

```
Narrative LLM call
    ↓
strict JSON Schema (OpenAI Structured Outputs)   — shape, required fields, union variants
    ↓
Zod parse
    ↓
verifyAndRepair (semantic)                        — dangling entity/source/value refs,
    ↓                                                broken inline markup, quote not a
    ↓                                                verbatim substring of its Source,
    ↓                                                assertion citing a nonexistent
    ↓                                                dimensionItemId
inline markup parsed to NarrativeInline AST (once)
    ↓
persisted
```

The narrative call moves from today's loose `json_object` mode to strict `json_schema` Structured Outputs — which model that requires is a separate, later decision made against whatever's actually configured in the stack at build time, not fixed by this ADR. Structured Outputs catches shape-level failures; `verifyAndRepair` still owns everything schema validation can't — the same split ADR 0014 already established for Extraction/Synthesis, just extended to a single-document (not array-of-items) payload.

**Failure handling.** A `NarrativeDocument` failing semantic verification is retried whole, once (a repair prompt scoped to the entire document, not a per-item retry — there is no meaningful way to "drop" one bad block from a otherwise-coherent article the way a bad Extraction item can just be dropped from an array). If the retry also fails, the job fails and falls back to `narrative.generate`'s existing pg-boss retry policy (ADR 0028). A `NarrativeDocument` is never persisted partially valid.

**Entity Image, fetched via a new job.** `EntityImage` (v1: Wikimedia provider only, no `isPrimary` — nothing to prioritize among until a second provider exists) is fetched automatically once an Admin links `Entity.wikidataId` (ticket 41; linking itself stays Admin-confirmed and manual, unchanged). The fetch is **not** part of the linking transaction — it's enqueued only after that transaction commits, as a new job:

```ts
JobName.EntityImageEnrich = 'entity.image.enrich'
```

added to the existing job registry (ADR 0028) alongside `entity.extract`/`narrative.generate`/`thread.recompute`, with its own worker handler and retry policy. A failed or empty enrichment never rolls back or blocks the `wikidataId` link — the Entity simply has no image.

**Entity API reconciled, not reinvented.** The public entity surface uses `Entity.key` (not `Entity.id`) as its route/identifier — `GET /api/entities/:key`, `/entity/:key` — matching what tickets 42/43 already spec. `Entity.id` stays a purely internal DB identity, never exposed. `EntityDetail`'s `relatedEntities`/`relatedStories` extend ticket 42's existing design rather than introducing a competing one. `AnalysisContext.entities`/`entityRelations` carries the **full** Story-level entity graph (every `StoryEntity`/`StoryEntityRelation` row), not filtered down to only what the Narrative inline-tagged — the point of that sidebar is surfacing subjects the prose didn't dwell on. `StoryEntityRelation.confidence` stays `Float`, untouched.

`entities`/`sourceRefs` referenced by `assertions` are not required to also appear inline-tagged in prose, or vice versa — "use entities sparingly" (most candidate Entities should not get an inline tag; the same Entity is typically tagged only once, at first significant mention) is a soft prompt instruction only, with no deterministic enforcement in v1. Over-tagging is a readability nit, not a factual-accuracy failure, so it doesn't get the same enforcement machinery as ref/quote/citation correctness.

## Consequences
- `SynthesisResult.narrative`'s shape changes — a breaking change for any existing COMPLETE Analysis. Rollout order: ship the parser and new read path first, backfill every historical Analysis by re-enqueuing `narrative.generate` (ADR 0028's existing job, no new mechanism needed), then remove any code still assuming the old `DimensionItem[]` shape. No dual-format period in the database.
- Ticket 20's shipped `NarrativeArticle` frontend rendering (numbered superscript citations, flat References section) is replaced, not kept alongside — a separate, later ticket, blocked by the backend ticket this ADR describes (mirroring the ticket 40/46 backend-then-Admin-UI split).
- `docs/spec-entity-resolution.md` (tickets 40/41) needs updating to fold in `EntityImage` and the `entity.image.enrich` job; it wasn't written with this ADR's decisions in mind.
- A new operational surface: `entity.image.enrich` is one more job type the worker process (ADR 0028) must handle, calling out to Wikimedia — a new external dependency on the worker's request path, distinct from the LLM calls the other jobs make.
