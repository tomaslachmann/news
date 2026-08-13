import { describe, it, expect, afterAll } from 'vitest'
import { prisma } from '../../src/db.js'

describe('Analysis + Coverage against a real Postgres instance', () => {
  afterAll(async () => {
    await prisma.$disconnect()
  })

  it('persists an Analysis with a related Coverage and reads it back', async () => {
    const analysis = await prisma.analysis.create({
      data: {
        seedUrl: 'https://example.cz/some-article',
        seedHeadline: 'Test headline',
        status: 'PENDING',
      },
    })

    await prisma.coverage.create({
      data: {
        analysisId: analysis.id,
        outlet: 'iDnes',
        articleUrl: 'https://idnes.cz/some-article',
        status: 'PENDING',
      },
    })

    const found = await prisma.analysis.findUnique({
      where: { id: analysis.id },
      include: { coverages: true },
    })

    expect(found).not.toBeNull()
    expect(found?.seedHeadline).toBe('Test headline')
    expect(found?.coverages).toHaveLength(1)
    expect(found?.coverages[0]?.outlet).toBe('iDnes')
  })
})
