import { beforeEach, describe, expect, it, vi } from 'vitest'
import { adicionarAviso, coletarAvisosProntos } from '#/regras/agrupamento'
import {
  type Agrupadores,
  enviarAgrupamentosProntos,
} from '#/regras/agrupamento-envio'
import { criarBancoDeTeste } from '#/test/banco'

const T0 = new Date('2026-06-01T12:00:00Z')
let t = T0
const agora = () => t
const deps = {
  pedirEmail: vi.fn(async () => undefined),
  baseDoApp: 'https://escola.exemplo',
}

beforeEach(() => {
  t = T0
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
})

describe('enviarAgrupamentosProntos', () => {
  it('chama o agrupador do prefixo da chave, uma vez por grupo pronto', async () => {
    const db = await criarBancoDeTeste()
    const recebidos: number[] = []
    const agrupadores: Agrupadores = {
      'resposta-ao-comentario': async (grupo) => {
        recebidos.push(grupo.avisos.length)
      },
    }
    await adicionarAviso(db, agora, { chave: 'resposta-ao-comentario:ana' })
    t = new Date(T0.getTime() + 5 * 60_000)
    await adicionarAviso(db, agora, { chave: 'resposta-ao-comentario:ana' })
    expect(
      await enviarAgrupamentosProntos(db, agora, deps, agrupadores),
    ).toEqual({
      enviados: 0,
      devolvidos: 0,
    })
    t = new Date(T0.getTime() + 15 * 60_000)
    expect(
      await enviarAgrupamentosProntos(db, agora, deps, agrupadores),
    ).toEqual({
      enviados: 1,
      devolvidos: 0,
    })
    expect(recebidos).toEqual([2])
    expect(await coletarAvisosProntos(db, agora)).toEqual([])
  })

  it('grupo sem agrupador registrado volta para a tabela com a hora original', async () => {
    const db = await criarBancoDeTeste()
    await adicionarAviso(db, agora, {
      chave: 'atendimento:ana',
      dados: { a: 1 },
    })
    t = new Date(T0.getTime() + 20 * 60_000)
    expect(await enviarAgrupamentosProntos(db, agora, deps, {})).toEqual({
      enviados: 0,
      devolvidos: 1,
    })
    const de_novo = await coletarAvisosProntos(db, agora)
    expect(de_novo).toHaveLength(1)
    expect(de_novo[0]?.avisos[0]?.criadoEm).toEqual(T0)
    expect(de_novo[0]?.avisos[0]?.dados).toEqual({ a: 1 })
  })

  it('agrupador que falha devolve o grupo (nada se perde)', async () => {
    const db = await criarBancoDeTeste()
    const agrupadores: Agrupadores = {
      quiz: async () => {
        throw new Error('fila fora do ar')
      },
    }
    await adicionarAviso(db, agora, { chave: 'quiz:ana' })
    t = new Date(T0.getTime() + 15 * 60_000)
    expect(
      await enviarAgrupamentosProntos(db, agora, deps, agrupadores),
    ).toEqual({
      enviados: 0,
      devolvidos: 1,
    })
    expect(await coletarAvisosProntos(db, agora)).toHaveLength(1)
  })
})
