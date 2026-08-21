import type { NarrativeDocument, NarrativeEntityRef, NarrativeSourceRef } from '@/services/analyses'

/** Id-keyed lookup into one NarrativeDocument's own top-level ref declarations that rendering
 *  actually resolves — a `value` inline run renders its own `text` directly (ADR 0034: distinct
 *  styling only, no ticket-48 requirement to surface `normalizedValue`/`unit`), so `valueRefs`
 *  isn't indexed here; add it back if a future ticket needs to resolve a value ref's declaration.
 *  Built once per render rather than re-scanning `document.entityRefs`/`sourceRefs` per inline run. */
export interface NarrativeRefIndex {
  entities: Map<string, NarrativeEntityRef>
  sources: Map<string, NarrativeSourceRef>
}

export function indexNarrativeRefs(document: NarrativeDocument): NarrativeRefIndex {
  return {
    entities: new Map(document.entityRefs.map((r) => [r.id, r])),
    sources: new Map(document.sourceRefs.map((r) => [r.id, r])),
  }
}

/** Resolves a `source` inline run's `sourceIds` to their declared `NarrativeSourceRef`s, in order,
 *  silently dropping any id that isn't declared (verification already guarantees every id used
 *  inline is declared — ADR 0034 — so this is a defensive no-op, never a real degrade path). */
export function resolveSourceRefs(sourceIds: string[], refs: NarrativeRefIndex): NarrativeSourceRef[] {
  return sourceIds
    .map((id) => refs.sources.get(id))
    .filter((ref): ref is NarrativeSourceRef => ref !== undefined)
}
