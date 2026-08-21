import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip'
import type { Attribution, AnalysisDimensions, DimensionItem } from '@/services/analyses'

/** Shared by `AnalysisPage`'s live-streaming synthesis view and `ArticlePage`'s finished Article —
 *  both render the same four Analysis Dimensions, one still updating in place, the other final.
 *  Split out here (ticket 52) rather than duplicated across both page files. */

function OutletBadge({ attribution }: { attribution: Attribution }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <a href={attribution.articleUrl} target="_blank" rel="noopener noreferrer" className="chip">
          {attribution.outlet}
        </a>
      </TooltipTrigger>
      <TooltipContent>
        <p className="max-w-xs">{attribution.czechQuote}</p>
      </TooltipContent>
    </Tooltip>
  )
}

const MAX_REFERENCE_EXCERPT_LENGTH = 100

function truncateExcerpt(text: string): string {
  if (text.length <= MAX_REFERENCE_EXCERPT_LENGTH) return text
  return text.slice(0, MAX_REFERENCE_EXCERPT_LENGTH).trimEnd() + '…'
}

/** Deviation on top of the reference (ticket's own planned design change): widened from 3
 *  columns to 4 to carry all four Analysis Dimensions — +agreement, ×contradiction,
 *  ?uniqueReporting, ~framing (the fourth takes --mid, no new accent colour introduced). The
 *  reference's own third column ("open questions") has no data behind it; its "?"/ink-3 styling
 *  is reused for uniqueReporting instead rather than dropped outright. All four columns render
 *  unconditionally, even empty — the reader should see nothing was forgotten, not just absence. */
export function SumBox({ dimensions }: { dimensions: AnalysisDimensions }) {
  const total =
    dimensions.agreement.length +
    dimensions.contradiction.length +
    dimensions.uniqueReporting.length +
    dimensions.framing.length
  if (total === 0) return null

  const col = (mod: string, title: string, items: DimensionItem[]) => (
    <div className={`sumbox__col sumbox--${mod}`}>
      <p className="sumbox__t">
        {title}
        <span className="sumbox__n">{items.length}</span>
      </p>
      <ul className="sumbox__l">
        {items.map((item, i) => (
          <li key={i}>
            <span>{truncateExcerpt(item.prose)}</span>
          </li>
        ))}
      </ul>
    </div>
  )

  return (
    <div className="sumbox">
      {col('agree', 'Zdroje se shodují', dimensions.agreement)}
      {col('differ', 'Zdroje se rozcházejí', dimensions.contradiction)}
      {col('open', 'Unikátní zprávy', dimensions.uniqueReporting)}
      {col('framing', 'Framing', dimensions.framing)}
    </div>
  )
}

/** One row per dimension item — .compare/.cmp, the reference's "which sentence has how much
 *  support" list. markConflict adds the red left-border rozpor treatment (:has(.chip--bad) in
 *  AnalysisPage.css), used only for the contradiction dimension. Outlet attributions render as
 *  plain .chip badges in .cmp__v in place of the reference's .vals structured value list — our
 *  data is prose + attributions, never discrete per-source values. */
export function CompareList({
  items,
  coverageCount,
  markConflict,
}: {
  items: DimensionItem[]
  coverageCount: number
  markConflict?: boolean
}) {
  if (items.length === 0) {
    return <p className="note">V této kategorii nic není.</p>
  }
  return (
    <ol className="compare">
      {items.map((item, i) => (
        <li className="cmp" key={i}>
          <p className="cmp__t">{item.prose}</p>
          <div className="cmp__m">
            <span>
              <b>{item.attributions.length}</b> z {coverageCount} zdrojů
            </span>
            {markConflict && <span className="chip chip--bad">rozpor</span>}
          </div>
          <div className="cmp__v">
            {item.attributions.map((a, j) => (
              <OutletBadge key={j} attribution={a} />
            ))}
          </div>
        </li>
      ))}
    </ol>
  )
}
