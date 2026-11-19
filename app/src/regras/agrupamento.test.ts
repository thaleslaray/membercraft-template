import { describe, expect, it } from 'vitest'
import {
  adicionarAviso,
  coletarAvisosProntos,
  JANELA_DE_AGRUPAMENTO_MS,
  separarProntos,
} from '#/regras/agrupamento'
import { criarBancoDeTeste } from '#/test/banco'

const T0 = new Date('2026-06-01T12:00:00Z')
const apos = (min: number) => new Date(T0.getTime() + min * 60_000)
const aviso = (id: string, chave: string, min: number) => ({
  id,
  chave,
  dados: {},
  criadoEm: apos(min),
})

describe('separarProntos', () => {
  it('a janela é de 15 minutos', () => {
    expect(JANELA_DE_AGRUPAMENTO_MS).toBe(15 * 60_000)
  })

  it('antes de 15 minutos do primeiro aviso, nada sai', () => {
    expect(separarProntos([aviso('a', 'k', 0)], apos(14))).toEqual([])
  })

  it('aos 15 minutos do primeiro, todos os avisos da chave saem juntos, em ordem', () => {
    const prontos = separarProntos(
      [aviso('b', 'k', 10), aviso('a', 'k', 0), aviso('c', 'k', 14)],
      apos(15),
    )
    expect(prontos).toHaveLength(1)
    expect(prontos[0]?.avisos.map((a) => a.id)).toEqual(['a', 'b', 'c'])
  })

  it('chaves diferentes não se misturam e cada uma tem a sua janela', () => {
    const prontos = separarProntos(
      [aviso('a', 'ana', 0), aviso('b', 'bia', 10)],
      apos(16),
    )
    expect(prontos.map((g) => g.chave)).toEqual(['ana'])
  })
})

describe('coletarAvisosProntos', () => {
  it('devolve os grupos prontos e os tira da tabela (a segunda coleta vem vazia)', async () => {
    const db = await criarBancoDeTeste()
    let agora = T0
    const relogio = () => agora
    await adicionarAviso(db, relogio, { chave: 'ana', dados: { n: 1 } })
    agora = apos(5)
    await adicionarAviso(db, relogio, { chave: 'ana', dados: { n: 2 } })
    await adicionarAviso(db, relogio, { chave: 'bia', dados: { n: 3 } })

    agora = apos(10)
    expect(await coletarAvisosProntos(db, relogio)).toEqual([])

    agora = apos(15)
    const grupos = await coletarAvisosProntos(db, relogio)
    expect(grupos).toHaveLength(1)
    expect(grupos[0]?.chave).toBe('ana')
    expect(grupos[0]?.avisos.map((a) => a.dados)).toEqual([{ n: 1 }, { n: 2 }])
    expect(await coletarAvisosProntos(db, relogio)).toEqual([])

    // O aviso da Bia ficou: sai quando a janela dela completar.
    agora = apos(20)
    const depois = await coletarAvisosProntos(db, relogio)
    expect(depois.map((g) => g.chave)).toEqual(['bia'])
  })
})
