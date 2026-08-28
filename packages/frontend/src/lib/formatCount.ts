const CZECH_NUMBER = new Intl.NumberFormat('cs-CZ')

/** `count` + the right Czech plural form: `one` for 1, `few` for 2–4, `many` otherwise (and for
 *  non-integers). Started in homePageViewModel, moved here once a fourth page (the entity wiki,
 *  ticket 90) needed it — same "extract on the third consumer" threshold ds/components.css uses. */
export function formatCzechCount(count: number, one: string, few: string, many: string): string {
  const form = count === 1 ? one : Number.isInteger(count) && count >= 2 && count <= 4 ? few : many
  return `${CZECH_NUMBER.format(count)} ${form}`
}
