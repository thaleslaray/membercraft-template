import { describe, expect, it, vi } from 'vitest'
import { avaliacaoDaAula, user } from '#/db/schema'
import {
  avaliarAula,
  ErroDeAvaliacao,
  lerAvaliacao,
  listarAvaliacoes,
  marcarComoLida,
  satisfacaoPorAula,
} from '#/regras/avaliacoes'
import { criarAula, criarCurso, criarModulo } from '#/regras/conteudo'
import { criarBancoDeTeste } from '#/test/banco'

const agora = () => new Date('2026-06-01T12:00:00Z')

async function cenario() {
  const db = await criarBancoDeTeste()
  await db.insert(user).values([
    { id: 'ana', name: 'Ana', email: 'ana@x.test' },
    { id: 'bia', name: 'Bia', email: 'bia@x.test' },
    { id: 'eq', name: 'Equipe', email: 'eq@x.test' },
  ])
  const cursoId = await criarCurso(db, { nome: 'Coloração' })
  const moduloId = await criarModulo(db, cursoId, { nome: 'Base' })
  const aula1 = await criarAula(db, moduloId, { titulo: 'Raiz' })
  const aula2 = await criarAula(db, moduloId, { titulo: 'Mechas' })
  return { db, aula1, aula2 }
}

describe('avaliarAula', () => {
  it('grava a nota e avaliar de novo muda o mesmo registro', async () => {
    const { db, aula1 } = await cenario()
    await avaliarAula(db, agora, 'ana', aula1, { nota: 4 })
    await avaliarAula(db, agora, 'ana', aula1, { nota: 5 })
    await avaliarAula(db, agora, 'ana', aula1, { nota: 5 })
    expect(await db.select().from(avaliacaoDaAula)).toHaveLength(1)
    expect(await lerAvaliacao(db, 'ana', aula1)).toEqual({
      nota: 5,
      oQueFaltou: null,
    })
  })

  it('sem avaliação, a leitura volta nula', async () => {
    const { db, aula1 } = await cenario()
    expect(await lerAvaliacao(db, 'ana', aula1)).toBeNull()
  })

  it('recusa nota fora de 1 a 5, quebrada ou aula que não existe', async () => {
    const { db, aula1 } = await cenario()
    for (const nota of [0, 6, 2.5, Number.NaN]) {
      await expect(
        avaliarAula(db, agora, 'ana', aula1, { nota }),
      ).rejects.toBeInstanceOf(ErroDeAvaliacao)
    }
    await expect(
      avaliarAula(db, agora, 'ana', 'nao-existe', { nota: 3 }),
    ).rejects.toBeInstanceOf(ErroDeAvaliacao)
    expect(await db.select().from(avaliacaoDaAula)).toHaveLength(0)
  })

  it('guarda "o que faltou?" só com nota 1 ou 2', async () => {
    const { db, aula1, aula2 } = await cenario()
    await avaliarAula(db, agora, 'ana', aula1, {
      nota: 2,
      oQueFaltou: '  Faltou exemplo  ',
    })
    expect((await lerAvaliacao(db, 'ana', aula1))?.oQueFaltou).toBe(
      'Faltou exemplo',
    )
    await avaliarAula(db, agora, 'ana', aula2, {
      nota: 4,
      oQueFaltou: 'não deveria ficar',
    })
    expect((await lerAvaliacao(db, 'ana', aula2))?.oQueFaltou).toBeNull()
  })

  it('texto em branco vira vazio e texto longo demais é recusado', async () => {
    const { db, aula1 } = await cenario()
    await avaliarAula(db, agora, 'ana', aula1, { nota: 1, oQueFaltou: '   ' })
    expect((await lerAvaliacao(db, 'ana', aula1))?.oQueFaltou).toBeNull()
    await expect(
      avaliarAula(db, agora, 'ana', aula1, {
        nota: 1,
        oQueFaltou: 'x'.repeat(2001),
      }),
    ).rejects.toBeInstanceOf(ErroDeAvaliacao)
  })

  it('subir a nota para 3 ou mais apaga o texto e tira da fila', async () => {
    const { db, aula1 } = await cenario()
    await avaliarAula(db, agora, 'ana', aula1, { nota: 1, oQueFaltou: 'ruim' })
    expect(await listarAvaliacoes(db, 'para-ler')).toHaveLength(1)
    await avaliarAula(db, agora, 'ana', aula1, { nota: 4 })
    expect((await lerAvaliacao(db, 'ana', aula1))?.oQueFaltou).toBeNull()
    expect(await listarAvaliacoes(db, 'para-ler')).toHaveLength(0)
  })

  it('chama o gancho só na primeira avaliação da aula', async () => {
    const { db, aula1, aula2 } = await cenario()
    const aoAvaliarPelaPrimeiraVez = vi.fn().mockResolvedValue(undefined)
    await avaliarAula(
      db,
      agora,
      'ana',
      aula1,
      { nota: 3 },
      { aoAvaliarPelaPrimeiraVez },
    )
    await avaliarAula(
      db,
      agora,
      'ana',
      aula1,
      { nota: 5 },
      { aoAvaliarPelaPrimeiraVez },
    )
    expect(aoAvaliarPelaPrimeiraVez).toHaveBeenCalledTimes(1)
    expect(aoAvaliarPelaPrimeiraVez).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'ana', aulaId: aula1, nota: 3 }),
    )
    await avaliarAula(
      db,
      agora,
      'ana',
      aula2,
      { nota: 5 },
      { aoAvaliarPelaPrimeiraVez },
    )
    await avaliarAula(
      db,
      agora,
      'bia',
      aula1,
      { nota: 5 },
      { aoAvaliarPelaPrimeiraVez },
    )
    expect(aoAvaliarPelaPrimeiraVez).toHaveBeenCalledTimes(3)
  })
})

