import { describe, expect, it } from 'vitest'
import { abaDaBusca, buscaDoRankingAntigo } from '#/lib/aba-da-comunidade'

describe('aba da Comunidade', () => {
  it('só "ranking" vira aba; qualquer outra coisa é o Mural', () => {
    expect(abaDaBusca('ranking')).toBe('ranking')
    expect(abaDaBusca('mural')).toBeUndefined()
    expect(abaDaBusca(undefined)).toBeUndefined()
    expect(abaDaBusca(42)).toBeUndefined()
  })

  it('o link antigo de /ranking leva à aba, guardando o curso', () => {
    expect(buscaDoRankingAntigo(undefined)).toEqual({ aba: 'ranking' })
    expect(buscaDoRankingAntigo('c-1')).toEqual({
      aba: 'ranking',
      curso: 'c-1',
    })
  })
})
