import { describe, expect, it } from 'vitest'
import { emProducaoDeVerdade } from '#/lib/producao'

describe('emProducaoDeVerdade', () => {
  it('só é produção com AMBIENTE=producao e fora do dev server', () => {
    expect(emProducaoDeVerdade('producao', false)).toBe(true)
    expect(emProducaoDeVerdade('producao', true)).toBe(false)
    expect(emProducaoDeVerdade('teste', false)).toBe(false)
    expect(emProducaoDeVerdade(undefined, false)).toBe(false)
  })
})
