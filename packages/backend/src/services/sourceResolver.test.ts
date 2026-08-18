import { describe, it, expect, beforeEach, vi } from 'vitest'
import * as sourceRepo from '../repositories/source.js'
import {
  matchSourceByHostname,
  resolveSourceByUrl,
  resolveSourceByDomain,
  resolveSourcesByDomains,
} from './sourceResolver.js'

vi.mock('../repositories/source.js')

const IDNES = { id: 'src-idnes', name: 'iDnes', domains: ['idnes.cz'], createdAt: new Date() }
const NOVINKY = { id: 'src-novinky', name: 'Novinky', domains: ['novinky.cz'], createdAt: new Date() }

describe('matchSourceByHostname', () => {
  it('matches an exact domain', () => {
    expect(matchSourceByHostname('idnes.cz', [IDNES, NOVINKY])).toBe(IDNES)
  })

  it('matches a subdomain against its registered apex domain, most-specific-first', () => {
    expect(matchSourceByHostname('servis.idnes.cz', [IDNES])).toBe(IDNES)
  })

  it('returns undefined for a hostname no Source is registered under', () => {
    expect(matchSourceByHostname('example.cz', [IDNES, NOVINKY])).toBeUndefined()
  })

  it('never matches the bare TLD alone, even if somehow present in domains', () => {
    const weird = { id: 'src-weird', name: 'Weird', domains: ['cz'], createdAt: new Date() }
    expect(matchSourceByHostname('unrelated.cz', [weird])).toBeUndefined()
  })
})

describe('resolveSourceByUrl / resolveSourceByDomain', () => {
  beforeEach(() => vi.resetAllMocks())

  it('resolves a known domain from a full URL, stripping www', () => {
    vi.mocked(sourceRepo.findAllSources).mockResolvedValue([IDNES])

    return expect(resolveSourceByUrl('https://www.idnes.cz/some-article')).resolves.toBe(IDNES)
  })

  it('creates an unverified Source when no domain matches', async () => {
    vi.mocked(sourceRepo.findAllSources).mockResolvedValue([IDNES])
    const unverified = {
      id: 'src-example.cz',
      name: 'example.cz',
      domains: ['example.cz'],
      createdAt: new Date(),
    }
    vi.mocked(sourceRepo.findOrCreateUnverifiedSource).mockResolvedValue(unverified)

    const result = await resolveSourceByUrl('https://example.cz/x')

    expect(sourceRepo.findOrCreateUnverifiedSource).toHaveBeenCalledWith('example.cz')
    expect(result).toBe(unverified)
  })

  it('resolves a bare domain (resolveSourceByDomain) without URL-parsing it', async () => {
    vi.mocked(sourceRepo.findAllSources).mockResolvedValue([NOVINKY])

    await expect(resolveSourceByDomain('novinky.cz')).resolves.toBe(NOVINKY)
  })
})

describe('resolveSourcesByDomains', () => {
  beforeEach(() => vi.resetAllMocks())

  it('fetches the Source list exactly once regardless of how many domains are resolved', async () => {
    vi.mocked(sourceRepo.findAllSources).mockResolvedValue([IDNES, NOVINKY])

    const result = await resolveSourcesByDomains(['idnes.cz', 'novinky.cz', 'idnes.cz'])

    expect(sourceRepo.findAllSources).toHaveBeenCalledTimes(1)
    expect(result.get('idnes.cz')).toBe(IDNES)
    expect(result.get('novinky.cz')).toBe(NOVINKY)
  })

  it('creates an unverified Source for each unmatched domain, once per distinct domain', async () => {
    vi.mocked(sourceRepo.findAllSources).mockResolvedValue([IDNES])
    const unverified = {
      id: 'src-example.cz',
      name: 'example.cz',
      domains: ['example.cz'],
      createdAt: new Date(),
    }
    vi.mocked(sourceRepo.findOrCreateUnverifiedSource).mockResolvedValue(unverified)

    const result = await resolveSourcesByDomains(['example.cz', 'example.cz'])

    expect(sourceRepo.findOrCreateUnverifiedSource).toHaveBeenCalledTimes(1)
    expect(result.get('example.cz')).toBe(unverified)
  })

  it('returns an empty map for an empty input without creating anything', async () => {
    vi.mocked(sourceRepo.findAllSources).mockResolvedValue([IDNES])

    const result = await resolveSourcesByDomains([])

    expect(result.size).toBe(0)
    expect(sourceRepo.findOrCreateUnverifiedSource).not.toHaveBeenCalled()
  })
})
