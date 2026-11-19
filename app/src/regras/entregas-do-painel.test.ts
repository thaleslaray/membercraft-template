// Lista e detalhe das entregas dos exercícios vistas pela Equipe: filtros, ordem, paginação, quem
// corrigiu e o que a aluna respondeu em cada tipo de pergunta.
import { describe, expect, it } from 'vitest'
import {
  arquivoDaResposta,
  matricula,
  quiz,
  respostaAbertaDoQuiz,
  tentativaDoQuiz,
  user,
} from '#/db/schema'
import { criarAula, criarCurso, criarModulo } from '#/regras/conteudo'
import {
  detalheDaEntrega,
  formaDoArquivo,
  listarEntregas,
  montarPerguntasDaEntrega,
  opcoesDeEntregas,
  POR_PAGINA_DE_ENTREGAS,
} from '#/regras/entregas-do-painel'
import { criarTurma } from '#/regras/matricula'
import type { PerguntaCopiada } from '#/regras/quiz'
import { comoLibsql } from '#/regras/tipos'
import { criarBancoDeTeste } from '#/test/banco'

const copia: PerguntaCopiada[] = [
  {
    id: 'pm',
    tipo: 'multipla',
    enunciado: 'Quais são cores primárias?',
    imagem: null,
    alternativas: [
      { id: 'a1', texto: 'Azul', correta: true, comentario: null },
      { id: 'a2', texto: 'Verde', correta: false, comentario: null },
      { id: 'a3', texto: 'Amarelo', correta: true, comentario: null },
    ],
  },
  {
    id: 'pt',
    tipo: 'texto_livre',
    enunciado: 'Conte.',
    imagem: null,
    alternativas: [],
  },
  {
    id: 'pa',
    tipo: 'arquivo',
    enunciado: 'Envie.',
    imagem: null,
    alternativas: [],
  },
]

describe('montarPerguntasDaEntrega', () => {
  it('junta marcadas, texto e arquivos, na ordem da cópia', () => {
    const r = montarPerguntasDaEntrega(
      copia,
      { pm: ['a1', 'a2'] },
      [
        {
          id: 'r1',
          perguntaId: 'pt',
          texto: 'Aprendi.',
          situacao: 'certa',
          comentario: 'Boa',
        },
        {
          id: 'r2',
          perguntaId: 'pa',
          texto: null,
          situacao: 'pendente',
          comentario: null,
        },
      ],
      [
        {
          id: 'f1',
          perguntaId: 'pa',
          nome: 'foto.jpg',
          tipo: 'image/jpeg',
          tamanho: 10,
        },
      ],
    )
    expect(r.map((p) => p.id)).toEqual(['pm', 'pt', 'pa'])
    expect(r[0]?.escolhas).toEqual([
      { id: 'a1', texto: 'Azul', marcada: true, correta: true },
      { id: 'a2', texto: 'Verde', marcada: true, correta: false },
      { id: 'a3', texto: 'Amarelo', marcada: false, correta: true },
    ])
    expect(r[0]?.respostaId).toBeNull()
    expect(r[1]).toMatchObject({
      respostaId: 'r1',
      texto: 'Aprendi.',
      situacao: 'certa',
      comentario: 'Boa',
    })
    expect(r[2]?.arquivos).toEqual([
      { id: 'f1', nome: 'foto.jpg', tipo: 'image/jpeg', tamanho: 10 },
    ])
  })

  it('sem resposta: pergunta de escolha sem marcadas, abertas vazias', () => {
    const r = montarPerguntasDaEntrega(copia, {}, [], [])
    expect(r[0]?.escolhas.some((e) => e.marcada)).toBe(false)
    expect(r[1]).toMatchObject({ texto: null, respostaId: null })
    expect(r[2]?.arquivos).toEqual([])
  })
})

describe('formaDoArquivo', () => {
  it('imagem raster e PDF abrem na tela; SVG e o resto só baixam', () => {
    expect(formaDoArquivo('image/png')).toBe('imagem')
    expect(formaDoArquivo('IMAGE/JPEG; charset=x')).toBe('imagem')
    expect(formaDoArquivo('application/pdf')).toBe('pdf')
    expect(formaDoArquivo('image/svg+xml')).toBe('outro')
    expect(formaDoArquivo('video/mp4')).toBe('outro')
  })
})

