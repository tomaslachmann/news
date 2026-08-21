import { describe, it, expect, vi } from 'vitest'
import { Prisma } from '@prisma/client'

const { mockCreate } = vi.hoisted(() => ({ mockCreate: vi.fn() }))

vi.mock('../db.js', () => ({
  prisma: { entityImage: { create: mockCreate } },
}))

import { createEntityImage } from './entityImage.js'

const INPUT = {
  entityId: 'e-1',
  provider: 'WIKIMEDIA' as const,
  externalId: 'Petr Fiala 2022.jpg',
  imageUrl: 'https://upload.wikimedia.org/full/Petr_Fiala_2022.jpg',
  sourceUrl: 'https://commons.wikimedia.org/wiki/File:Petr_Fiala_2022.jpg',
}

function uniqueConstraintError(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: '5.22.0',
  })
}

describe('createEntityImage', () => {
  it('creates the row', async () => {
    mockCreate.mockResolvedValue(undefined)

    await createEntityImage(INPUT)

    expect(mockCreate).toHaveBeenCalledWith({ data: INPUT })
  })

  it('swallows a unique-constraint race from a concurrently-run enrich job for the same image', async () => {
    mockCreate.mockRejectedValue(uniqueConstraintError())

    await expect(createEntityImage(INPUT)).resolves.toBeUndefined()
  })

  it('propagates any other error rather than swallowing it', async () => {
    mockCreate.mockRejectedValue(new Error('DB down'))

    await expect(createEntityImage(INPUT)).rejects.toThrow('DB down')
  })
})
