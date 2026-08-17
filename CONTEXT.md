# News Triangulator — Domain Glossary

## Seed Article
The single article URL the user provides as the entry point to an investigation. The tool scrapes it to extract search terms and uses it to anchor the story.

## Story
The real-world event being investigated. A story is distinct from any individual Coverage — it is what the Coverages are all about. A persisted entity (one row per real-world event, `Analysis.storyId`) holding an `anchorHeadline` — the seed/triggering article's title — that every candidate article is checked against before it's allowed to become Coverage on that Story. Created in the same transaction as its Analysis, so Discovery/Ingestion's "does this look like the same event" question always has a stable, independent thing to compare against, separate from Analysis's own DRAFT/PENDING/COMPLETE/FAILED lifecycle. Also holds an embedding (computed from its `anchorHeadline` and excerpt), used by the same-event classification step Ingestion and human-seeded submission now share — every Story gets one, Ingestion-originated or human-seeded — see ADR 0018 and ADR 0019.

## Source
A distinct news outlet (e.g. iDnes, ČT24, Novinky). Each Source contributes at most one Coverage per Analysis.

## Coverage
A single article from one Source about a Story. The unit of input to the Analysis pipeline.

## Extraction
Pass 1 of the Analysis pipeline. One LLM call per Coverage that produces a structured set of Claims — factual, attributed, and interpretive — plus Framing Signals.

## Synthesis
Pass 2 of the Analysis pipeline. A single LLM call that receives all Extracted Coverage objects and produces the four Analysis Dimensions.

## Claim
A discrete statement made in a Coverage. Claims are one of three kinds:
- **Factual claim** — a verifiable assertion about who, what, when, or where
- **Attributed claim** — a statement of the form "X said Y", where the truth of Y is not asserted by the Source
- **Interpretive statement** — an opinion, conclusion, or framing presented as if factual

## Framing Signal
An observable feature of a Coverage that carries meaning independent of its factual content: headline word choice, which facts are emphasised, what is buried late in the article, emotional register, choice of expert sources quoted.

## Analysis
The completed four-dimension triangulation of a Story, produced from ≥ 1 Coverages. Stored in PostgreSQL.

## Analysis Dimensions
The four outputs of Synthesis:
- **Agreement** — claims confirmed by all or most Sources
- **Contradiction** — pairs of Claims from different Sources that are logically incompatible (different numbers, actors, or sequences for the same event)
- **Unique Reporting** — a Claim made by exactly one Source that the others omit entirely
- **Framing** — the same facts packaged with different Framing Signals across Sources

Contradiction and Framing are mutually exclusive: a Contradiction is a factual incompatibility; Framing is the same facts presented differently.

## Review Step
The UI step between Discovery and Analysis where the user confirms which Coverages to include, deselects irrelevant ones, and optionally adds custom URLs. Blocked Coverages surface a manual paste field here.

## Blocked Coverage
A Coverage whose scraped text is actually a subscription paywall, cookie-consent wall, or bot-block interstitial rather than the real article — detected by matching extracted text against a list of known block-page phrases, not by length alone (a block page can easily be longer than a short real article).
_Avoid_: Paywalled Coverage — too narrow, implies every block is a subscription wall.

## Discovery
The process of finding Coverages for a Story that already has a seed (a human-submitted Seed Article, or a candidate found by Ingestion). Uses GDELT as the primary source and RSS polling of eight major Czech outlets as a fallback for recently published articles, then LLM-verifies each candidate against the seed's anchor headline before it becomes Coverage. Distinct sourcing from Ingestion (see below); shares its same-event classification approach with Ingestion where cost allows — see ADR 0019.

## Ingestion
The automated, scheduled process of finding brand-new articles across all monitored outlets, independent of any existing Story, and creating a Draft Analysis for each one that isn't already a duplicate of a Story being tracked. Distinct *sourcing* from Discovery: Discovery searches GDELT/RSS on demand for one specific seed; Ingestion continuously polls known feeds with no target seed at all. Triggered externally via a shared-secret-authenticated endpoint, not a User session — no Role applies to it.

Same-event *classification* (deciding whether a candidate describes the same real event as an anchor headline) is a mechanism Ingestion and human-seeded submission now share, at different cost budgets — see ADR 0019. Both start from a cheap embedding-similarity comparison against recently-open Stories (no LLM call). Ingestion's own per-item attach decision stops there — no LLM call, no Discovery search, on its hot path (ADR 0018) — with a bulk LLM verification pass deferred to once, at Draft approval, before Extraction. Human-seeded submission (`POST /api/analyses`) affords one more step: an LLM confirmation of the embedding match, since it's a rare, real-time, human-waited call rather than a high-frequency poll — see Draft Analysis below and ADR 0019.

