import type { LlmCallLog } from '@prisma/client'
import { prisma } from '../db.js'

export interface NewLlmCallLog {
  callSite: string
  model: string
  /** Null for an embedding call (no system/user prompt split) — always set for a chat-completion
   *  call. See ADR 0020 (ticket 31 extends it to embedding calls). */
  systemPrompt: string | null
  userContent: string | null
  responseContent: string | null
  error: string | null
}

/** Records one LLM/embedding call, success or failure — see ADR 0020. Never throws into the
 *  pipeline itself; callers are expected to guard this so a logging failure can't break an
 *  actual LLM call. */
export async function recordLlmCall(data: NewLlmCallLog): Promise<LlmCallLog> {
  return prisma.llmCallLog.create({ data })
}

/** recordLlmCall, but a logging failure must never break the actual LLM/embedding call it's
 *  recording — see ADR 0020. Shared by llmClient.ts and embeddingClient.ts rather than each
 *  keeping its own copy of this safety wrapper. */
export async function recordLlmCallSafe(data: NewLlmCallLog): Promise<void> {
  try {
    await recordLlmCall(data)
  } catch (err) {
    console.error('Failed to record LLM call log', err)
  }
}
