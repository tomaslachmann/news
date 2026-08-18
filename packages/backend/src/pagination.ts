import { MAX_PAGE_SIZE } from '@news-triangulator/shared'
import { ValidationError } from './errors.js'

export interface Cursor {
  createdAt: Date
  id: string
}

/** Opaque to the client — encodes the (createdAt, id) tuple a keyset-paginated query resumes
 *  from. Base64url, not a raw string, so it isn't mistaken for something meant to be
 *  constructed/parsed client-side (docs/audit.md P0-7, ticket 03). */
export function encodeCursor(row: Cursor): string {
  return Buffer.from(`${row.createdAt.toISOString()}|${row.id}`).toString('base64url')
}

export function decodeCursor(raw: string): Cursor {
  const decoded = Buffer.from(raw, 'base64url').toString()
  const [ts, id] = decoded.split('|')
  const createdAt = ts ? new Date(ts) : undefined
  if (!ts || !id || !createdAt || Number.isNaN(createdAt.getTime())) {
    throw new ValidationError('Neplatný cursor')
  }
  return { createdAt, id }
}

/** Given `limit + 1` rows fetched (the standard "did we get one more than asked?" trick), splits
 *  off the real page and reports whether a next page exists — without a second COUNT query. */
export function splitPage<T extends Cursor>(
  rows: T[],
  limit: number
): { items: T[]; nextCursor: string | null } {
  const hasMore = rows.length > limit
  const items = hasMore ? rows.slice(0, limit) : rows
  const last = items[items.length - 1]
  return { items, nextCursor: hasMore && last ? encodeCursor(last) : null }
}

/** Shared decode-cursor/bound-limit/split-page sequence — listAnalyses and listVisibleDrafts
 *  each repeated this identically before (code review, ticket 03); `fetchRows` is the one part
 *  that differs between them. */
export async function fetchPage<T extends Cursor>(
  cursor: string | undefined,
  limit: number,
  fetchRows: (decoded: Cursor | undefined, boundedLimit: number) => Promise<T[]>
): Promise<{ items: T[]; nextCursor: string | null }> {
  const decoded = cursor ? decodeCursor(cursor) : undefined
  const boundedLimit = Math.min(limit, MAX_PAGE_SIZE)
  const rows = await fetchRows(decoded, boundedLimit)
  return splitPage(rows, boundedLimit)
}
