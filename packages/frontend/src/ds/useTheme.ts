import { useCallback, useState } from 'react'
import { applyTheme, getStoredTheme, nextTheme, type ThemePreference } from './theme'

/** Backs the .utilbar theme toggle — cycles system → light → dark on click. */
export function useTheme(): [ThemePreference, () => void] {
  const [theme, setTheme] = useState<ThemePreference>(getStoredTheme)

  const cycle = useCallback(() => {
    setTheme((current) => {
      const next = nextTheme(current)
      applyTheme(next)
      return next
    })
  }, [])

  return [theme, cycle]
}
