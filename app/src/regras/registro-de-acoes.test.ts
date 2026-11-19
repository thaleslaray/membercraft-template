import { describe, expect, it } from 'vitest'
import { user } from '#/db/schema'
import {
  listarAcoesComAutor,
  opcoesDoRegistro,
  registrarAcao,
  rotuloDaAcao,
} from '#/regras/registro-de-acoes'
import { criarBancoDeTeste } from '#/test/banco'

describe('registro de ações paginado', () => {
  it('traz 20 por página, da mais nova à mais antiga, com quem fez', async () => {
    const db = await criarBancoDeTeste()
    await db
      .insert(user)
      .values({ id: 'eq', name: 'Marina', email: 'marina@x.test' })
    for (let i = 0; i < 45; i++) {
      await registrarAcao(db, () => new Date(Date.UTC(2026, 5, 1, 12, i)), {
        autorId: 'eq',
        acao: 'pontos-avulsos',
        detalhe: { i },
      })
    }
    const primeira = await listarAcoesComAutor(db)
    expect(primeira.itens).toHaveLength(20)
    expect(primeira).toMatchObject({
      pagina: 1,
      porPagina: 20,
      total: 45,
      totalDePaginas: 3,
    })
    expect(primeira.itens[0]).toMatchObject({ autorNome: 'Marina' })
    expect(primeira.itens[0].criadoEm.getTime()).toBeGreaterThan(
      primeira.itens[19].criadoEm.getTime(),
    )
    expect((await listarAcoesComAutor(db, 3)).itens).toHaveLength(5)
    expect((await listarAcoesComAutor(db, 9)).itens).toHaveLength(0)
  })
})

describe('rótulo legível da ação', () => {
  it('usa o nome dado à ação e, sem nome, escreve em palavras', () => {
    expect(rotuloDaAcao('matricula-manual')).toBe('Matrícula manual')
    expect(rotuloDaAcao('excluir-curso')).toBe('Excluir curso')
    expect(rotuloDaAcao('curso_arquivado')).toBe('Curso arquivado')
    expect(rotuloDaAcao('')).toBe('')
  })
})

describe('registro de ações filtrado', () => {
  it('filtra por pessoa, ação e dia (em Brasília) e lista as opções', async () => {
    const db = await criarBancoDeTeste()
    await db.insert(user).values([
      { id: 'a', name: 'Marina', email: 'marina@x.test' },
      { id: 'b', name: 'Bruno', email: 'bruno@x.test' },
    ])
    const grava = (
      autorId: string,
      acao: 'pontos-avulsos' | 'troca-de-email',
      quando: Date,
    ) => registrarAcao(db, () => quando, { autorId, acao })
    // 02:00 UTC de 11/06 ainda é 10/06 em Brasília (23h).
    await grava('a', 'pontos-avulsos', new Date(Date.UTC(2026, 5, 11, 2)))
    await grava('a', 'troca-de-email', new Date(Date.UTC(2026, 5, 11, 15)))
    await grava('b', 'pontos-avulsos', new Date(Date.UTC(2026, 5, 12, 15)))

    expect((await listarAcoesComAutor(db, 1, { autorId: 'a' })).total).toBe(2)
    expect(
      (await listarAcoesComAutor(db, 1, { acao: 'pontos-avulsos' })).total,
    ).toBe(2)
    expect((await listarAcoesComAutor(db, 1, { de: '2026-06-11' })).total).toBe(
      2,
    )
    expect(
      (await listarAcoesComAutor(db, 1, { ate: '2026-06-10' })).total,
    ).toBe(1)
    expect(
      (
        await listarAcoesComAutor(db, 1, {
          autorId: 'a',
          acao: 'troca-de-email',
          de: '2026-06-11',
          ate: '2026-06-11',
        })
      ).total,
    ).toBe(1)

    const opcoes = await opcoesDoRegistro(db)
    expect(opcoes.pessoas.map((p) => p.valor)).toEqual(['b', 'a'])
    expect(opcoes.acoes.map((a) => a.rotulo)).toEqual([
      'Pontos avulsos',
      'Troca de e-mail',
    ])
  })
})
