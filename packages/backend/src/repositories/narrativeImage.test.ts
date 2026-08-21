import { describe, it, expect, vi } from 'vitest'
import { Prisma } from '@prisma/client'

const { mockCreate, mockFindUnique } = vi.hoisted(() => ({
  mockCreate: vi.fn(),
  mockFindUnique: vi.fn(),
}))

vi.mock('../db.js', () => ({
  prisma: { narrativeImage: { create: mockCreate, findUnique: mockFindUnique } },
}))

import { createNarrativeImage, findNarrativeImageForSynthesisResult } from './narrativeImage.js'

const INPUT = {
  synthesisResultId: 'sr-1',
  provider: 'WIKIMEDIA' as const,
  externalId: 'Prague Castle.jpg',
  imageUrl: 'https://upload.wikimedia.org/full/Prague_Castle.jpg',
  sourceUrl: 'https://commons.wikimedia.org/wiki/File:Prague_Castle.jpg',
}

function uniqueConstraintError(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: '5.22.0',
  })
}

describe('findNarrativeImageForSynthesisResult', () => {
  it('returns the row id when a lead image already exists', async () => {
    mockFindUnique.mockResolvedValue({ id: 'img-1' })

    const result = await findNarrativeImageForSynthesisResult('sr-1')

    expect(result).toEqual({ id: 'img-1' })
    expect(mockFindUnique).toHaveBeenCalledWith({
      where: { synthesisResultId: 'sr-1' },
      select: { id: true },
    })
  })

  it('returns null when no lead image exists yet', async () => {
    mockFindUnique.mockResolvedValue(null)

    await expect(findNarrativeImageForSynthesisResult('sr-1')).resolves.toBeNull()
  })
})

describe('createNarrativeImage', () => {
  it('creates the row', async () => {
    mockCreate.mockResolvedValue(undefined)

    await createNarrativeImage(INPUT)

    expect(mockCreate).toHaveBeenCalledWith({ data: INPUT })
  })

  it('swallows a unique-constraint race from a concurrently-run attempt for the same SynthesisResult', async () => {
    mockCreate.mockRejectedValue(uniqueConstraintError())

    await expect(createNarrativeImage(INPUT)).resolves.toBeUndefined()
  })

  it('propagates any other error rather than swallowing it', async () => {
    mockCreate.mockRejectedValue(new Error('DB down'))

    await expect(createNarrativeImage(INPUT)).rejects.toThrow('DB down')
  })
})
