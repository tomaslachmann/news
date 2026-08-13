import { BLOCKED_CONTENT_PHRASES } from '../config/blockedContentPhrases.js'

export function isBlockedContent(text: string): boolean {
  return BLOCKED_CONTENT_PHRASES.some((phrase) => text.includes(phrase))
}