let seq = 0
async function cenario() {
  const db = await criarBancoDeTeste()
  const c = comoLibsql(db)
  await c.insert(user).values([
    { id: 'ana', name: 'Ana Souza', email: 'ana@x.test' },
    { id: 'bia', name: 'Bia Lima', email: 'bia@x.test' },
    { id: 'eq', name: 'Equipe Helena', email: 'eq@x.test' },
  ])
  const cursoA = await criarCurso(db, { nome: 'Coloração' })
  const cursoB = await criarCurso(db, { nome: 'Corte' })
  const aulas: Record<string, string> = {}
  const quizzes: Record<string, string> = {}
  for (const [chave, cursoId] of [
    ['A', cursoA],
    ['B', cursoB],
  ] as const) {
    const m = await criarModulo(db, cursoId, { nome: 'Base' })
    aulas[chave] = await criarAula(db, m, { titulo: `Exercício ${chave}` })
    quizzes[chave] = `q${chave}`
    await c.insert(quiz).values({ id: `q${chave}`, aulaId: aulas[chave] })
  }
  const turmaA = await criarTurma(db, { cursoId: cursoA, nome: 'Turma A1' })
  await c.insert(matricula).values({
    id: 'm1',
    userId: 'ana',
    turmaId: turmaA,
    iniciaEm: new Date(0),
  })
  const tentativa = async (
    id: string,
    quizId: string,
    userId: string,
    enviadaEm: number,
    estado: 'aprovada' | 'reprovada' | 'aguardando_correcao' = 'aprovada',
  ) => {
    await c.insert(tentativaDoQuiz).values({
      id,
      quizId,
      userId,
      numero: ++seq,
      estado,
      perguntas: JSON.stringify(copia),
      respostas: JSON.stringify({ pm: ['a1', 'a3'] }),
      acertos: 2,
      total: 3,
      percentual: 66,
      minimoDeAcertos: 70,
      enviadaEm: new Date(enviadaEm),
    })
  }
  return { db, c, cursoA, cursoB, turmaA, quizzes, tentativa }
}

describe('listarEntregas', () => {
  it('vazio: nenhuma entrega, uma página', async () => {
    const { db } = await cenario()
    expect(await listarEntregas(db)).toMatchObject({
      itens: [],
      total: 0,
      totalDePaginas: 1,
      porPagina: 50,
    })
  })

  it('das mais recentes para as mais antigas, com aluna, curso e exercício', async () => {
    const x = await cenario()
    await x.tentativa('t1', x.quizzes.A as string, 'ana', 1000)
    await x.tentativa('t2', x.quizzes.B as string, 'bia', 3000)
    await x.tentativa('t3', x.quizzes.A as string, 'bia', 2000)
    const r = await listarEntregas(x.db)
    expect(r.itens.map((i) => i.id)).toEqual(['t2', 't3', 't1'])
    expect(r.itens[0]).toMatchObject({
      alunoNome: 'Bia Lima',
      alunoEmail: 'bia@x.test',
      cursoNome: 'Corte',
      aulaTitulo: 'Exercício B',
      corrigidaPor: null,
    })
  })

  it('filtra por curso, exercício, turma, aluna (nome ou e-mail) e estado, e combina', async () => {
    const x = await cenario()
    await x.tentativa('t1', x.quizzes.A as string, 'ana', 1000)
    await x.tentativa('t2', x.quizzes.B as string, 'bia', 3000, 'reprovada')
    await x.tentativa(
      't3',
      x.quizzes.A as string,
      'bia',
      2000,
      'aguardando_correcao',
    )
    const ids = async (f: Parameters<typeof listarEntregas>[1]) =>
      (await listarEntregas(x.db, f)).itens.map((i) => i.id)
    expect(await ids({ cursoId: x.cursoA })).toEqual(['t3', 't1'])
    expect(await ids({ quizId: x.quizzes.B })).toEqual(['t2'])
    expect(await ids({ turmaId: x.turmaA })).toEqual(['t1'])
    expect(await ids({ aluno: 'bia' })).toEqual(['t2', 't3'])
    expect(await ids({ aluno: '  souza ' })).toEqual(['t1'])
    expect(await ids({ aluno: 'BIA@X' })).toEqual(['t2', 't3'])
    expect(await ids({ estado: 'reprovada' })).toEqual(['t2'])
    expect(await ids({ alunoId: 'ana' })).toEqual(['t1'])
    expect(
      await ids({
        cursoId: x.cursoA,
        aluno: 'bia',
        estado: 'aguardando_correcao',
      }),
    ).toEqual(['t3'])
    expect(await ids({ aluno: 'nao-existe' })).toEqual([])
  })

  it('curinga do LIKE na busca não vale (% e _ são tirados)', async () => {
    const x = await cenario()
    await x.tentativa('t1', x.quizzes.A as string, 'ana', 1000)
    expect((await listarEntregas(x.db, { aluno: 'zzz%' })).itens).toEqual([])
    expect((await listarEntregas(x.db, { aluno: 'a_a' })).itens).toEqual([])
  })

  it('pagina de 50 em 50, com o total do filtro', async () => {
    const x = await cenario()
    for (let i = 0; i < POR_PAGINA_DE_ENTREGAS + 5; i++) {
      await x.tentativa(`p${i}`, x.quizzes.A as string, 'ana', 10_000 + i)
    }
    const p1 = await listarEntregas(x.db, {}, 1)
    const p2 = await listarEntregas(x.db, {}, 2)
    expect(p1.itens).toHaveLength(50)
    expect(p2.itens).toHaveLength(5)
    expect(p1).toMatchObject({ total: 55, totalDePaginas: 2 })
    expect(p1.itens[0]?.id).toBe('p54')
    expect(p2.itens[4]?.id).toBe('p0')
  })

  it('mostra quem corrigiu, pelo nome (ou e-mail sem nome)', async () => {
    const x = await cenario()
    await x.tentativa('t1', x.quizzes.A as string, 'ana', 1000)
    await x.c.insert(respostaAbertaDoQuiz).values({
      id: 'r1',
      tentativaId: 't1',
      perguntaId: 'pt',
      texto: 'oi',
      situacao: 'certa',
      corrigidaPorId: 'eq',
      corrigidaEm: new Date(5000),
    })
    expect((await listarEntregas(x.db)).itens[0]?.corrigidaPor).toBe(
      'Equipe Helena',
    )
  })
})

