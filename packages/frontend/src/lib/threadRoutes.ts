/** The dedicated Thread page's route (ticket 68/69) — one place so a future rename only changes
 *  here, same convention as `analysisRoutes.ts`'s `articlePath`/`analysisPath`. */
export function threadPath(slug: string): string {
  return `/thread/${slug}`
}
