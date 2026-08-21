import { describe, it, expect, afterAll } from 'vitest'
import type { NarrativeDocument } from '@news-triangulator/shared'
import { createAnalysis, completeAnalysisWithSynthesis, disconnect } from '../../src/repositories/analysis.js'
import {
  findSynthesisResultByAnalysisId,
  markNarrativeGenerationFailed,
  updateSynthesisResultNarrative,
  nullifySynthesisResultNarrative,
} from '../../src/repositories/synthesisResult.js'

describe('SynthesisResult repository against a real Postgres instance', () => {
  afterAll(async () => {
    await disconnect()
  })

  it('markNarrativeGenerationFailed sets narrativeGenerationFailedAt without touching narrative/dimensions/headline', async () => {
    const analysis = await createAnalysis({ seedUrl: 'https://example.cz/narrative-fail', seedHeadline: 'x' })
    const dimensions = { agreement: [], contradiction: [], uniqueReporting: [], framing: [] }
    await completeAnalysisWithSynthesis(analysis.id, dimensions, {
      headline: 'Generated headline',
      sourceOverlapPercentage: null,
      agreementCategory: 'PARTIAL',
    })

    await markNarrativeGenerationFailed(analysis.id)

    const found = await findSynthesisResultByAnalysisId(analysis.id)
    expect(found?.narrativeGenerationFailedAt).toBeInstanceOf(Date)
    expect(found?.narrative).toBeNull()
    expect(found?.dimensions).toEqual(dimensions)
    expect(found?.headline).toBe('Generated headline')
  })

  it('a fresh SynthesisResult has a null narrativeGenerationFailedAt', async () => {
    const analysis = await createAnalysis({
      seedUrl: 'https://example.cz/narrative-fresh',
      seedHeadline: 'x',
    })
    const dimensions = { agreement: [], contradiction: [], uniqueReporting: [], framing: [] }
    await completeAnalysisWithSynthesis(analysis.id, dimensions, {
      headline: null,
      sourceOverlapPercentage: null,
      agreementCategory: 'PARTIAL',
    })

    const found = await findSynthesisResultByAnalysisId(analysis.id)

    expect(found?.narrativeGenerationFailedAt).toBeNull()
  })

  it(
    'round-trips a full NarrativeDocument through a real Postgres Json column, and the backfill ' +
      'path (nullify then re-persist) leaves every other SynthesisResult field untouched (ticket 47 / ADR 0034)',
    async () => {
      const analysis = await createAnalysis({
        seedUrl: 'https://example.cz/narrative-doc',
        seedHeadline: 'x',
      })
      const dimensions = {
        agreement: [
          {
            id: 'd1',
            prose: 'Vláda schválila rozpočet.',
            attributions: [
              { outlet: 'iDnes', czechQuote: 'Vláda schválila rozpočet', articleUrl: 'https://idnes.cz/x' },
            ],
          },
        ],
        contradiction: [],
        uniqueReporting: [],
        framing: [],
      }
      await completeAnalysisWithSynthesis(analysis.id, dimensions, {
        headline: 'Generated headline',
        sourceOverlapPercentage: 100,
        agreementCategory: 'CONFIRMED',
      })

      const document: NarrativeDocument = {
        version: 1,
        blocks: [
          {
            type: 'paragraph',
            children: [
              { type: 'text', text: 'Podle ' },
              { type: 'entity', entityId: 'e1', text: 'Petra Fialy' },
              { type: 'text', text: ' byl schválen rozpočet.' },
            ],
          },
          { type: 'quote', sourceId: 's1', children: [{ type: 'text', text: 'Vláda schválila rozpočet' }] },
        ],
        assertions: [
          {
            id: 'a1',
            dimension: 'agreement',
            dimensionItemId: 'd1',
            entityRefs: ['e1'],
            sourceRefs: ['s1'],
            valueRefs: [],
          },
        ],
        entityRefs: [
          { id: 'e1', entityKey: 'person:petr-fiala', canonicalName: 'Petr Fiala', imageUrl: null },
        ],
        sourceRefs: [{ id: 's1', outlet: 'iDnes', articleUrl: 'https://idnes.cz/x' }],
        valueRefs: [],
      }
      await updateSynthesisResultNarrative(analysis.id, document)

      const persisted = await findSynthesisResultByAnalysisId(analysis.id)
      expect(persisted?.narrative).toEqual(document)

      // The backfill script's own path: null the narrative, leaving everything else alone.
      await nullifySynthesisResultNarrative(analysis.id)
      const nulled = await findSynthesisResultByAnalysisId(analysis.id)
      expect(nulled?.narrative).toBeNull()
      expect(nulled?.dimensions).toEqual(dimensions)
      expect(nulled?.headline).toBe('Generated headline')
      expect(nulled?.agreementCategory).toBe('CONFIRMED')

      // Re-persisting after the backfill's null round-trips the exact same document again.
      await updateSynthesisResultNarrative(analysis.id, document)
      const regenerated = await findSynthesisResultByAnalysisId(analysis.id)
      expect(regenerated?.narrative).toEqual(document)
    }
  )
})
