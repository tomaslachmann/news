export interface PrimaryNavItem {
  label: string
  to: string
}

const RUBRICS = ['Domácí', 'Ekonomika', 'Svět', 'Energetika', 'Regiony', 'Sport', 'Kultura'] as const

export const ADMIN_HOME_PATH = '/admin/ingestion'

export function getPrimaryNavItems(isAdmin: boolean, compact = false): PrimaryNavItem[] {
  const rubrics = compact ? RUBRICS.slice(0, 5) : RUBRICS
  const items: PrimaryNavItem[] = [
    ...rubrics.map((label) => ({ label, to: '#' })),
    { label: isAdmin ? 'Historie' : 'Články', to: '/history' },
    { label: 'Hledat', to: '/search' },
  ]

  if (isAdmin) {
    items.push({ label: 'Admin', to: ADMIN_HOME_PATH })
  }

  return items
}
