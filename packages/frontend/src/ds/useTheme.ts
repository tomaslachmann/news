import { useCallback, useEffect, useState } from 'react'
import { applyTheme, getStoredTheme, nextTheme, type ThemePreference } from './theme'

/** Backs the .utilbar theme toggle — cycles system → light → dark on click. The DOM/localStorage
 *  side effect runs from a useEffect keyed on `theme`, not inside the setState updater itself —
 *  React (StrictMode especially) can invoke an updater more than once per state change, which
 *  would otherwise double-fire the side effect. */
export function useTheme(): [ThemePreference, () => void] {
  const [theme, setTheme] = useState<ThemePreference>(getStoredTheme)

  useEffect(() => {
    applyTheme(theme)
  }, [theme])

  const cycle = useCallback(() => {
    setTheme((current) => nextTheme(current))
  }, [])

  return [theme, cycle]
}
