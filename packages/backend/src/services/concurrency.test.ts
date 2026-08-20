import { describe, it, expect } from 'vitest'
import { settleWithConcurrency } from './concurrency.js'

describe('settleWithConcurrency', () => {
  it('resolves every item and preserves input order in the result', async () => {
    const items = [1, 2, 3, 4, 5]

    const results = await settleWithConcurrency(items, 2, (n) => Promise.resolve(n * 10))

    expect(results).toEqual([
      { status: 'fulfilled', value: 10 },
      { status: 'fulfilled', value: 20 },
      { status: 'fulfilled', value: 30 },
      { status: 'fulfilled', value: 40 },
      { status: 'fulfilled', value: 50 },
    ])
  })

  it('never runs more than `limit` callbacks concurrently', async () => {
    const items = Array.from({ length: 10 }, (_, i) => i)
    let active = 0
    let maxActive = 0

    await settleWithConcurrency(items, 3, async () => {
      active++
      maxActive = Math.max(maxActive, active)
      await new Promise((resolve) => setTimeout(resolve, 5))
      active--
    })

    expect(maxActive).toBeLessThanOrEqual(3)
  })

  it('captures a rejection as its own result without failing the whole batch', async () => {
    const items = [1, 2, 3]

    const results = await settleWithConcurrency(items, 2, (n) =>
      n === 2 ? Promise.reject(new Error('boom')) : Promise.resolve(n)
    )

    expect(results[0]).toEqual({ status: 'fulfilled', value: 1 })
    expect(results[1]).toMatchObject({ status: 'rejected', reason: new Error('boom') })
    expect(results[2]).toEqual({ status: 'fulfilled', value: 3 })
  })

  it('handles an empty input list', async () => {
    const results = await settleWithConcurrency([] as number[], 4, (n) => Promise.resolve(n))
    expect(results).toEqual([])
  })

  it('handles a limit larger than the item count', async () => {
    const results = await settleWithConcurrency([1, 2], 10, (n) => Promise.resolve(n))
    expect(results).toEqual([
      { status: 'fulfilled', value: 1 },
      { status: 'fulfilled', value: 2 },
    ])
  })
})
