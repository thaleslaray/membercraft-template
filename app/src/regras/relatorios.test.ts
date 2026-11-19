import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { matricula, progressoDaAula, session, user } from '#/db/schema'
import { avaliarAula } from '#/regras/avaliacoes'
import { criarAula, criarCurso, criarModulo } from '#/regras/conteudo'
import { criarTurma } from '#/regras/matricula'
import {
  ErroDeRelatorio,
  faixaDoPercentual,
  panorama,
  periodoDoRelatorio,
  progressoDosAlunos,
  ultimosAcessos,
} from '#/regras/relatorios'
import { criarBancoDeTeste } from '#/test/banco'

const D = (texto: string) => new Date(texto)
const hoje = D('2026-06-15T15:00:00Z')
const agora = () => hoje

describe('periodoDoRelatorio', () => {
  it('sem datas, os últimos 30 dias até o fim de hoje em Brasília', () => {
    const p = periodoDoRelatorio(hoje)
    expect(p.de.toISOString()).toBe('2026-05-17T03:00:00.000Z')
    expect(p.ate.toISOString()).toBe('2026-06-16T02:59:59.000Z')
  })

  it('usa o dia de Brasília, não o de UTC (1h da manhã UTC ainda é ontem)', () => {
    const p = periodoDoRelatorio(D('2026-06-15T01:00:00Z'))
    expect(p.ate.toISOString()).toBe('2026-06-15T02:59:59.000Z')
  })

  it('começa no início do primeiro dia e termina no fim do último', () => {
    const p = periodoDoRelatorio(hoje, '2026-06-01', '2026-06-10')
    expect(p.de.toISOString()).toBe('2026-06-01T03:00:00.000Z')
    expect(p.ate.toISOString()).toBe('2026-06-11T02:59:59.000Z')
  })

  it('recusa data inválida e período invertido', () => {
    expect(() => periodoDoRelatorio(hoje, '01/06/2026')).toThrow(
      ErroDeRelatorio,
    )
    expect(() => periodoDoRelatorio(hoje, '2026-06-10', '2026-06-01')).toThrow(
      ErroDeRelatorio,
    )
  })
})

describe('faixas de progresso', () => {
  it('classifica o percentual', () => {
    expect([0, 1, 25, 26, 50, 75, 76, 99, 100].map(faixaDoPercentual)).toEqual([
      '0',
      '1-25',
      '1-25',
      '26-50',
      '26-50',
      '51-75',
      '76-99',
      '76-99',
      '100',
    ])
  })
})

