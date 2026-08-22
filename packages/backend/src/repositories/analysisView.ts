import { prisma } from '../db.js'

/** Records one anonymous "read" event (ticket 61) — see `AnalysisView`'s own schema comment for
 *  why this carries nothing that could identify who read it. The caller (`analysisService.ts`)
 *  is responsible for only calling this for a COMPLETE Analysis; this function itself does no
 *  existence/status check — it's a plain, unconditional insert. */
export async function createAnalysisView(analysisId: string): Promise<void> {
  await prisma.analysisView.create({ data: { analysisId } })
}
