import type { MatchDecidedBy, MatchDecision } from '@prisma/client'
import { prisma } from '../db.js'

export type { MatchDecidedBy, MatchDecision }

export interface NewMatchDecision {
  callSite: string
  candidateStoryId: string | null
  candidateAnalysisId: string | null
  score: number | null
  thresholdMatched: boolean
  llmVerdict: boolean | null
  decidedBy: MatchDecidedBy
  scorerVersion: string
}

/** Records one same-event matching decision (findBestMatch, storyMatching.ts) — see ADR 0025 /
 *  docs/audit.md P1-9. Never read by any product surface; exists purely so MATCH_THRESHOLD can
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
