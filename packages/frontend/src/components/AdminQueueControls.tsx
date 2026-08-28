import './AdminQueueControls.css'

export interface SortOption<K extends string> {
  value: K
  label: string
}

/** The sort + filter toolbar shared by all three admin Ingestion queues (ticket 88). Purely
 *  presentational — each queue owns its own filter state and decides which controls apply
 *  (`outlet` is omitted for the Story-relations queue, which has no single outlet). */
export function AdminQueueControls<K extends string>({
  sortValue,
  sortOptions,
  onSortChange,
  outlet,
  onOutletChange,
  createdAfter,
  createdBefore,
  onCreatedAfterChange,
  onCreatedBeforeChange,
  idPrefix,
}: {
  sortValue: K
  sortOptions: SortOption<K>[]
  onSortChange: (value: K) => void
  outlet?: string
  onOutletChange?: (value: string) => void
  createdAfter: string
  createdBefore: string
  onCreatedAfterChange: (value: string) => void
  onCreatedBeforeChange: (value: string) => void
  idPrefix: string
}) {
  return (
    <div className="aqc">
      <div className="aqc__f">
        <label htmlFor={`${idPrefix}-sort`}>Řazení</label>
        <select id={`${idPrefix}-sort`} value={sortValue} onChange={(e) => onSortChange(e.target.value as K)}>
          {sortOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      {onOutletChange && (
        <div className="aqc__f">
          <label htmlFor={`${idPrefix}-outlet`}>Zdroj</label>
          <input
            id={`${idPrefix}-outlet`}
            value={outlet ?? ''}
            onChange={(e) => onOutletChange(e.target.value)}
            placeholder="např. Novinky"
          />
        </div>
      )}

      <div className="aqc__f">
        <label htmlFor={`${idPrefix}-after`}>Od</label>
        <input
          id={`${idPrefix}-after`}
          type="date"
          value={createdAfter}
          onChange={(e) => onCreatedAfterChange(e.target.value)}
        />
      </div>

      <div className="aqc__f">
        <label htmlFor={`${idPrefix}-before`}>Do</label>
        <input
          id={`${idPrefix}-before`}
          type="date"
          value={createdBefore}
          onChange={(e) => onCreatedBeforeChange(e.target.value)}
        />
      </div>
    </div>
  )
}
