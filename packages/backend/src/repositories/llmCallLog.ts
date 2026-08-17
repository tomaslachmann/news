import type { LlmCallLog } from '@prisma/client'
import { prisma } from '../db.js'

export interface NewLlmCallLog {
  callSite: string
  model: string
  systemPrompt: string
  userContent: string
  responseContent: string | null
  error: string | null
}

/** Records one LLM chat-completion call, success or failure — see ADR 0020. Never throws into
 *  the pipeline itself; callers are expected to guard this so a logging failure can't break an
 *  actual LLM call. */
export async function recordLlmCall(data: NewLlmCallLog): Promise<LlmCallLog> {
  return prisma.llmCallLog.create({ data })
}
