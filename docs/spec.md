# Spec — News Triangulator v1

## Problem Statement

When a reader encounters a news article about an event, they get one outlet's version of the story — shaped by that outlet's framing, word choices, omissions, and incentives. Reading multiple articles helps, but leaves the reader holding five contradictions with no structured way to separate what is agreed fact, what is disputed, what only one outlet chose to report, and where the difference is in presentation rather than content. The effort required to do this manually is high enough that most readers don't bother.

## Solution

A locally-run web tool that accepts a single seed article URL, automatically discovers 5+ Czech news outlets covering the same story, and produces a structured four-dimension analysis: what all sources agree on, where they factually contradict each other, what only one source reported, and how framing differs across outlets. Every claim traces back to its source, with the original Czech quote preserved. The reader makes their own judgement — the tool makes the shape of the disagreement visible.

## User Stories

### Input & Discovery

1. As a user, I want to paste a single article URL, so that I can start investigating a story without manually locating other sources.
2. As a user, I want the tool to scrape the seed article and extract Czech search terms automatically, so that I don't have to describe the story in keywords myself.
3. As a user, I want to see and edit the extracted search terms before the search fires, so that I can correct mistranslations or vague terms.
4. As a user, I want the tool to query GDELT for Czech-language articles matching those terms, so that I get broad coverage across many outlets.
5. As a user, I want the tool to fall back to RSS polling of major Czech outlets for very recent stories, so that breaking news is discoverable even before GDELT indexes it.
6. As a user, I want discovered articles to be deduplicated so that each outlet appears at most once, so that the analysis isn't skewed by multiple articles from the same source.

### Review Step

7. As a user, I want to see all discovered articles before analysis runs, so that I can verify they cover the story I care about.
8. As a user, I want to deselect individual articles from the list, so that unrelated stories don't pollute the analysis.
9. As a user, I want to add custom article URLs in the review step, so that I can include sources the discovery layer missed.
10. As a user, I want to be warned when fewer than 5 sources are confirmed, so that I understand triangulation may be limited.
11. As a user, I want paywalled or unextractable articles to show a "could not extract" badge in the review step, so that I know which sources couldn't be read automatically.
12. As a user, I want to paste article text manually for paywalled sources directly in the review step, so that I can still include them in the analysis.
13. As a user, I want to proceed with analysis even when some sources failed extraction, so that a single paywall doesn't block the whole investigation.

### Analysis Streaming

14. As a user, I want the confirmed source list to appear immediately after the review step, so that I'm not staring at a blank loading screen.
15. As a user, I want per-article extraction results to stream in as each one completes, so that I can see what the model understood from each source before synthesis begins.
16. As a user, I want the synthesis to stream as it is generated, so that I get partial results as fast as possible.
17. As a user, I want a clear progress indicator during analysis, so that I can tell the pipeline is running and how far along it is.

### Analysis Results — Agreement Tab

18. As a user, I want to see a dedicated tab for facts all sources agree on, so that I can quickly identify what is undisputed.
19. As a user, I want each agreed fact to show which outlets confirmed it, so that I can see the strength of the consensus.
20. As a user, I want to hover over an agreed fact to see the original Czech quote from each source, so that I can verify the analysis against the actual text.
21. As a user, I want to click an outlet badge to open the original article in a new tab, so that I can read the full source.

### Analysis Results — Contradiction Tab

22. As a user, I want to see a dedicated tab for factual contradictions between sources, so that I can identify where outlets report incompatible facts.
23. As a user, I want each contradiction to show the specific claim from each outlet side by side, so that I can compare them directly.
24. As a user, I want contradictions to be limited to logically incompatible facts (different numbers, actors, sequences), so that differences in emphasis are not mislabelled as contradictions.
25. As a user, I want to hover over each side of a contradiction to see the original Czech quote, so that I can verify whether the contradiction is real or a translation artefact.

### Analysis Results — Unique Reporting Tab

