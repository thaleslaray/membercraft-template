import { describe, expect, it } from 'vitest'
import {
  deslocamento,
  montarPagina,
  POR_PAGINA,
  paginaValida,
} from '#/regras/paginacao'

describe('paginação de 20 em 20', () => {
  it('são 20 por página', () => {
    expect(POR_PAGINA).toBe(20)
  })

  it('a página pedida vira um inteiro de 1 em diante', () => {
    expect(paginaValida(3)).toBe(3)
    expect(paginaValida('4')).toBe(4)
    expect(paginaValida(2.9)).toBe(2)
    for (const ruim of [0, -1, Number.NaN, 'abc', undefined, null]) {
      expect(paginaValida(ruim)).toBe(1)
    }
  })

  it('o deslocamento pula as páginas anteriores', () => {
    expect(deslocamento(1)).toBe(0)
    expect(deslocamento(2)).toBe(20)
    expect(deslocamento(5)).toBe(80)
  })

  it('monta a página com o total e o número de páginas', () => {
    expect(montarPagina(['a', 'b'], 45, 2)).toEqual({
      itens: ['a', 'b'],
      pagina: 2,
      porPagina: 20,
      total: 45,
      totalDePaginas: 3,
    })
    expect(montarPagina([], 0, 1).totalDePaginas).toBe(1)
    expect(montarPagina([], 20, 1).totalDePaginas).toBe(1)
    expect(montarPagina([], 21, 1).totalDePaginas).toBe(2)
  })
})
