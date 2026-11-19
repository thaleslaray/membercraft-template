import { afterEach, describe, expect, it, vi } from 'vitest'
import { querMenosMovimento } from '#/lib/menos-movimento'

function aparelhoCom(reduzido: boolean) {
  const consulta = vi.fn((q: string) => ({
    matches: q === '(prefers-reduced-motion: reduce)' && reduzido,
  }))
  vi.stubGlobal('window', { matchMedia: consulta })
  return consulta
}

afterEach(() => vi.unstubAllGlobals())

describe('querMenosMovimento', () => {
  it('verdadeiro quando a pessoa pediu menos movimento no aparelho', () => {
    aparelhoCom(true)
    expect(querMenosMovimento()).toBe(true)
  })

  it('falso quando não pediu', () => {
    aparelhoCom(false)
    expect(querMenosMovimento()).toBe(false)
  })

  it('no servidor, sem janela, é falso (não há movimento a cortar)', () => {
    expect(querMenosMovimento()).toBe(false)
  })
})
