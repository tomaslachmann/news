import type { MatchDecidedBy, MatchDecision } from '@prisma/client'
import { prisma } from '../db.js'

export type { MatchDecidedBy, MatchDecision }

/** Mirrors embeddingClient.ts's EmbeddingCallSite ('ingestion' | 'submissionDedup') — duplicated
 *  here rather than imported, since repositories/ don't import from services/ (ADR 0010; same
 *  convention as entityTypes.ts being kept out of repositories/storyRelation.ts). A real union
 *  instead of a bare `string` so a typo or a future third call site can't silently fragment
 *  MatchDecision rows by inconsistent spelling, which would corrupt the per-callSite
 *  calibration this table exists for. */
export type MatchDecisionCallSite = 'ingestion' | 'submissionDedup'

export interface NewMatchDecision {
  callSite: MatchDecisionCallSite
  candidateStoryId: string | null
  candidateAnalysisId: string | null
  score: number | null
  thresholdMatched: boolean
  llmVerdict: boolean | null
  decidedBy: MatchDecidedBy
  scorerVersion: string
}

/** Records one same-event matching decision (evaluateMatch, storyMatching.ts) — see ADR 0025 /
 *  docs/audit.md P1-7. Never read by any product surface; exists purely so MATCH_THRESHOLD can
 *  eventually be calibrated against real data instead of the guess its own comment admits it
 *  is. */
export async function recordMatchDecision(data: NewMatchDecision): Promise<MatchDecision> {
  return prisma.matchDecision.create({ data })
}

/** recordMatchDecision, but a logging failure must never break the matching decision it's
 *  recording — same convention as llmCallLog.ts's recordLlmCall/recordLlmCallSafe split. Used
 *  by every real call site (ingestionService.ts, analysisService.ts). */
export async function recordMatchDecisionSafe(data: NewMatchDecision): Promise<void> {
  try {
    await recordMatchDecision(data)
  } catch (err) {
    console.error('Failed to record match decision', err)
  }
}