26. As a user, I want to see a dedicated tab for claims made by only one outlet, so that I can spot what others chose not to report.
27. As a user, I want each unique claim to be attributed to its source, so that I know which outlet made it.
28. As a user, I want to hover to see the original Czech quote for each unique claim, so that I can read it in context.

### Analysis Results — Framing Tab

29. As a user, I want to see a dedicated tab for framing differences, so that I can understand how outlets package the same facts differently.
30. As a user, I want framing differences to cover word choice, headline emphasis, emotional register, and expert source selection, so that subtle editorial decisions are surfaced.
31. As a user, I want framing differences to be distinguished from factual contradictions, so that I understand when outlets disagree on facts vs. on presentation.
32. As a user, I want examples of the contrasting language from each outlet in the framing tab, so that the differences are concrete rather than abstract.

### Language & Attribution

33. As a user, I want all analysis prose to be in Czech, so that I don't have to switch languages between the tool's synthesis and the Czech quotes it cites — the audience is Czech-speaking, and mixed-language paraphrase-plus-verbatim-quote was the actual friction, not a lack of English. See ADR 0016.
34. As a user, I want original Czech quotes to appear verbatim, so that exact wording is preserved where it carries meaning.
35. As a user, I want each claim to carry an outlet name badge, so that every assertion is traceable to its source.

### History

36. As a user, I want to navigate to a /history page to see all past analyses, so that I can revisit previous investigations.
37. As a user, I want each history entry to show the seed article headline, the date, and the outlet count, so that I can identify analyses at a glance.
38. As a user, I want to click a history entry to reopen the completed analysis, so that I don't have to re-run it.

### Configuration & Deployment

39. As a user, I want to run the tool with a single `docker compose up`, so that setup requires no manual dependency installation.
40. As a user, I want to configure AI model names via `EXTRACTION_MODEL` and `SYNTHESIS_MODEL` environment variables, so that I can switch models without changing code.
41. As a user, I want my analysis history to persist across container restarts, so that I don't lose past work.
42. As a user, I want all my data (articles, analyses) to stay on my machine, so that nothing is sent to third-party storage.

## Implementation Decisions

### Stack
- **Frontend**: React + TypeScript, built with Vite, served by nginx in Docker
- **Backend**: Fastify + TypeScript
- **Database**: PostgreSQL (separate Docker Compose service)
- **AI client**: OpenAI SDK (`openai` npm package), pointed at OpenAI's API
- **Deployment**: Docker Compose with three services — nginx/frontend, Fastify backend, PostgreSQL

### Discovery Layer
- **Primary**: GDELT DOC API queried with `sourcelang:Czech` and `sourcecountry:CZ`. Keyword terms are derived by an LLM call against the scraped seed article title + first few paragraphs. The user edits these terms before the query fires.
- **Fallback**: RSS polling of iDnes, Novinky, Aktuálně, ČT24, Seznam Zprávy, iRozhlas, Hospodářské noviny, Deník — used for articles too recent to appear in GDELT's 15-minute index.
- **Deduplication**: one Coverage per unique domain, first match wins across both layers.
- **Max results**: cap at 10 candidates before the Review Step; the user trims from there.

### Content Extraction
- HTTP fetch + Mozilla Readability (the npm port) to strip boilerplate and extract article body.
- No headless browser — most Czech outlets do not require JavaScript rendering for their article text.
- No caching — articles are always re-fetched at Analysis time (see ADR 0004).
- Paywalled or empty extractions surface a manual paste field in the Review Step.

### Analysis Pipeline (see ADR 0001)
Two-pass:
1. **Extraction**: one LLM call per Coverage (using `EXTRACTION_MODEL`), run in parallel. Each call returns:
   - List of factual claims (who/what/when/where assertions)
   - List of attributed claims ("X said Y")
   - List of interpretive statements
   - List of framing signals (headline word choice, emphasis, emotional register, expert sources quoted)
   - Source metadata (outlet name, publication date, article URL)
