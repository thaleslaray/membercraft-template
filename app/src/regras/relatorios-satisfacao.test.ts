import { describe, expect, it } from 'vitest'
import { avaliacaoDaAula, user } from '#/db/schema'
import { avaliarAula } from '#/regras/avaliacoes'
import { criarAula, criarCurso, criarModulo } from '#/regras/conteudo'
import { periodoDoRelatorio } from '#/regras/relatorios'
import {
  relatorioDeSatisfacao,
  resumirNotas,
} from '#/regras/relatorios-satisfacao'
import { criarBancoDeTeste } from '#/test/banco'

const D = (texto: string) => new Date(texto)
const hoje = D('2026-06-15T15:00:00Z')
const periodo = periodoDoRelatorio(hoje, '2026-06-01', '2026-06-15')

describe('resumirNotas', () => {
  it('calcula média, notas baixas e NPS adaptado (5 promove, 4 neutro, 1 a 3 detrai)', () => {
    expect(resumirNotas([5, 5, 4, 2, 1])).toEqual({
      total: 5,
      media: 3.4,
      percentualDeNotasBaixas: 40,
      promotores: 2,
      neutros: 1,
      detratores: 2,
      nps: 0,
    })
    expect(resumirNotas([5, 5, 5, 3]).nps).toBe(50)
    expect(resumirNotas([3, 3]).nps).toBe(-100)
  })

  it('sem notas, tudo vazio', () => {
    expect(resumirNotas([])).toMatchObject({
      total: 0,
      media: null,
      percentualDeNotasBaixas: null,
      nps: null,
    })
  })
})

async function cenario() {
  const db = await criarBancoDeTeste()
  await db.insert(user).values([
    { id: 'ana', name: 'Ana', email: 'ana@x.test' },
    { id: 'bia', name: 'Bia', email: 'bia@x.test' },
    { id: 'caio', name: 'Caio', email: 'caio@x.test' },
  ])
  const cursoA = await criarCurso(db, { nome: 'Coloração' })
  const cursoB = await criarCurso(db, { nome: 'Corte' })
  const modA = await criarModulo(db, cursoA, { nome: 'Base' })
  const modB = await criarModulo(db, cursoB, { nome: 'Base' })
  const raiz = await criarAula(db, modA, { titulo: 'Raiz' })
  const mechas = await criarAula(db, modA, { titulo: 'Mechas' })
  const tesoura = await criarAula(db, modB, { titulo: 'Tesoura' })
  const em = (data: string) => () => D(data)
  await avaliarAula(db, em('2026-06-10T12:00:00Z'), 'ana', raiz, { nota: 5 })
  await avaliarAula(db, em('2026-06-10T12:00:00Z'), 'bia', raiz, { nota: 4 })
  await avaliarAula(db, em('2026-06-11T12:00:00Z'), 'ana', mechas, {
    nota: 1,
    oQueFaltou: 'Faltou o passo a passo',
  })
  await avaliarAula(db, em('2026-06-12T12:00:00Z'), 'bia', mechas, { nota: 2 })
  await avaliarAula(db, em('2026-06-12T12:00:00Z'), 'caio', mechas, { nota: 3 })
  await avaliarAula(db, em('2026-06-13T12:00:00Z'), 'ana', tesoura, { nota: 5 })
  // Fora do período.
  await avaliarAula(db, em('2026-05-01T12:00:00Z'), 'caio', raiz, { nota: 1 })
  return { db, cursoA, cursoB }
}

describe('relatório de satisfação', () => {
  it('lista as aulas das piores para as melhores, com média, notas baixas e NPS', async () => {
    const { db } = await cenario()
    const r = await relatorioDeSatisfacao(db, { periodo })
    expect(
      r.aulas.map((a) => [
        a.aulaTitulo,
        a.media,
        a.percentualDeNotasBaixas,
        a.nps,
      ]),
    ).toEqual([
      ['Mechas', 2, 67, -100],
      ['Raiz', 4.5, 0, 50],
      ['Tesoura', 5, 0, 100],
    ])
    expect(r.resumo).toMatchObject({
      total: 6,
      media: 3.3,
      percentualDeNotasBaixas: 33,
    })
  })

  it('traz os textos de "o que faltou?" e respeita período e curso', async () => {
    const { db, cursoB } = await cenario()
    const r = await relatorioDeSatisfacao(db, { periodo })
    expect(r.textos).toHaveLength(1)
    expect(r.textos[0]).toMatchObject({
      oQueFaltou: 'Faltou o passo a passo',
      aulaTitulo: 'Mechas',
      alunoNome: 'Ana',
      lida: false,
    })
    const soB = await relatorioDeSatisfacao(db, { periodo, cursoId: cursoB })
    expect(soB.aulas.map((a) => a.aulaTitulo)).toEqual(['Tesoura'])
    expect(soB.textos).toEqual([])
    const maio = await relatorioDeSatisfacao(db, {
      periodo: periodoDoRelatorio(hoje, '2026-05-01', '2026-05-31'),
    })
    expect(maio.resumo.total).toBe(1)
  })

  it('texto já lido aparece como lido', async () => {
    const { db } = await cenario()
    await db.update(avaliacaoDaAula).set({ lidaEm: hoje })
    const r = await relatorioDeSatisfacao(db, { periodo })
    expect(r.textos[0]?.lida).toBe(true)
  })
})
