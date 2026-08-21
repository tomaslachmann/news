import type { EntityAliasCandidateItem, EntityAliasCandidateEntity } from '@news-triangulator/shared'
import {
  useEntityAliasCandidates,
  useConfirmEntityAliasMerge,
  useRejectEntityAliasMerge,
} from '@/services/entityAliases/hooks'
import { ENTITY_TYPE_LABELS } from '@/lib/entityTypeLabels'
import './EntityAliasesPage.css'

function EntityRow({ label, entity }: { label: string; entity: EntityAliasCandidateEntity }) {
  return (
    <div className="pair__r">
      <span className="pair__a">{label}</span>
      <span>{entity.canonicalName}</span>
    </div>
  )
}

function CandidateItem({
  candidate,
  onMergeInto,
  onReject,
  isMerging,
  isRejecting,
}: {
  candidate: EntityAliasCandidateItem
  onMergeInto: (survivingEntityId: string) => void
  onReject: () => void
  isMerging: boolean
  isRejecting: boolean
}) {
  const busy = isMerging || isRejecting

  return (
    <article className="qitem">
      <div className="qitem__k">
        <span>Možný duplikát</span>
        <span className="pill">{Math.round(candidate.similarity * 100)}% shoda jmen</span>
      </div>
      <div className="pair">
        <EntityRow label="A" entity={candidate.entityA} />
        <EntityRow label="B" entity={candidate.entityB} />
      </div>
      <p className="qitem__m">
        <span>
          A: {ENTITY_TYPE_LABELS[candidate.entityA.type]} · {candidate.entityA.storyCount} příběhů
        </span>
        <span aria-hidden="true">·</span>
        <span>
          B: {ENTITY_TYPE_LABELS[candidate.entityB.type]} · {candidate.entityB.storyCount} příběhů
        </span>
      </p>
      <div className="qitem__act">
        <button className="btn btn--strong" onClick={() => onMergeInto(candidate.entityA.id)} disabled={busy}>
          Sloučit do A
        </button>
        <button className="btn btn--strong" onClick={() => onMergeInto(candidate.entityB.id)} disabled={busy}>
          Sloučit do B
        </button>
        <button className="btn" type="button" onClick={onReject} disabled={busy}>
          Zamítnout
        </button>
      </div>
    </article>
  )
}

/** Ticket 46 — Admin UI for ticket 40's Entity Alias Merge backend. Candidates are same-type
 *  entity pairs ranked by canonical-name trigram similarity (ADR 0033); confirming picks which of
 *  the two survives (`survivingEntityId`), the other is redirected via `EntityAlias`, never
 *  deleted. No candidate has a fixed identity across polls — the list simply re-fetches after
 *  every confirm/reject, same as the other review queues on `/admin/ingestion`. */
export default function EntityAliasesPage() {
  const { data: candidates, isLoading, isError } = useEntityAliasCandidates()
  const confirmMutation = useConfirmEntityAliasMerge()
  const rejectMutation = useRejectEntityAliasMerge()

  return (
    <div className="u-wrap">
      <header className="ahead">
        <h1 className="ahead__t">Sloučení duplicitních entit</h1>
        <p className="ahead__d">
          Nástroj podle podobnosti jmen navrhuje dvojice entit, které možná označují stejnou skutečnou osobu,
          organizaci nebo místo. Sloučení nikdy neprobíhá automaticky — vyberte, která entita zůstane, nebo
          návrh zamítněte.
        </p>
      </header>

      <section className="qsec">
        <div className="qsec__h">
          <h2 className="qsec__t">Návrhy ke schválení</h2>
          {candidates && <span className="qsec__n">{candidates.length}</span>}
        </div>

        {isLoading && <p className="note">Načítání…</p>}
        {isError && (
          <div className="error" style={{ marginTop: 'var(--sp-3)' }}>
            <p className="error__p">Nepodařilo se načíst kandidáty na sloučení.</p>
          </div>
        )}

        {candidates && candidates.length === 0 && (
          <p className="note" style={{ marginTop: 'var(--sp-4)' }}>
            Momentálně žádní kandidáti nad prahem podobnosti.
          </p>
        )}

        {candidates && candidates.length > 0 && (
          <div className="qsec__l">
            {candidates.map((candidate) => (
              <CandidateItem
                key={candidate.pairId}
                candidate={candidate}
                isMerging={confirmMutation.isPending}
                isRejecting={rejectMutation.isPending}
                onMergeInto={(survivingEntityId) =>
                  confirmMutation.mutate({ pairId: candidate.pairId, survivingEntityId })
                }
                onReject={() => rejectMutation.mutate(candidate.pairId)}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
