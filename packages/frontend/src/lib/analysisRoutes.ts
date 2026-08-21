/** The two routes an Analysis id can resolve to (ticket 52) — `articlePath` for the public,
 *  reader-facing finished Article (`/article/:id`, `ArticlePage`), `analysisPath` for the
 *  Admin-only monitoring view (`/analysis/:id`, `AnalysisPage`). One place for both, rather than
 *  every call site hand-building the template string itself — a future rename or a third route
 *  only needs to change here. */
export function articlePath(analysisId: string): string {
  return `/article/${analysisId}`
}

export function analysisPath(analysisId: string): string {
  return `/analysis/${analysisId}`
}
