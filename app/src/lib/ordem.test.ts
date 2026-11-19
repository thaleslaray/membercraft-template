import { describe, expect, it } from 'vitest'
import { moverNaLista, soltarNaPosicao } from '#/lib/ordem'

describe('moverNaLista', () => {
  it('sobe e desce um item', () => {
    expect(moverNaLista(['a', 'b', 'c'], 'b', -1)).toEqual(['b', 'a', 'c'])
    expect(moverNaLista(['a', 'b', 'c'], 'b', 1)).toEqual(['a', 'c', 'b'])
  })
  it('não move além das pontas nem item que não existe', () => {
    expect(moverNaLista(['a', 'b'], 'a', -1)).toEqual(['a', 'b'])
    expect(moverNaLista(['a', 'b'], 'b', 1)).toEqual(['a', 'b'])
    expect(moverNaLista(['a', 'b'], 'x', 1)).toEqual(['a', 'b'])
  })
})

describe('soltarNaPosicao', () => {
  it('leva o item arrastado para o lugar do alvo', () => {
    expect(soltarNaPosicao(['a', 'b', 'c'], 'a', 'c')).toEqual(['b', 'c', 'a'])
    expect(soltarNaPosicao(['a', 'b', 'c'], 'c', 'a')).toEqual(['c', 'a', 'b'])
  })
  it('não muda nada se soltar em si mesmo ou em item desconhecido', () => {
    expect(soltarNaPosicao(['a', 'b'], 'a', 'a')).toEqual(['a', 'b'])
    expect(soltarNaPosicao(['a', 'b'], 'a', 'x')).toEqual(['a', 'b'])
  })
})
