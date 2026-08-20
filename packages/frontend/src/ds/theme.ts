// Theme persistence (ADR 0031): localStorage, not a server/cookie read — this is an
// unauthenticated static SPA with no SSR. The three states (`system` = follow
// prefers-color-scheme, `light`, `dark`) match DESIGN-SYSTEM.md §3.2 exactly; only the storage
// location differs. index.html's inline script applies the stored value before the bundle loads.

export type ThemePreference = 'system' | 'light' | 'dark'

const STORAGE_KEY = 'nt-theme'

export function getStoredTheme(): ThemePreference {
  const stored = localStorage.getItem(STORAGE_KEY)
  return stored === 'light' || stored === 'dark' ? stored : 'system'
}

export function applyTheme(pref: ThemePreference): void {
  if (pref === 'system') {
    document.documentElement.removeAttribute('data-theme')
    localStorage.removeItem(STORAGE_KEY)
  } else {
    document.documentElement.setAttribute('data-theme', pref)
    localStorage.setItem(STORAGE_KEY, pref)
  }
}

// The .utilbar toggle's own cycle order (ticket 39's Mechanics section).
export function nextTheme(current: ThemePreference): ThemePreference {
  if (current === 'system') return 'light'
  if (current === 'light') return 'dark'
  return 'system'
}
