import { useEffect, useState } from 'react'

/** Returns `value` after it has stopped changing for `delayMs` — for keystroke-driven queries
 *  (the `/admin/entities` type-ahead, ticket 50) so a search fires per pause, not per key. */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs)
    return () => clearTimeout(timer)
  }, [value, delayMs])

  return debounced
}
