import { describe, expect, it } from 'vitest'
import { ADMIN_HOME_PATH, getPrimaryNavItems } from './chromeNav'

describe('getPrimaryNavItems', () => {
  it('leaves the public nav unchanged for non-admin readers', () => {
    expect(getPrimaryNavItems(false, false)).toEqual([
      { label: 'Domácí', to: '#' },
      { label: 'Ekonomika', to: '#' },
      { label: 'Svět', to: '#' },
      { label: 'Energetika', to: '#' },
      { label: 'Regiony', to: '#' },
      { label: 'Sport', to: '#' },
      { label: 'Kultura', to: '#' },
      { label: 'Články', to: '/history' },
      { label: 'Hledat', to: '/search' },
    ])
  })

  it('shows a single admin entrypoint instead of individual admin links', () => {
    expect(getPrimaryNavItems(true, false)).toEqual([
      { label: 'Domácí', to: '#' },
      { label: 'Ekonomika', to: '#' },
      { label: 'Svět', to: '#' },
      { label: 'Energetika', to: '#' },
      { label: 'Regiony', to: '#' },
      { label: 'Sport', to: '#' },
      { label: 'Kultura', to: '#' },
      { label: 'Historie', to: '/history' },
      { label: 'Hledat', to: '/search' },
      { label: 'Admin', to: ADMIN_HOME_PATH },
    ])
  })

  it('applies the same trim in compact sticky navigation', () => {
    expect(getPrimaryNavItems(true, true)).toEqual([
      { label: 'Domácí', to: '#' },
      { label: 'Ekonomika', to: '#' },
      { label: 'Svět', to: '#' },
      { label: 'Energetika', to: '#' },
      { label: 'Regiony', to: '#' },
      { label: 'Historie', to: '/history' },
      { label: 'Hledat', to: '/search' },
      { label: 'Admin', to: ADMIN_HOME_PATH },
    ])
  })
})
