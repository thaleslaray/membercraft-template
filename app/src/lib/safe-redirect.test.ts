import { describe, expect, it } from 'vitest'

import { safeRedirect } from '#/lib/safe-redirect'

describe('safeRedirect', () => {
  it('usa / (Início) quando não há valor', () => {
    expect(safeRedirect(undefined)).toBe('/')
    expect(safeRedirect('')).toBe('/')
  })

  it('aceita caminhos do próprio site', () => {
    expect(safeRedirect('/x')).toBe('/x')
    expect(safeRedirect('/conta?aba=1')).toBe('/conta?aba=1')
  })

  it('recusa // (protocolo relativo)', () => {
    expect(safeRedirect('//evil.com')).toBe('/')
  })

  it('recusa URL absoluta', () => {
    expect(safeRedirect('https://evil.com')).toBe('/')
    expect(safeRedirect('javascript:alert(1)')).toBe('/')
  })
})
