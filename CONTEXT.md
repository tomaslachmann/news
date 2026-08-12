# News Triangulator — Domain Glossary

## Seed Article
The single article URL the user provides as the entry point to an investigation. The tool scrapes it to extract search terms and uses it to anchor the story.

## Story
The real-world event being investigated. A story is distinct from any individual Coverage — it is what the Coverages are all about.

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
The UI step between Discovery and Analysis where the user confirms which Coverages to include, deselects irrelevant ones, and optionally adds custom URLs. Paywalled Coverages surface a manual paste field here.

## Discovery
The automated process of finding Coverages for a Story. Uses GDELT as the primary source and RSS polling of eight major Czech outlets as a fallback for recently published articles.

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
