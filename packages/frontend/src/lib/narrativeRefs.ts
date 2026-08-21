import type {
  NarrativeDocument,
  NarrativeEntityRef,
  NarrativeSourceRef,
  NarrativeValueRef,
} from '@/services/analyses'

/** Id-keyed lookup into one NarrativeDocument's own top-level ref declarations — every
 *  NarrativeInline entity/source/value run points at one of these ids (ADR 0034). Built once per
 *  render rather than re-scanning `document.entityRefs`/`sourceRefs`/`valueRefs` per inline run. */
export interface NarrativeRefIndex {
  entities: Map<string, NarrativeEntityRef>
  sources: Map<string, NarrativeSourceRef>
  values: Map<string, NarrativeValueRef>
}

export function indexNarrativeRefs(document: NarrativeDocument): NarrativeRefIndex {
  return {
    entities: new Map(document.entityRefs.map((r) => [r.id, r])),
    sources: new Map(document.sourceRefs.map((r) => [r.id, r])),
    values: new Map(document.valueRefs.map((r) => [r.id, r])),
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
