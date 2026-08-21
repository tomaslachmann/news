import { useState } from 'react'
import type { WikidataCandidateItem } from '@news-triangulator/shared'
import {
  useSearchWikidataCandidates,
  useLinkEntityWikidata,
  useUnlinkEntityWikidata,
} from '@/services/entityWikidata/hooks'

function CandidateRow({
  candidate,
  onLink,
  isLinking,
}: {
  candidate: WikidataCandidateItem
  onLink: () => void
  isLinking: boolean
}) {
  return (
    <tr>
      <td>{candidate.label}</td>
      <td className="dtable__d">{candidate.description ?? '—'}</td>
      <td className="dtable__d">{candidate.qid}</td>
      <td className="dtable__act">
        <button className="btn btn--micro" onClick={onLink} disabled={isLinking}>
          {isLinking ? 'Propojování…' : 'Propojit'}
        </button>
      </td>
    </tr>
  )
}

/** Ticket 41's Admin-only search-and-confirm flow for `Entity.wikidataId` — no entity browse/list
 *  page exists yet (ticket 46 only covers Entity Alias Merge's own admin view), so this takes the
 *  Entity's `key` as a direct input rather than a picker; a future entity-listing surface can link
 *  here with the key pre-filled without changing this page's shape. */
export default function AdminEntityWikidataPage() {
  const [entityKey, setEntityKey] = useState('')
  const [query, setQuery] = useState('')
  const [linkedQid, setLinkedQid] = useState<string | null>(null)

  const searchMutation = useSearchWikidataCandidates()
  const linkMutation = useLinkEntityWikidata()
  const unlinkMutation = useUnlinkEntityWikidata()

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    setLinkedQid(null)
    linkMutation.reset()
    unlinkMutation.reset()
    searchMutation.mutate({ entityKey: entityKey.trim(), query: query.trim() })
  }

  const handleLink = (candidate: WikidataCandidateItem) => {
    linkMutation.mutate(
      { entityKey: entityKey.trim(), wikidataId: candidate.qid },
      { onSuccess: () => setLinkedQid(candidate.qid) }
    )
  }

  const handleUnlink = () => {
    unlinkMutation.mutate(entityKey.trim(), { onSuccess: () => setLinkedQid(null) })
  }

  const candidates = searchMutation.data ?? []

  return (
    <div className="u-wrap">
      <header className="ahead">
        <h1 className="ahead__t">Propojení entit s Wikidaty</h1>
        <p className="ahead__d">
          Vyhledejte odpovídající položku na Wikidatech podle kanonického jména entity a potvrďte správnou
          shodu. Propojení nikdy neprobíhá automaticky — vždy jej musí potvrdit Admin.
        </p>
      </header>

      <section className="qsec">
        <form className="panel panel--wide" onSubmit={handleSearch}>
          <div className="panel__f">
            <div className="field">
              <label className="field__l" htmlFor="entity-key">
                Klíč entity
              </label>
              <input
                className="input"
                id="entity-key"
                value={entityKey}
                onChange={(e) => setEntityKey(e.target.value)}
                placeholder="např. person:petr-fiala"
                required
              />
            </div>
            <div className="field">
              <label className="field__l" htmlFor="wikidata-query">
                Hledaný výraz
              </label>
              <input
                className="input"
                id="wikidata-query"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="kanonické jméno entity"
                required
              />
            </div>
          </div>

          {searchMutation.isError && (
            <div className="error" style={{ marginTop: 'var(--sp-4)' }}>
              <p className="error__p">{searchMutation.error.message}</p>
            </div>
          )}

          <div className="panel__foot">
            <button className="btn btn--primary" type="submit" disabled={searchMutation.isPending}>
              {searchMutation.isPending ? 'Vyhledávání…' : 'Hledat na Wikidatech'}
            </button>
            <button
              className="btn"
              type="button"
              onClick={handleUnlink}
              disabled={!entityKey.trim() || unlinkMutation.isPending}
            >
              {unlinkMutation.isPending ? 'Ruším propojení…' : 'Zrušit propojení'}
            </button>
          </div>
        </form>

        {linkMutation.isError && (
          <div className="error" style={{ marginTop: 'var(--sp-4)' }}>
            <p className="error__p">{linkMutation.error.message}</p>
          </div>
        )}
        {unlinkMutation.isError && (
          <div className="error" style={{ marginTop: 'var(--sp-4)' }}>
            <p className="error__p">{unlinkMutation.error.message}</p>
          </div>
        )}
        {linkedQid && (
          <p className="note picknote">
            Entita <b>{entityKey}</b> byla propojena s <b>{linkedQid}</b>. Obrázek entity se nyní na pozadí
            dohledává.
          </p>
        )}
        {unlinkMutation.isSuccess && (
          <p className="note picknote">
            Propojení entity <b>{entityKey}</b> s Wikidaty bylo zrušeno.
          </p>
        )}

        {candidates.length > 0 && (
          <div className="u-scroll-x" style={{ marginTop: 'var(--sp-5)' }}>
            <table className="dtable">
              <thead>
                <tr>
                  <th scope="col">Název</th>
                  <th scope="col">Popis</th>
                  <th scope="col">Q-id</th>
                  <th scope="col" className="dtable__act">
                    Akce
                  </th>
                </tr>
              </thead>
              <tbody>
                {candidates.map((candidate) => (
                  <CandidateRow
                    key={candidate.qid}
                    candidate={candidate}
                    onLink={() => handleLink(candidate)}
                    isLinking={linkMutation.isPending && linkMutation.variables?.wikidataId === candidate.qid}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
        {searchMutation.isSuccess && candidates.length === 0 && (
          <p className="note picknote">Žádné odpovídající položky na Wikidatech nenalezeny.</p>
        )}
      </section>
    </div>
  )
}
