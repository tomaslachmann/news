/** Same contract as `Promise.allSettled(items.map(fn))`, but never runs more than `limit`
 *  invocations of `fn` at once. Used where a caller's fan-out size is driven by data (e.g. how
 *  many Coverage rows an Analysis has), not a small fixed set — see ADR 0032. */
export async function settleWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<PromiseSettledResult<R>[]> {
  const results = new Array<PromiseSettledResult<R>>(items.length)
  let next = 0

  async function worker(): Promise<void> {
    while (next < items.length) {
      const index = next++
      try {
        results[index] = { status: 'fulfilled', value: await fn(items[index]) }
      } catch (reason) {
        results[index] = { status: 'rejected', reason }
      }
    }
  }

  const workerCount = Math.min(limit, items.length)
  await Promise.all(Array.from({ length: workerCount }, worker))

  return results
}
