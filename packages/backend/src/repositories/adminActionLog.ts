import type { AdminActionLog } from '@prisma/client'
import { prisma } from '../db.js'

export type { AdminActionLog }

/** Every admin action this table logs — a real union, not a bare `string`, so a typo or a future
 *  call site can't silently fragment the `action` column with inconsistent spelling (same
 *  convention as `matchDecision.ts`'s `MatchDecisionCallSite`, `llmClient.ts`'s `LlmCallSite`).
 *  Extend this when a new call site is wired — see ticket 09's Answer for the full list and why
 *  each one is (or, for `analysis.matched`, deliberately isn't yet) wired. */
export type AdminAction =
  | 'draft.approved'
  | 'draft.rejected'
  | 'story_relation.approved'
  | 'story_relation.rejected'
  | 'pending_addition.approved'
  | 'pending_addition.rejected'
  | 'user.created'
  | 'user.updated'
  | 'user.deleted'
  | 'analysis.created'
  | 'analysis.matched'
  | 'analysis.seed_attached'
  | 'analysis.discovery_run'
  | 'analysis.coverages_confirmed'
  | 'analysis.synthesis_triggered'
  | 'entity.alias_merged'
  | 'entity.alias_rejected'
  | 'entity.wikidata_linked'
  | 'entity.wikidata_unlinked'
  // Ticket 93 / ADR 0042 — the scheduled scan's own actions. `entity.wikidata_autolinked` is
  // recorded with actorId 'system:auto-wikidata' so the audit trail distinguishes a deterministic
  // auto-link from an Admin's `entity.wikidata_linked`.
  | 'entity.wikidata_autolinked'
  | 'entity.wikidata_suggestion_dismissed'
  | 'entity.wikidata_candidate_rejected'

export type AdminActionTargetType =
  'analysis' | 'story_relation' | 'pending_addition' | 'user' | 'entity_alias' | 'entity'

export interface NewAdminActionLog {
  actorId: string
  action: AdminAction
  targetType: AdminActionTargetType
  targetId: string
}

/** Records one admin action that spends LLM money or changes state irreversibly (P2-24,
 *  docs/audit.md; ticket 09). Maintainer-only — never read by any product surface, inspected via
 *  Prisma Studio like `LlmCallLog`/`MatchDecision`. */
export async function recordAdminAction(data: NewAdminActionLog): Promise<AdminActionLog> {
  return prisma.adminActionLog.create({ data })
}

/** recordAdminAction, but a logging failure must never break the admin action it's recording —
 *  same convention as matchDecision.ts's recordMatchDecision/recordMatchDecisionSafe split. */
export async function recordAdminActionSafe(data: NewAdminActionLog): Promise<void> {
  try {
    await recordAdminAction(data)
  } catch (err) {
    console.error('Failed to record admin action log entry', err)
  }
}