describe('opcoesDeEntregas', () => {
  it('cursos, exercícios e turmas para os filtros', async () => {
    const x = await cenario()
    const o = await opcoesDeEntregas(x.db)
    expect(o.cursos.map((c) => c.nome)).toEqual(['Coloração', 'Corte'])
    expect(o.exercicios.map((e) => e.titulo)).toEqual([
      'Exercício A',
      'Exercício B',
    ])
    expect(o.exercicios.find((e) => e.titulo === 'Exercício A')?.cursoId).toBe(
      x.cursoA,
    )
    expect(o.turmas).toEqual([
      { id: x.turmaA, nome: 'Turma A1', cursoId: x.cursoA },
    ])
  })
})

describe('detalheDaEntrega', () => {
  it('não existe: nulo', async () => {
    const { db } = await cenario()
    expect(await detalheDaEntrega(db, 'nada')).toBeNull()
  })

  it('traz as três perguntas com o que a aluna respondeu', async () => {
    const x = await cenario()
    await x.tentativa(
      't1',
      x.quizzes.A as string,
      'ana',
      1000,
      'aguardando_correcao',
    )
    await x.c.insert(respostaAbertaDoQuiz).values([
      {
        id: 'r1',
        tentativaId: 't1',
        perguntaId: 'pt',
        texto: 'Linha 1\nLinha 2',
      },
      { id: 'r2', tentativaId: 't1', perguntaId: 'pa' },
    ])
    await x.c.insert(arquivoDaResposta).values({
      id: 'f1',
      tentativaId: 't1',
      perguntaId: 'pa',
      chave: 'quiz/entregas/ana/f1/foto.png',
      nome: 'foto.png',
      tipo: 'image/png',
      tamanho: 2048,
      enviadoEm: new Date(1000),
    })
    const d = await detalheDaEntrega(x.db, 't1')
    expect(d).toMatchObject({
      id: 't1',
      alunoNome: 'Ana Souza',
      cursoNome: 'Coloração',
      estado: 'aguardando_correcao',
    })
    expect(d?.perguntas.map((p) => p.tipo)).toEqual([
      'multipla',
      'texto_livre',
      'arquivo',
    ])
    expect(
      d?.perguntas[0]?.escolhas.filter((e) => e.marcada).map((e) => e.id),
    ).toEqual(['a1', 'a3'])
    expect(d?.perguntas[1]?.texto).toBe('Linha 1\nLinha 2')
    expect(d?.perguntas[2]?.arquivos[0]).toMatchObject({
      id: 'f1',
      nome: 'foto.png',
    })
  })
})
