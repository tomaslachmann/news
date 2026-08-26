import type { NarrativeDocument } from '@news-triangulator/shared'

/** One member Analysis's `NarrativeValueRef` worth tracking as a potential `ClaimSeries` point —
 *  see `findTrackableValues`' own doc comment for why parseability + entity co-occurrence are
 *  both required. */
export interface TrackableValue {
  valueRefId: string
  text: string
  normalizedValue: number
  unit: string | null
  sourceIds: string[]
  entityKeys: string[]
}

/** Entity keys an assertion co-cites alongside a given `valueRef` id — the only existing
 *  structural signal linking a `NarrativeValueRef` to "what it's about" (ticket 72's Answer: no
 *  direct entity-on-value field exists, but `NarrativeAssertion` already bundles `entityRefs`/
 *  `valueRefs` together when both support the same dimension item). Resolves through the
 *  document's own `entityRefs` declarations to each entity's stable `entityKey` — never
 *  `NarrativeEntityRef.id`, which is only unique within one document, not across the Thread's
 *  other members' own documents. */
function coOccurringEntityKeys(document: NarrativeDocument, valueRefId: string): Set<string> {
  const entityKeyById = new Map(document.entityRefs.map((r) => [r.id, r.entityKey]))
  const keys = new Set<string>()
  for (const assertion of document.assertions) {
    if (!assertion.valueRefs.includes(valueRefId)) continue
    for (const entityRefId of assertion.entityRefs) {
      const key = entityKeyById.get(entityRefId)
      if (key) keys.add(key)
    }
  }
  return keys
}

/** Every value in one member's `NarrativeDocument` worth tracking as a `ClaimSeries` point:
 *  parseable (`normalizedValue` isn't null — an unparseable figure can't be plotted regardless)
 *  and co-cited with at least one known entity. A value with zero entity co-occurrence can never
 *  be candidate-matched against a later member either (candidate-narrowing is entirely
 *  entity-key-based), so tracking it would only ever create a permanently-orphaned single-member
 *  series — not wrong, just never worth the row. */
export function findTrackableValues(document: NarrativeDocument): TrackableValue[] {
  return document.valueRefs.flatMap((ref) => {
    if (ref.normalizedValue === null) return []
    const entityKeys = [...coOccurringEntityKeys(document, ref.id)]
    if (entityKeys.length === 0) return []
    return [
      {
        valueRefId: ref.id,
        text: ref.text,
        normalizedValue: ref.normalizedValue,
        unit: ref.unit,
        sourceIds: ref.sourceIds,
        entityKeys,
      },
    ]
  })
}

export interface ExistingSeriesLatestMember {
  seriesId: string
  entityKeys: string[]
  unit: string | null
  normalizedValue: number
  text: string
}

/** Candidate `ClaimSeries` a new trackable value might continue — shares at least one entity key
 *  with the series' own most recent member AND the same unit (ticket 73's own unit-consistency
 *  principle, reused here: a series tracking a death toll never continues as a currency amount).
 *  Entity-key overlap alone isn't sufficient to *conclude* continuation — one entity commonly has
 *  more than one distinct tracked number (ticket 72's Answer) — only to narrow what the LLM has to
 *  actually judge. */
export function findCandidateSeries(
  value: TrackableValue,
  existingLatestMembers: ExistingSeriesLatestMember[]
): ExistingSeriesLatestMember[] {
  const valueEntityKeys = new Set(value.entityKeys)
  return existingLatestMembers.filter(
    (m) => m.unit === value.unit && m.entityKeys.some((key) => valueEntityKeys.has(key))
  )
}
