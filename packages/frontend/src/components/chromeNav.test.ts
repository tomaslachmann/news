import { describe, expect, it } from 'vitest'
import { ADMIN_HOME_PATH, getPrimaryNavItems } from './chromeNav'

describe('getPrimaryNavItems', () => {
  it('leaves the public nav unchanged for non-admin readers', () => {
    expect(getPrimaryNavItems(false, false)).toEqual([
      { label: 'Domácí', to: '/category/domestic' },
      { label: 'Ekonomika', to: '/category/economy' },
      { label: 'Svět', to: '/category/world' },
      { label: 'Regiony', to: '/category/regional' },
      { label: 'Sport', to: '/category/sport' },
      { label: 'Kultura', to: '/category/culture' },
      { label: 'Články', to: '/history' },
      { label: 'Vlákna', to: '/threads' },
      { label: 'Hledat', to: '/search' },
    ])
  })

  it('shows a single admin entrypoint instead of individual admin links', () => {
    expect(getPrimaryNavItems(true, false)).toEqual([
      { label: 'Domácí', to: '/category/domestic' },
      { label: 'Ekonomika', to: '/category/economy' },
      { label: 'Svět', to: '/category/world' },
      { label: 'Regiony', to: '/category/regional' },
      { label: 'Sport', to: '/category/sport' },
      { label: 'Kultura', to: '/category/culture' },
      { label: 'Historie', to: '/history' },
      { label: 'Vlákna', to: '/threads' },
      { label: 'Hledat', to: '/search' },
      { label: 'Admin', to: ADMIN_HOME_PATH },
    ])
  })

  it('applies the same trim in compact sticky navigation', () => {
    expect(getPrimaryNavItems(true, true)).toEqual([
      { label: 'Domácí', to: '/category/domestic' },
      { label: 'Ekonomika', to: '/category/economy' },
      { label: 'Svět', to: '/category/world' },
      { label: 'Regiony', to: '/category/regional' },
      { label: 'Sport', to: '/category/sport' },
      { label: 'Historie', to: '/history' },
      { label: 'Vlákna', to: '/threads' },
      { label: 'Hledat', to: '/search' },
      { label: 'Admin', to: ADMIN_HOME_PATH },
    ])
  })
})
