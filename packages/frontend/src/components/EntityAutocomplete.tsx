import { useEffect, useId, useRef, useState } from 'react'
import type { EntitySearchResultItem } from '@news-triangulator/shared'
import { useEntitySearch } from '@/services/entities/hooks'
import { useDebouncedValue } from '@/lib/useDebouncedValue'
import { ENTITY_TYPE_LABELS } from '@/lib/entityTypeLabels'
import { looksLikeEntityKey, nextActiveIndex } from './entityAutocompleteModel'
import './EntityAutocomplete.css'

const DEBOUNCE_MS = 200
const MIN_QUERY_LENGTH = 2

/** Type-ahead entity picker (ticket 50) — replaces free-text `Entity.key` entry on
 *  `/admin/entities`. Searches by name (`GET /api/entities?q=`, `pg_trgm`, public), keyboard-
 *  navigable, and still lets an Admin who knows the exact `type:slug` key paste and pick it
 *  directly.
 *
 *  `onPick` gets the resolved key plus the full search result when the pick came from the
 *  dropdown, or `null` for a pasted raw key (where the type/link status isn't known — the caller
 *  must not render fabricated detail for that case). */
export function EntityAutocomplete({
  onPick,
  autoFocus,
}: {
  onPick: (key: string, entity: EntitySearchResultItem | null) => void
  autoFocus?: boolean
}) {
  const [text, setText] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const baseId = useId()
  const listId = `${baseId}-list`
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    return () => {
      if (blurTimer.current) clearTimeout(blurTimer.current)
    }
  }, [])

  const debounced = useDebouncedValue(text.trim(), DEBOUNCE_MS)
  const { data, isFetching } = useEntitySearch(debounced.length >= MIN_QUERY_LENGTH ? debounced : '')
  const results = data ?? []
  const rawKeyEntry = looksLikeEntityKey(text)

  const choose = (entity: EntitySearchResultItem) => {
    onPick(entity.key, entity)
    setText(entity.canonicalName)
    setOpen(false)
    setActive(-1)
  }

  const chooseRawKey = () => {
    onPick(text.trim(), null)
    setOpen(false)
    setActive(-1)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      setOpen(true)
      setActive((a) => nextActiveIndex(a, results.length, e.key === 'ArrowDown' ? 1 : -1))
    } else if (e.key === 'Enter') {
      if (active >= 0 && results[active]) {
        e.preventDefault()
        choose(results[active])
      } else if (rawKeyEntry) {
        e.preventDefault()
        chooseRawKey()
      }
    } else if (e.key === 'Escape') {
      setOpen(false)
      setActive(-1)
    }
  }

  const showDropdown = open && (results.length > 0 || (debounced.length >= MIN_QUERY_LENGTH && !isFetching))
  const activeOptionId = active >= 0 && results[active] ? `${baseId}-opt-${active}` : undefined

  return (
    <div className="eac">
      <input
        className="input"
        type="text"
        role="combobox"
        aria-expanded={showDropdown}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={activeOptionId}
        autoComplete="off"
        autoFocus={autoFocus}
        value={text}
        placeholder="Začněte psát jméno entity…"
        onChange={(e) => {
          setText(e.target.value)
          setOpen(true)
          setActive(-1)
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          // Delay so a mousedown on a result registers before the list unmounts.
          blurTimer.current = setTimeout(() => setOpen(false), 120)
        }}
        onKeyDown={handleKeyDown}
      />

      {showDropdown && (
        <ul className="eac__list" id={listId} role="listbox">
          {results.map((entity, i) => (
            <li
              key={entity.key}
              id={`${baseId}-opt-${i}`}
              role="option"
              aria-selected={i === active}
              className={`eac__opt${i === active ? ' is-active' : ''}`}
              onMouseDown={(e) => {
                e.preventDefault()
                if (blurTimer.current) clearTimeout(blurTimer.current)
                choose(entity)
              }}
            >
              <span className="eac__name">{entity.canonicalName}</span>
              <span className="eac__meta">
                {ENTITY_TYPE_LABELS[entity.type]}
                {entity.wikidataId && <span className="eac__linked"> · propojeno</span>}
              </span>
            </li>
          ))}
          {results.length === 0 && (
            <li className="eac__empty" role="presentation">
              {rawKeyEntry ? (
                <button
                  type="button"
                  className="eac__raw"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={chooseRawKey}
                >
                  Použít klíč <code>{text.trim()}</code>
                </button>
              ) : (
                'Žádná entita neodpovídá.'
              )}
            </li>
          )}
        </ul>
      )}
    </div>
  )
}