async function cenario() {
  const db = await criarBancoDeTeste()
  await db.insert(user).values([
    {
      id: 'ana',
      name: 'Ana',
      email: 'ana@x.test',
      createdAt: D('2026-06-10T12:00:00Z'),
    },
    {
      id: 'bia',
      name: 'Bia',
      email: 'bia@x.test',
      createdAt: D('2026-03-01T12:00:00Z'),
    },
    {
      id: 'caio',
      name: 'Caio',
      email: 'caio@x.test',
      createdAt: D('2026-06-12T12:00:00Z'),
    },
    { id: 'eq', name: 'Equipe', email: 'eq@x.test', perfil: 'equipe' },
  ])
  const cursoA = await criarCurso(db, { nome: 'Coloração' })
  const cursoB = await criarCurso(db, { nome: 'Corte' })
  const modA = await criarModulo(db, cursoA, { nome: 'Base' })
  const modB = await criarModulo(db, cursoB, { nome: 'Base' })
  const a1 = await criarAula(db, modA, { titulo: 'Raiz' })
  const a2 = await criarAula(db, modA, { titulo: 'Mechas' })
  const b1 = await criarAula(db, modB, { titulo: 'Tesoura' })
  const turmaA = await criarTurma(db, { cursoId: cursoA, nome: 'A1' })
  const turmaB = await criarTurma(db, { cursoId: cursoB, nome: 'B1' })
  const mat = (
    id: string,
    userId: string,
    turmaId: string,
    criadoEm: Date,
    extra = {},
  ) => ({
    id,
    userId,
    turmaId,
    iniciaEm: criadoEm,
    criadoEm,
    ...extra,
  })
  await db
    .insert(matricula)
    .values([
      mat('m1', 'ana', turmaA, D('2026-06-10T12:00:00Z')),
      mat('m2', 'bia', turmaA, D('2026-03-01T12:00:00Z')),
      mat('m3', 'caio', turmaA, D('2026-06-12T12:00:00Z')),
      mat('m4', 'bia', turmaB, D('2026-06-02T12:00:00Z')),
    ])
  const prog = (userId: string, aulaId: string, extra: object) => ({
    id: `${userId}-${aulaId}`,
    userId,
    aulaId,
    abertaEm: D('2026-06-14T12:00:00Z'),
    ...extra,
  })
  await db.insert(progressoDaAula).values([
    prog('ana', a1, {
      concluidaEm: D('2026-06-14T13:00:00Z'),
      tempoTocando: 600,
    }),
    prog('ana', a2, { tempoTocando: 120 }),
    // Bia: acessou antes do período e concluiu as duas aulas do curso A.
    prog('bia', a1, {
      abertaEm: D('2026-04-01T12:00:00Z'),
      concluidaEm: D('2026-04-01T13:00:00Z'),
      tempoTocando: 300,
    }),
    prog('bia', a2, {
      abertaEm: D('2026-04-02T12:00:00Z'),
      concluidaEm: D('2026-04-02T13:00:00Z'),
      tempoTocando: 300,
    }),
    prog('bia', b1, {
      abertaEm: D('2026-06-05T12:00:00Z'),
      concluidaEm: D('2026-06-05T13:00:00Z'),
    }),
  ])
  return { db, cursoA, cursoB, a1, a2, b1, turmaA }
}

describe('panorama', () => {
  it('conta ativos, novos, nunca acessaram, concluídas e avaliações no período', async () => {
    const { db, a1 } = await cenario()
    await avaliarAula(db, agora, 'ana', a1, { nota: 5 })
    const p = await panorama(db, {
      periodo: periodoDoRelatorio(hoje, '2026-06-01', '2026-06-15'),
    })
    // Ana abriu aula no período e Bia abriu a do curso B em 05/06; Caio nunca entrou.
    expect(p.geral).toEqual({
      alunosAtivos: 2,
      novos: 2,
      nuncaAcessaram: 1,
      aulasConcluidas: 2,
      comentarios: 0,
      avaliacoes: 1,
    })
  })

  it('separa por curso e o filtro de curso recorta tudo', async () => {
    const { db, cursoA, cursoB } = await cenario()
    const periodo = periodoDoRelatorio(hoje, '2026-06-01', '2026-06-15')
    const todos = await panorama(db, { periodo })
    const a = todos.porCurso.find((c) => c.cursoId === cursoA)
    const b = todos.porCurso.find((c) => c.cursoId === cursoB)
    expect(a).toMatchObject({
      alunosAtivos: 1,
      novos: 2,
      nuncaAcessaram: 1,
      aulasConcluidas: 1,
    })
    expect(b).toMatchObject({
      alunosAtivos: 1,
      novos: 1,
      nuncaAcessaram: 0,
      aulasConcluidas: 1,
    })
    const so = await panorama(db, { periodo, cursoId: cursoB })
    expect(so.porCurso).toHaveLength(1)
    expect(so.geral).toMatchObject({ alunosAtivos: 1, novos: 1 })
  })

  it('o gancho dos comentários (#47) entra na conta; a sessão conta como ativo no geral', async () => {
    const { db } = await cenario()
    await db.insert(session).values({
      id: 's1',
      token: 't1',
      userId: 'caio',
      expiresAt: D('2026-07-01T00:00:00Z'),
      updatedAt: D('2026-06-14T10:00:00Z'),
    })
    const p = await panorama(
      db,
      { periodo: periodoDoRelatorio(hoje, '2026-06-01', '2026-06-15') },
      { contarComentarios: async () => 7 },
    )
    expect(p.geral.comentarios).toBe(7)
    expect(p.geral.alunosAtivos).toBe(3)
    expect(p.geral.nuncaAcessaram).toBe(0)
  })

  it('recusa curso que não existe', async () => {
    const { db } = await cenario()
    await expect(
      panorama(db, {
        periodo: periodoDoRelatorio(hoje),
        cursoId: 'nao-existe',
      }),
    ).rejects.toBeInstanceOf(ErroDeRelatorio)
  })
})