describe('fila "Avaliações para ler"', () => {
  it('lista só notas com texto ainda não lido, com aluno, aula e curso', async () => {
    const { db, aula1, aula2 } = await cenario()
    await avaliarAula(db, agora, 'ana', aula1, {
      nota: 1,
      oQueFaltou: 'Rápida',
    })
    await avaliarAula(db, agora, 'bia', aula1, { nota: 2 })
    await avaliarAula(db, agora, 'bia', aula2, { nota: 5 })
    const fila = await listarAvaliacoes(db, 'para-ler')
    expect(fila).toHaveLength(1)
    expect(fila[0]).toMatchObject({
      nota: 1,
      oQueFaltou: 'Rápida',
      alunoNome: 'Ana',
      alunoEmail: 'ana@x.test',
      aulaTitulo: 'Raiz',
      cursoNome: 'Coloração',
      lidaEm: null,
    })
  })

  it('marcar como lida tira da fila, vai para as lidas e é seguro repetir', async () => {
    const { db, aula1 } = await cenario()
    await avaliarAula(db, agora, 'ana', aula1, {
      nota: 1,
      oQueFaltou: 'Rápida',
    })
    const [item] = await listarAvaliacoes(db, 'para-ler')
    await marcarComoLida(db, agora, 'eq', item.id)
    await marcarComoLida(
      db,
      () => new Date('2026-07-01T00:00:00Z'),
      'eq',
      item.id,
    )
    expect(await listarAvaliacoes(db, 'para-ler')).toHaveLength(0)
    const lidas = await listarAvaliacoes(db, 'lidas')
    expect(lidas).toHaveLength(1)
    expect(lidas[0].lidaEm).toEqual(agora())
    expect(lidas[0].lidaPorNome).toBe('Equipe')
  })

  it('o aluno que reescreve o texto volta para a fila; o mesmo texto não', async () => {
    const { db, aula1 } = await cenario()
    await avaliarAula(db, agora, 'ana', aula1, {
      nota: 1,
      oQueFaltou: 'Rápida',
    })
    const [item] = await listarAvaliacoes(db, 'para-ler')
    await marcarComoLida(db, agora, 'eq', item.id)
    await avaliarAula(db, agora, 'ana', aula1, {
      nota: 2,
      oQueFaltou: 'Rápida',
    })
    expect(await listarAvaliacoes(db, 'para-ler')).toHaveLength(0)
    await avaliarAula(db, agora, 'ana', aula1, {
      nota: 2,
      oQueFaltou: 'Sem áudio',
    })
    expect(await listarAvaliacoes(db, 'para-ler')).toHaveLength(1)
  })

  it('marcar como lida uma avaliação que não existe falha', async () => {
    const { db } = await cenario()
    await expect(
      marcarComoLida(db, agora, 'eq', 'nao-existe'),
    ).rejects.toBeInstanceOf(ErroDeAvaliacao)
  })
})

describe('satisfacaoPorAula', () => {
  it('traz média, total e percentual de notas baixas, piores aulas primeiro', async () => {
    const { db, aula1, aula2 } = await cenario()
    await avaliarAula(db, agora, 'ana', aula1, { nota: 1 })
    await avaliarAula(db, agora, 'bia', aula1, { nota: 4 })
    await avaliarAula(db, agora, 'ana', aula2, { nota: 5 })
    const r = await satisfacaoPorAula(db)
    expect(r.map((x) => x.aulaId)).toEqual([aula1, aula2])
    expect(r[0]).toMatchObject({
      total: 2,
      media: 2.5,
      percentualDeNotasBaixas: 50,
    })
    expect(r[1]).toMatchObject({
      total: 1,
      media: 5,
      percentualDeNotasBaixas: 0,
    })
  })
})
