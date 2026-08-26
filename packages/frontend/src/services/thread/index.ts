import type {
  AgreementCategory,
  EntityMentionItem,
  ThreadArticleRow,
  ThreadArticleTag,
  ThreadDetail,
  ThreadSourceRow,
  ThreadStatusLabel,
  ThreadTimelineItem,
} from '@news-triangulator/shared'
import { MIN_SOURCES_FOR_GAUGE } from '@news-triangulator/shared'

export { MIN_SOURCES_FOR_GAUGE }
export type {
  AgreementCategory,
  EntityMentionItem,
  ThreadArticleRow,
  ThreadArticleTag,
  ThreadDetail,
  ThreadSourceRow,
  ThreadStatusLabel,
  ThreadTimelineItem,
}

async function throwApiError(res: Response, fallback: string): Promise<never> {
  const body = (await res.json().catch(() => ({}))) as { error?: string }
  throw new Error(body.error ?? fallback)
}

/** Distinguishes "this Thread doesn't exist / dropped below 2 visible members" (the backend's
 *  deliberate never-leak-existence 404, `threadDetailService.ts`) from a genuine fetch failure —
 *  `ThreadPage.tsx` renders `NotFoundPage` for the former, its retryable `ErrorState` for the
 *  latter. Without this, both looked identical to `useThreadDetail`'s `isError`. */
export class ThreadNotFoundError extends Error {}

export async function fetchThreadDetail(slug: string): Promise<ThreadDetail> {
  const res = await fetch(`/api/thread/${slug}`, { credentials: 'include' })

  if (res.status === 404) throw new ThreadNotFoundError('Vlákno nenalezeno')
  if (!res.ok) return throwApiError(res, 'Nepodařilo se načíst vlákno')

  return res.json() as Promise<ThreadDetail>
}
