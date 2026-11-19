import { describe, expect, it } from 'vitest'
import { criarCurso } from '#/regras/conteudo'
import { criarTurma } from '#/regras/matricula'
import {
  ErroDeVenda,
  ligarProduto,
  listarLigacoes,
  turmasDaVenda,
} from '#/regras/vendas'
import { criarBancoDeTeste } from '#/test/banco'

const T0 = new Date('2026-11-13T12:00:00Z')
const agora = () => T0

async function cenario() {
  const db = await criarBancoDeTeste()
  const cursoId = await criarCurso(db, { nome: 'Curso H' })
  const turmaA = await criarTurma(db, { cursoId, nome: 'Turma A' })
  const turmaB = await criarTurma(db, { cursoId, nome: 'Turma B' })
  return { db, turmaA, turmaB }
}

describe('ligação de produto da Hotmart a turmas', () => {
  it('liga o produto inteiro pelo product.id numérico, com gateway hotmart', async () => {
    const { db, turmaA } = await cenario()
    await ligarProduto(db, agora, {
      gateway: 'hotmart',
      produtoId: '4319408',
      turmaId: turmaA,
      prazoEmDias: 30,
    })
    expect(await turmasDaVenda(db, '4319408', null, 'hotmart')).toEqual([
      { turmaId: turmaA, prazoEmDias: 30 },
    ])
    const [l] = await listarLigacoes(db, 'hotmart')
    expect(l).toMatchObject({ produtoId: '4319408', ofertaHash: '' })
  })

  it('a ligação da Hotmart não vaza para a Voomp, nem o contrário', async () => {
    const { db, turmaA, turmaB } = await cenario()
    await ligarProduto(db, agora, {
      gateway: 'hotmart',
      produtoId: '123456',
      turmaId: turmaA,
    })
    await ligarProduto(db, agora, { produtoId: '123456', turmaId: turmaB })
    expect(await turmasDaVenda(db, '123456', null, 'hotmart')).toEqual([
      { turmaId: turmaA, prazoEmDias: null },
    ])
    expect(await turmasDaVenda(db, '123456', null, 'voomp')).toEqual([
      { turmaId: turmaB, prazoEmDias: null },
    ])
    expect(await listarLigacoes(db, 'hotmart')).toHaveLength(1)
  })

  it('oferta ligada soma com as turmas do produto; outra oferta cai no produto', async () => {
    const { db, turmaA, turmaB } = await cenario()
    const base = { gateway: 'hotmart' as const, produtoId: '698441' }
    await ligarProduto(db, agora, { ...base, turmaId: turmaA })
    await ligarProduto(db, agora, {
      ...base,
      ofertaHash: '02mhofjd',
      turmaId: turmaB,
      prazoEmDias: 15,
    })
    expect(await turmasDaVenda(db, '698441', '02mhofjd', 'hotmart')).toEqual([
      { turmaId: turmaB, prazoEmDias: 15 },
      { turmaId: turmaA, prazoEmDias: null },
    ])
    expect(await turmasDaVenda(db, '698441', 'outra', 'hotmart')).toEqual([
      { turmaId: turmaA, prazoEmDias: null },
    ])
    expect(await turmasDaVenda(db, '698441', null, 'hotmart')).toEqual([
      { turmaId: turmaA, prazoEmDias: null },
    ])
  })

  it('turma nas duas ligações vale uma vez, com o maior prazo; sem prazo vence', async () => {
    const { db, turmaA, turmaB } = await cenario()
    const base = { gateway: 'hotmart' as const, produtoId: '698441' }
    await ligarProduto(db, agora, { ...base, turmaId: turmaA, prazoEmDias: 30 })
    await ligarProduto(db, agora, {
      ...base,
      ofertaHash: 'x',
      turmaId: turmaA,
      prazoEmDias: 90,
    })
    await ligarProduto(db, agora, { ...base, turmaId: turmaB })
    await ligarProduto(db, agora, {
      ...base,
      ofertaHash: 'x',
      turmaId: turmaB,
      prazoEmDias: 5,
    })
    const turmas = await turmasDaVenda(db, '698441', 'x', 'hotmart')
    expect(turmas).toHaveLength(2)
    expect(turmas.find((t) => t.turmaId === turmaA)?.prazoEmDias).toBe(90)
    expect(turmas.find((t) => t.turmaId === turmaB)?.prazoEmDias).toBeNull()
  })

  it('várias turmas por produto; religar a mesma turma só troca o prazo', async () => {
    const { db, turmaA, turmaB } = await cenario()
    const base = { gateway: 'hotmart' as const, produtoId: '698441' }
    await ligarProduto(db, agora, { ...base, turmaId: turmaA })
    await ligarProduto(db, agora, { ...base, turmaId: turmaB })
    await ligarProduto(db, agora, { ...base, turmaId: turmaA, prazoEmDias: 7 })
    const turmas = await turmasDaVenda(db, '698441', null, 'hotmart')
    expect(turmas).toHaveLength(2)
    expect(turmas.find((t) => t.turmaId === turmaA)?.prazoEmDias).toBe(7)
  })

  it('o id do produto da Hotmart é número; o texto de erro fala de Hotmart', async () => {
    const { db, turmaA } = await cenario()
    const erro = await ligarProduto(db, agora, {
      gateway: 'hotmart',
      produtoId: 'f2b3be1f-313f-4a2d',
      turmaId: turmaA,
    }).catch((e) => e)
    expect(erro).toBeInstanceOf(ErroDeVenda)
    expect(erro.message).toMatch(/Hotmart.*número/)
    const vazio = await ligarProduto(db, agora, {
      gateway: 'hotmart',
      produtoId: ' ',
      turmaId: turmaA,
    }).catch((e) => e)
    expect(vazio.message).toMatch(/Hotmart/)
  })
})
