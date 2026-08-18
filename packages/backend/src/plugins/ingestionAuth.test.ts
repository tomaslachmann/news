import { describe, expect, it, vi, afterEach } from 'vitest'
import type { FastifyReply, FastifyRequest } from 'fastify'
import { requireIngestionSecret, INGESTION_SECRET_HEADER } from './ingestionAuth.js'

function makeReply(): {
  reply: FastifyReply
  codeSpy: ReturnType<typeof vi.fn>
  sendSpy: ReturnType<typeof vi.fn>
} {
  const sendSpy = vi.fn()
  const codeSpy = vi.fn(() => ({ send: sendSpy }))
  const reply = { code: codeSpy, send: sendSpy } as unknown as FastifyReply
  return { reply, codeSpy, sendSpy }
}

function makeRequest(headerValue: string | string[] | undefined): FastifyRequest {
  return { headers: { [INGESTION_SECRET_HEADER]: headerValue } } as unknown as FastifyRequest
}

describe('requireIngestionSecret', () => {
  const ORIGINAL_ENV = process.env.INGESTION_SECRET

  afterEach(() => {
    process.env.INGESTION_SECRET = ORIGINAL_ENV
  })

  it('allows the request through when the header matches the configured secret', async () => {
    process.env.INGESTION_SECRET = 'correct-secret'
    const { reply, codeSpy } = makeReply()

    await requireIngestionSecret(makeRequest('correct-secret'), reply)

    expect(codeSpy).not.toHaveBeenCalled()
  })

  it('rejects with 401 when no secret is configured', async () => {
    delete process.env.INGESTION_SECRET
    const { reply, codeSpy, sendSpy } = makeReply()

    await requireIngestionSecret(makeRequest('anything'), reply)

    expect(codeSpy).toHaveBeenCalledWith(401)
    expect(sendSpy).toHaveBeenCalledWith({ error: 'Unauthenticated' })
  })

  it('rejects with 401 when the header is missing', async () => {
    process.env.INGESTION_SECRET = 'correct-secret'
    const { reply, codeSpy } = makeReply()

    await requireIngestionSecret(makeRequest(undefined), reply)

    expect(codeSpy).toHaveBeenCalledWith(401)
  })

  it('rejects with 401 when the header value is wrong but the same length as the secret — exercises timingSafeEqual itself, not just the length guard', async () => {
    process.env.INGESTION_SECRET = 'correct-secret'
    const wrongSameLength = 'wrong-secretzz'
    expect(wrongSameLength).toHaveLength('correct-secret'.length)
    const { reply, codeSpy } = makeReply()

    await requireIngestionSecret(makeRequest(wrongSameLength), reply)

    expect(codeSpy).toHaveBeenCalledWith(401)
  })

  it('rejects with 401 when the header value has a different length than the secret', async () => {
    process.env.INGESTION_SECRET = 'correct-secret'
    const { reply, codeSpy } = makeReply()

    await requireIngestionSecret(makeRequest('short'), reply)

    expect(codeSpy).toHaveBeenCalledWith(401)
  })

  it('rejects with 401 when the header is provided as an array (never valid)', async () => {
    process.env.INGESTION_SECRET = 'correct-secret'
    const { reply, codeSpy } = makeReply()

    await requireIngestionSecret(makeRequest(['correct-secret', 'correct-secret']), reply)

    expect(codeSpy).toHaveBeenCalledWith(401)
  })
})
