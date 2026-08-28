import type { EntityWikidataSuggestionItem, WikidataSuggestionCandidate } from '@news-triangulator/shared'
import {
  useConfirmEntityWikidataSuggestion,
  useDismissEntityWikidataSuggestion,
  useEntityWikidataSuggestions,
  useRejectEntityWikidataCandidate,
} from '@/services/entityWikidataSuggestions/hooks'
import { ENTITY_TYPE_LABELS } from '@/lib/entityTypeLabels'
import './AdminEntityWikidataSuggestionsPage.css'

function CandidateRow({
  candidate,
  onConfirm,
  onReject,
  busy,
}: {
  candidate: WikidataSuggestionCandidate
  onConfirm: () => void
  onReject: () => void
  busy: boolean
}) {
  return (
    <tr>
      <td>
        {candidate.label}
        <span className="swd__q"> · {candidate.qid}</span>
      </td>
      <td className="dtable__d">{candidate.description ?? '—'}</td>
      <td className="swd__score">{candidate.score}</td>
      <td className="dtable__d">{candidate.reasons.join(' · ')}</td>
      <td className="dtable__act">
        <button className="btn btn--micro" onClick={onConfirm} disabled={busy}>
          Propojit
        </button>
        <button className="btn btn--micro" type="button" onClick={onReject} disabled={busy}>
          To není ono
        </button>
      </td>
    </tr>
  )
}

function SuggestionItem({
  suggestion,
  busy,
  onConfirm,
  onReject,
  onDismiss,
}: {
  suggestion: EntityWikidataSuggestionItem
  busy: boolean
  onConfirm: (wikidataId: string) => void
  onReject: (wikidataId: string) => void
  onDismiss: () => void
}) {
  return (
    <article className="qitem">
      <div className="qitem__k">
        <span>Návrh propojení</span>
        <span className="pill">{ENTITY_TYPE_LABELS[suggestion.type]}</span>
      </div>
      <h3 className="swd__n">{suggestion.canonicalName}</h3>
      <div className="u-scroll-x swd__t">
        <table className="dtable">
          <thead>
            <tr>
              <th scope="col">Kandidát</th>
              <th scope="col">Popis</th>
              <th scope="col">Skóre</th>
              <th scope="col">Důvody</th>
              <th scope="col" className="dtable__act">
                Akce
              </th>
            </tr>
          </thead>
          <tbody>
            {suggestion.candidates.map((candidate) => (
              <CandidateRow
                key={candidate.qid}
                candidate={candidate}
                busy={busy}
                onConfirm={() => onConfirm(candidate.qid)}
                onReject={() => onReject(candidate.qid)}
              />
            ))}
          </tbody>
        </table>
      </div>
      <div className="qitem__act">
        <button className="btn" type="button" onClick={onDismiss} disabled={busy}>
          Žádná shoda
        </button>
      </div>
    </article>
  )
}

/** Ticket 93 / ADR 0042 — the review queue for the scheduled entity → Wikidata scan. Each entity
 *  here failed the deterministic auto-link gate (ambiguous name, no cs.wikipedia article, a
 *  same-type rival, …), so an Admin picks the right candidate, rejects individual wrong ones
 *  permanently, or dismisses the whole set. The list re-fetches after every action — no candidate
 *  has a fixed identity across polls, same as the alias-merge queue. */
export default function AdminEntityWikidataSuggestionsPage() {
  const { data: suggestions, isLoading, isError } = useEntityWikidataSuggestions()
  const confirmMutation = useConfirmEntityWikidataSuggestion()
  const rejectMutation = useRejectEntityWikidataCandidate()
  const dismissMutation = useDismissEntityWikidataSuggestion()

  const busy = confirmMutation.isPending || rejectMutation.isPending || dismissMutation.isPending
  const error = confirmMutation.error ?? rejectMutation.error ?? dismissMutation.error

  return (
    <div className="u-wrap">
      <header className="ahead">
        <h1 className="ahead__t">Návrhy propojení entit s Wikidaty</h1>
        <p className="ahead__d">
          Denní automatická kontrola propojí jednoznačné případy sama; sem padá zbytek — entity s
          nejednoznačným jménem, bez článku na cs.wikipedia nebo s více kandidáty stejného typu. Vyberte
          správnou položku, zamítněte jednotlivé chybné (natrvalo), nebo celý návrh odmítněte.
        </p>
      </header>

      <section className="qsec">
        <div className="qsec__h">
          <h2 className="qsec__t">Čeká na rozhodnutí</h2>
          {suggestions && <span className="qsec__n">{suggestions.length}</span>}
        </div>

        {isLoading && <p className="note">Načítání…</p>}
        {isError && (
          <div className="error" style={{ marginTop: 'var(--sp-3)' }}>
            <p className="error__p">Nepodařilo se načíst návrhy na propojení.</p>
          </div>
        )}
        {error && (
          <div className="error" style={{ marginTop: 'var(--sp-3)' }}>
            <p className="error__p">{error.message}</p>
          </div>
        )}

        {suggestions && suggestions.length === 0 && (
          <p className="note" style={{ marginTop: 'var(--sp-4)' }}>
            Žádné návrhy — vše jednoznačné bylo propojeno automaticky.
          </p>
        )}

        {suggestions && suggestions.length > 0 && (
          <div className="qsec__l">
            {suggestions.map((suggestion) => (
              <SuggestionItem
                key={suggestion.entityKey}
                suggestion={suggestion}
                busy={busy}
                onConfirm={(wikidataId) =>
                  confirmMutation.mutate({ entityKey: suggestion.entityKey, wikidataId })
                }
                onReject={(wikidataId) =>
                  rejectMutation.mutate({ entityKey: suggestion.entityKey, wikidataId })
                }
                onDismiss={() => dismissMutation.mutate(suggestion.entityKey)}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
