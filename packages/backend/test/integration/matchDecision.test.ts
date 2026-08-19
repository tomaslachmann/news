import { describe, it, expect, afterAll } from 'vitest'
import { disconnect } from '../../src/repositories/analysis.js'
import { recordMatchDecision } from '../../src/repositories/matchDecision.js'

describe('MatchDecision repository against a real Postgres instance', () => {
  afterAll(async () => {
    await disconnect()
  })

  it('persists a threshold-only decision and reads it back (Ingestion — never gets an LLM stage, ADR 0018)', async () => {
    const created = await recordMatchDecision({
      callSite: 'ingestion',
      candidateStoryId: 'story-1',
      candidateAnalysisId: 'analysis-1',
      score: 0.42,
      thresholdMatched: false,
      llmVerdict: null,
      decidedBy: 'THRESHOLD',
      scorerVersion: 'storyMatching-v2',
    })

    expect(created.id).toBeTruthy()
    expect(created.callSite).toBe('ingestion')
    expect(created.candidateStoryId).toBe('story-1')
    expect(created.score).toBe(0.42)
    expect(created.thresholdMatched).toBe(false)
    expect(created.llmVerdict).toBeNull()
    expect(created.decidedBy).toBe('THRESHOLD')
    expect(created.createdAt).toBeInstanceOf(Date)
  })

  it('persists an LLM-decided verdict (human-seeded submissionDedup path)', async () => {
    const created = await recordMatchDecision({
      callSite: 'submissionDedup',
      candidateStoryId: 'story-2',
      candidateAnalysisId: 'analysis-2',
      score: 0.91,
      thresholdMatched: true,
      llmVerdict: true,
      decidedBy: 'LLM',
      scorerVersion: 'storyMatching-v2',
    })

    expect(created.thresholdMatched).toBe(true)
    expect(created.llmVerdict).toBe(true)
    expect(created.decidedBy).toBe('LLM')
  })

  it('persists a row with no candidate at all (empty pool)', async () => {
    const created = await recordMatchDecision({
      callSite: 'ingestion',
      candidateStoryId: null,
      candidateAnalysisId: null,
      score: null,
      thresholdMatched: false,
      llmVerdict: null,
      decidedBy: 'THRESHOLD',
      scorerVersion: 'storyMatching-v2',
    })

    expect(created.candidateStoryId).toBeNull()
    expect(created.score).toBeNull()
  })
})
