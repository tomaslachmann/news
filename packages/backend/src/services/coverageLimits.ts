// Bounds total Coverage per Analysis regardless of how many separate calls contributed —
// MAX_CUSTOM_URLS (shared, request-level) alone doesn't stop many small requests from
// accumulating past a sane total over time, and Ingestion/Discovery can each add rows outside any
// single request entirely. Each row is a real scrape and, downstream, LLM spend. See
// docs/audit.md P0-7, ticket 03. Its own module (not declared in analysisService.ts) so
// ingestionService.ts can import it without an analysisService.ts <-> ingestionService.ts cycle.
export const MAX_COVERAGES_PER_ANALYSIS = 25