2. **Synthesis**: one LLM call (using `SYNTHESIS_MODEL`) receiving all Extraction outputs. Returns the four Analysis Dimensions with claim-level source attribution including original Czech quote for each claim.

### Contradiction vs. Framing Boundary
**Contradiction**: two Sources assert logically incompatible facts about the same event — different numbers, different actors, different event sequences. A contradiction is a factual incompatibility that cannot be true simultaneously.

**Framing**: the same facts presented with different word choice, headline emphasis, emotional register, or choice of expert sources. Framing differences are not contradictions — both descriptions can be simultaneously true.

The Synthesis prompt must encode this distinction precisely.

### Streaming
- Fastify emits Server-Sent Events (SSE) on the analysis endpoint.
- Event sequence: `sources-confirmed` → per-article `extraction-complete` events → `synthesis-complete`.
- React consumes the SSE stream and renders each event as it arrives.

### Source Attribution in UI
- Each claim carries an outlet name badge.
- Hovering the badge shows the original Czech quote in a tooltip.
- Clicking the badge opens the original article URL in a new tab.

### Minimum Source Warning
- If the user confirms fewer than 5 Coverages in the Review Step, a warning banner appears but analysis is not blocked.

### PostgreSQL Schema (high-level)
- `analyses` — one row per completed Analysis (id, seed_url, seed_headline, created_at, status)
- `coverages` — one row per Coverage used in an Analysis (analysis_id, outlet, article_url, extracted_text, extraction_result JSONB)
- `synthesis_result` — one row per Analysis (analysis_id, dimensions JSONB)

### AI Model Configuration
Both model names are read from environment variables at runtime:
- `EXTRACTION_MODEL` — used for per-Coverage Extraction calls
- `SYNTHESIS_MODEL` — used for the Synthesis call
Both default to `gpt-4o` if unset.

## Testing Decisions

A good test verifies observable behavior at the HTTP boundary — what the API returns given specific inputs — not internal implementation details like how a service class is structured or which function it calls internally.

### Seam
The primary test seam is the **Fastify HTTP API**. Tests send HTTP requests and assert on HTTP responses (status codes, response bodies, SSE event sequences). A single seam minimises the surface area and ensures tests survive internal refactors.

### What to test
- `POST /api/analyses` — given a mocked GDELT response and mocked article fetches, returns the correct candidate list
- `GET /api/analyses/:id/stream` — given mocked Extraction and Synthesis LLM responses, emits the correct SSE event sequence in the correct order
- `GET /api/analyses` — returns the correct history list from a seeded PostgreSQL state
- Extraction failure path — when article fetch returns a paywall response, the coverage appears with `status: "extraction-failed"` in the SSE stream
- Below-minimum warning — when fewer than 5 coverages are confirmed, the stream includes a `warning: "below-minimum"` event

### Mocking strategy
- OpenAI calls: mock at the HTTP level (e.g. `nock` or `msw`) rather than mocking the SDK client, so the prompt construction is also exercised
- GDELT and RSS fetches: mock at the HTTP level
- Article fetches: mock at the HTTP level with fixture HTML files for realistic Readability extraction

## Out of Scope

- Authentication or multi-user access — this is a single-user local tool
- Non-Czech sources or multi-language analysis
- Real-time monitoring or alerts for new coverage of a story
- Paywall bypass beyond manual paste
- Truth scoring, credibility ratings, or declaring a "winner" among sources
- Mobile application
- Semantic deduplication — if GDELT returns two articles from the same outlet, first match wins; no LLM-based similarity check
- Scheduled or background re-analysis as new coverage appears

## Further Notes

The tool is intentionally non-opinionated. It surfaces the shape of disagreement — it does not resolve it. The four Analysis Dimensions are informational outputs, not verdicts. The reader decides what to make of them.

The choice to preserve Czech quotes verbatim is load-bearing: the exact phrasing of a claim is often the point. "Demonstranti" vs. "extremisté" for the same group of people is not a translation issue — it is the framing difference the tool exists to surface.
