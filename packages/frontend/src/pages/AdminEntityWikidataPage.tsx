import { useState } from 'react'
import type { EntitySearchResultItem, WikidataCandidateItem } from '@news-triangulator/shared'
import {
  useSearchWikidataCandidates,
  useLinkEntityWikidata,
  useUnlinkEntityWikidata,
} from '@/services/entityWikidata/hooks'
import { EntityAutocomplete } from '@/components/EntityAutocomplete'
import { ENTITY_TYPE_LABELS } from '@/lib/entityTypeLabels'

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

/** Ticket 41's Admin-only search-and-confirm flow for `Entity.wikidataId`. Ticket 50 replaced the
 *  free-text `Entity.key` field with a name type-ahead (`EntityAutocomplete`) — an Admin picks the
 *  entity by name and its key is resolved behind the scenes; pasting a known `type:slug` key still
 *  works. */
export default function AdminEntityWikidataPage() {
  const [entity, setEntity] = useState<EntitySearchResultItem | null>(null)
  const [query, setQuery] = useState('')
  const [linkedQid, setLinkedQid] = useState<string | null>(null)

  const searchMutation = useSearchWikidataCandidates()
  const linkMutation = useLinkEntityWikidata()
  const unlinkMutation = useUnlinkEntityWikidata()

  const entityKey = entity?.key ?? ''

  const handlePick = (picked: EntitySearchResultItem) => {
    setEntity(picked)
    setQuery((q) => q || picked.canonicalName)
    setLinkedQid(null)
    searchMutation.reset()
    linkMutation.reset()
    unlinkMutation.reset()
  }

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

  const entityName = entity?.canonicalName ?? entityKey

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
              <label className="field__l" htmlFor="entity-pick">
                Entita
              </label>
              <EntityAutocomplete onPick={handlePick} />
              {entity && (
                <p className="note" style={{ marginTop: 'var(--sp-2)' }}>
                  Vybráno: <b>{entity.canonicalName}</b> · {ENTITY_TYPE_LABELS[entity.type]} ·{' '}
                  <span className="u-mono">{entity.key}</span>
                  {entity.wikidataId && <> · již propojeno s {entity.wikidataId}</>}
                </p>
              )}
            </div>
            <div className="field">
              <label className="field__l" htmlFor="wikidata-query">
                Hledaný výraz na Wikidatech
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
            <button
              className="btn btn--primary"
              type="submit"
              disabled={!entityKey.trim() || !query.trim() || searchMutation.isPending}
            >
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
            Entita <b>{entityName}</b> byla propojena s <b>{linkedQid}</b>. Obrázek a popis entity se nyní na
            pozadí dohledávají.
          </p>
        )}
        {unlinkMutation.isSuccess && (
          <p className="note picknote">
            Propojení entity <b>{entityName}</b> s Wikidaty bylo zrušeno.
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
