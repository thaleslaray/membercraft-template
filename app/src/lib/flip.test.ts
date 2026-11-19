import { describe, expect, it } from 'vitest'
import { deslocamentoFlip } from '#/lib/flip'

const caixa = (left: number, top: number) => ({ left, top })

describe('deslocamentoFlip', () => {
  it('devolve quanto o item precisa voltar para parecer parado', () => {
    expect(deslocamentoFlip(caixa(0, 100), caixa(0, 40))).toEqual({
      dx: 0,
      dy: 60,
    })
    expect(deslocamentoFlip(caixa(10, 0), caixa(40, 0))).toEqual({
      dx: -30,
      dy: 0,
    })
  })
  it('item que não se mexeu não anima', () => {
    expect(deslocamentoFlip(caixa(5, 5), caixa(5, 5))).toBeNull()
  })
  it('ignora deslocamento menor que meio pixel', () => {
    expect(deslocamentoFlip(caixa(0, 0.3), caixa(0, 0))).toBeNull()
  })
})
