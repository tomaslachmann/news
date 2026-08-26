import { resolveSourceRefs, type NarrativeRefIndex } from './narrativeRefs'

export interface ChartDataPoint {
  label: string
  value: number
}

/** Resolves a `chart` block's `valueIds` (ticket 73) into Recharts-ready `{ label, value }` points
 *  — `value` is each cited `NarrativeValueRef`'s own deterministically-parsed `normalizedValue`
 *  (never recomputed here), `label` is the outlet(s) that reported it. Drops an id that doesn't
 *  resolve, or whose `normalizedValue` is null (unparseable value text) — both defensive no-ops in
 *  practice, since `findNarrativeVerificationFailures` already guarantees every `valueId` resolves;
 *  a genuinely unparseable figure just can't be plotted regardless. */
export function buildBarChartData(valueIds: string[], refs: NarrativeRefIndex): ChartDataPoint[] {
  return valueIds.flatMap((id) => {
    const ref = refs.values.get(id)
    if (!ref || ref.normalizedValue === null) return []
    const outlets = resolveSourceRefs(ref.sourceIds, refs).map((s) => s.outlet)
    return [{ label: outlets.length > 0 ? outlets.join(', ') : ref.text, value: ref.normalizedValue }]
  })
}