## Draft Analysis
An Analysis created automatically by Ingestion, not yet reviewed by an Admin. Starts with only its triggering article as Coverage — other outlets' coverage of the same Story accumulates organically as Ingestion matches their own RSS items against it on later polls, not from an eager search at creation time (see ADR 0018). Extraction and Synthesis have not run — no LLM cost is spent until an Admin approves it from the review queue. Never shown on the reader-facing Article listing.

Below a minimum attached-source count, a Draft stays hidden from the Ingestion review queue — a live visibility filter, not a separate promotion step, so it appears the moment a later poll pushes it over the threshold. Ingestion keeps attaching Coverage to it in the background regardless. This only affects the dedicated review queue; an Admin's general History listing still shows every Draft, any source count. Approval remains entirely manual — nothing auto-approves once visible (see ADR 0018).

## Cross-Source Narrative
A generated continuous-prose narrative for a completed Analysis, built from the full text of every Coverage plus the Analysis's four Dimensions. The Dimensions act as a binding classification the Narrative must respect — Agreement is stated plainly with every confirming Source cited, Contradiction is presented as unresolved disagreement, Unique Reporting is attributed to its one Source, Framing differences are described rather than smoothed over — so it can be detailed without ever resolving a disputed fact itself. Generated once, on first view of an Analysis, and cached.
_Avoid_: Combined article — collides with Coverage, which is also "an article" from one Source.

## Article
The reader-facing name for a completed Analysis, shown to anyone without a login — nav labels, page titles, the public listing page. Presentation only; the underlying domain entity, database table, and API are still called `Analysis`.
_Avoid_: using "Article" for a Coverage — a Coverage is a single-source article; "Article" always refers to the full multi-source Analysis/Cross-Source Narrative.

## Headline
Three distinct concepts share the word "headline" and must not be conflated:
- **`Story.anchorHeadline`** — the seed/triggering article's original title, fixed at Story creation, used only as the comparison anchor for same-event classification (see Story above). Never shown to a reader.
- **`Analysis.seedHeadline`** — the working title shown while an Analysis is still DRAFT/PENDING, always one Source's original headline (whichever article seeded the Analysis). Stays a single source's phrasing because no tool-authored alternative exists yet at that stage.
- **`SynthesisResult.headline`** — the tool-authored headline for a COMPLETE Analysis, generated once from only the Agreement dimension (never Contradiction/Unique Reporting/Framing, and never any Source's original wording) so it never states as settled fact something the Sources dispute. Generated eagerly, in the same transaction that flips an Analysis to COMPLETE — an Analysis is never COMPLETE without one, unlike the lazily-generated, cached Cross-Source Narrative. Null only when Agreement was empty at completion time (nothing safe to headline) or for an Analysis completed before this field existed. This is what a reader sees as the Article's title once triangulation is done — see ADR 0021.
_Avoid_: showing any Source's original headline once an Analysis is COMPLETE — that is exactly the single-source framing this tool exists to move past.

## Extraction Model
The AI model used for the per-Coverage Extraction pass. Configurable via the `EXTRACTION_MODEL` environment variable.

## Synthesis Model
The AI model used for the cross-Coverage Synthesis pass. Configurable via the `SYNTHESIS_MODEL` environment variable.

## User
A person with credentials (email + bcrypt-hashed password) and a Role, stored in the database. Users authenticate via username/password and receive a JWT in an httpOnly cookie.

## Role
An enum on User. Two values:
- **Admin** — can submit Seed Articles, trigger Discovery, confirm the Review Step, and trigger Analysis. Can also read all Analyses and history.
- **ReadOnly** — can view completed Analyses and history. Cannot initiate any new Analysis or mutate any data.

## Auth Boundary
The line between operations that require authentication and those that do not. Reading completed Analyses and history requires no authentication. All mutating operations (creating an Analysis, triggering Discovery, confirming coverages, streaming results) require a valid JWT and Admin role.

## LLM Call Log
A durable, queryable record of one LLM call — what was sent (model, system prompt, user content), what came back (the raw response) or the error thrown, which part of the pipeline made it, and when. Recorded for debugging, not for any product-facing purpose — a maintainer's tool for investigating why a pass failed or behaved unexpectedly, inspected via Prisma Studio rather than surfaced anywhere in the app itself. Not linked to any Analysis/Coverage/Story; not pruned. See ADR 0020.