describe('último acesso', () => {
  it('é o mais recente entre sessão, aula aberta e aceite dos termos', async () => {
    const { db } = await cenario()
    await db.insert(session).values({
      id: 's1',
      token: 't1',
      userId: 'ana',
      expiresAt: D('2026-07-01T00:00:00Z'),
      updatedAt: D('2026-06-15T09:00:00Z'),
    })
    const acessos = await ultimosAcessos(db)
    expect(acessos.get('ana')?.toISOString()).toBe('2026-06-15T09:00:00.000Z')
    expect(acessos.get('bia')?.toISOString()).toBe('2026-06-05T12:00:00.000Z')
    expect(acessos.has('caio')).toBe(false)
  })
})

describe('progresso dos alunos', () => {
  it('mostra percentual, tempo de vídeo, último acesso e as faixas; quem sumiu vem primeiro', async () => {
    const { db, cursoA } = await cenario()
    const r = await progressoDosAlunos(db, agora, { cursoId: cursoA })
    expect(r.totalDeAulas).toBe(2)
    expect(
      r.alunos.map((a) => [a.nome, a.percentual, a.tempoDeVideo, a.pontos]),
    ).toEqual([
      ['Caio', 0, 0, null],
      ['Bia', 100, 600, null],
      ['Ana', 50, 720, null],
    ])
    expect(r.alunos[0]?.ultimoAcessoEm).toBeNull()
    expect(
      r.faixas.filter((f) => f.total > 0).map((f) => [f.faixa, f.total]),
    ).toEqual([
      ['0', 1],
      ['26-50', 1],
      ['100', 1],
    ])
  })

  it('filtra por faixa e por quem sumiu há N dias (inclui quem nunca entrou)', async () => {
    const { db, cursoA } = await cenario()
    const sumidos = await progressoDosAlunos(db, agora, {
      cursoId: cursoA,
      sumiuHaDias: 7,
    })
    expect(sumidos.alunos.map((a) => a.nome)).toEqual(['Caio', 'Bia'])
    expect(sumidos.faixas.reduce((s, f) => s + f.total, 0)).toBe(3)
    const faixa = await progressoDosAlunos(db, agora, {
      cursoId: cursoA,
      faixa: '26-50',
    })
    expect(faixa.alunos.map((a) => a.nome)).toEqual(['Ana'])
  })

  it('só entram matrículas ativas e os pontos (#54) vêm do gancho', async () => {
    const { db, cursoA } = await cenario()
    await db
      .update(matricula)
      .set({ situacao: 'inativa' })
      .where(eq(matricula.id, 'm3'))
    const r = await progressoDosAlunos(
      db,
      agora,
      { cursoId: cursoA },
      { pontosDosAlunos: async () => new Map([['ana', 125]]) },
    )
    expect(r.alunos.map((a) => [a.nome, a.pontos])).toEqual([
      ['Bia', 0],
      ['Ana', 125],
    ])
  })

  it('recusa curso que não existe', async () => {
    const { db } = await cenario()
    await expect(
      progressoDosAlunos(db, agora, { cursoId: 'nao-existe' }),
    ).rejects.toBeInstanceOf(ErroDeRelatorio)
  })
})
