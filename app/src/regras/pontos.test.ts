import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import {
  lancamentoDePontos,
  matricula,
  modulo as moduloDaTabela,
  registroDeAcoes,
  turma as turmaDaTabela,
  user,
} from '#/db/schema'
import { opcoesDeAcesso } from '#/lib/liberacao'
import { situacaoDoConteudo } from '#/regras/acesso'
import { avaliarAula } from '#/regras/avaliacoes'
import { criarComentario, excluirComentario } from '#/regras/comentarios'
import { criarAula, criarCurso, criarModulo } from '#/regras/conteudo'
import { criarTurma } from '#/regras/matricula'
import {
  cursosDoRanking,
  darPontosAvulsos,
  ErroDePontos,
  estornarMelhorResposta,
  extratoDoAluno,
  ganchosDaAvaliacao,
  ganchosDeProgresso,
  ganchosDoQuizComPontos,
  ganchosDosComentarios,
  pontosDosAlunos,
  pontuarMelhorResposta,
  ranking,
  rankingCompleto,
  saldoDoCurso,
  saldoGeral,
  textoDoAvisoDePontos,
  ultimosLancamentos,
} from '#/regras/pontos'
import { concluirAula, desmarcarAula } from '#/regras/progresso'
import { definirRegra } from '#/regras/regras-de-liberacao'
import { criarBancoDeTeste } from '#/test/banco'

const agora = () => new Date('2026-06-01T12:00:00Z')

// Ana e Bia no curso de Coloração; Caio só no de Corte; Dora com matrícula expirada; Marina da equipe.
async function cenario() {
  const db = await criarBancoDeTeste()
  await db.insert(user).values([
    { id: 'ana', name: 'Ana', email: 'ana@x.test' },
    { id: 'bia', name: 'Bia', email: 'bia@x.test' },
    { id: 'caio', name: 'Caio', email: 'caio@x.test' },
    { id: 'dora', name: 'Dora', email: 'dora@x.test' },
    { id: 'eq', name: 'Marina', email: 'eq@x.test', perfil: 'equipe' },
  ])
  const coloracao = await criarCurso(db, { nome: 'Coloração' })
  const corte = await criarCurso(db, { nome: 'Corte' })
  const t1 = await criarTurma(db, { cursoId: coloracao, nome: 'T1' })
  const t2 = await criarTurma(db, { cursoId: corte, nome: 'T2' })
  const moduloId = await criarModulo(db, coloracao, { nome: 'Base' })
  const aula1 = await criarAula(db, moduloId, { titulo: 'Raiz' })
  const aula2 = await criarAula(db, moduloId, { titulo: 'Mechas' })
  const moduloCorte = await criarModulo(db, corte, { nome: 'Tesoura' })
  const aulaCorte = await criarAula(db, moduloCorte, { titulo: 'Franja' })
  for (const [userId, turmaId, expiraEm] of [
    ['ana', t1, null],
    ['bia', t1, null],
    ['caio', t2, null],
    ['dora', t1, new Date('2026-05-01T00:00:00Z')],
    ['eq', t1, null],
  ] as const) {
    await db.insert(matricula).values({
      id: `m-${userId}`,
      userId,
      turmaId,
      iniciaEm: new Date('2026-01-01T00:00:00Z'),
      expiraEm,
    })
  }
  return { db, coloracao, corte, aula1, aula2, aulaCorte }
}

describe('pontos por origem', () => {
  it('concluir aula dá 50 pontos no curso; concluir de novo não pontua', async () => {
    const { db, coloracao, aula1 } = await cenario()
    await concluirAula(db, agora, 'ana', aula1, ganchosDeProgresso)
    await concluirAula(db, agora, 'ana', aula1, ganchosDeProgresso)
    expect(await saldoDoCurso(db, 'ana', coloracao)).toBe(50)
    expect(await db.select().from(lancamentoDePontos)).toHaveLength(1)
  })

  it('desmarcar estorna e concluir de novo volta a valer, sem acumular', async () => {
    const { db, coloracao, aula1 } = await cenario()
    await concluirAula(db, agora, 'ana', aula1, ganchosDeProgresso)
    await desmarcarAula(db, agora, 'ana', aula1, ganchosDeProgresso)
    expect(await saldoGeral(db, 'ana')).toBe(0)
    await concluirAula(db, agora, 'ana', aula1, ganchosDeProgresso)
    await desmarcarAula(db, agora, 'ana', aula1, ganchosDeProgresso)
    await concluirAula(db, agora, 'ana', aula1, ganchosDeProgresso)
    expect(await saldoDoCurso(db, 'ana', coloracao)).toBe(50)
    expect(await db.select().from(lancamentoDePontos)).toHaveLength(1)
  })

  it('comentário dá 25 uma vez por aula; excluir o último estorna', async () => {
    const { db, coloracao, aula1, aula2 } = await cenario()
    const ator = { id: 'ana', perfil: 'aluno' as const }
    const comentar = (aulaId: string, texto: string, chave: string) =>
      criarComentario(
        db,
        agora,
        ator,
        { aulaId, texto, chaveDeEnvio: chave },
        ganchosDosComentarios,
      )
    const um = await comentar(aula1, 'Um', 'k1')
    const dois = await comentar(aula1, 'Dois', 'k2')
    await comentar(aula2, 'Outra aula', 'k3')
    expect(await saldoDoCurso(db, 'ana', coloracao)).toBe(50)

    // Ainda sobra um comentário vivo na aula 1: os pontos ficam.
    await excluirComentario(db, agora, ator, um.id, ganchosDosComentarios)
    expect(await saldoGeral(db, 'ana')).toBe(50)
    await excluirComentario(db, agora, ator, dois.id, ganchosDosComentarios)
    expect(await saldoGeral(db, 'ana')).toBe(25)

    // Comentar de novo na aula 1 pontua de novo (a origem tinha sumido).
    await comentar(aula1, 'Voltei', 'k4')
    expect(await saldoGeral(db, 'ana')).toBe(50)
  })

  it('a equipe excluir o comentário tira os pontos do autor', async () => {
    const { db, aula1 } = await cenario()
    const ana = { id: 'ana', perfil: 'aluno' as const }
    const { id } = await criarComentario(
      db,
      agora,
      ana,
      { aulaId: aula1, texto: 'Oi', chaveDeEnvio: 'k1' },
      ganchosDosComentarios,
    )
    expect(await saldoGeral(db, 'ana')).toBe(25)
    await excluirComentario(
      db,
      agora,
      { id: 'eq', perfil: 'equipe' },
      id,
      ganchosDosComentarios,
    )
    expect(await saldoGeral(db, 'ana')).toBe(0)
  })

  it('a primeira avaliação dá 25 e mudar a nota não pontua de novo', async () => {
    const { db, aula1 } = await cenario()
    await avaliarAula(db, agora, 'ana', aula1, { nota: 3 }, ganchosDaAvaliacao)
    await avaliarAula(db, agora, 'ana', aula1, { nota: 5 }, ganchosDaAvaliacao)
    expect(await saldoGeral(db, 'ana')).toBe(25)
  })

  it('o quiz dá o valor dele na primeira aprovação, uma vez só', async () => {
    const { db, coloracao, aula1 } = await cenario()
    const aprovar = (pontos: number) =>
      ganchosDoQuizComPontos.aoAprovarPelaPrimeiraVez?.({
        db,
        agora,
        userId: 'ana',
        aulaId: aula1,
        quizId: 'q1',
        pontos,
      })
    await aprovar(100)
    await aprovar(100)
    await aprovar(300)
    expect(await saldoDoCurso(db, 'ana', coloracao)).toBe(100)
  })

  it('a melhor resposta dá 50 gerais, sem repetir, e estorna ao desfazer', async () => {
    const { db, coloracao } = await cenario()
    await pontuarMelhorResposta(db, agora, {
      userId: 'ana',
      comentarioId: 'c1',
    })
    await pontuarMelhorResposta(db, agora, {
      userId: 'ana',
      comentarioId: 'c1',
    })
    expect(await saldoGeral(db, 'ana')).toBe(50)
    expect(await saldoDoCurso(db, 'ana', coloracao)).toBe(0)
    expect(
      await estornarMelhorResposta(db, agora, {
        userId: 'ana',
        comentarioId: 'c1',
      }),
    ).toBe(true)
    expect(await saldoGeral(db, 'ana')).toBe(0)
    expect(
      await estornarMelhorResposta(db, agora, {
        userId: 'ana',
        comentarioId: 'c1',
      }),
    ).toBe(false)
  })
})

describe('pontos avulsos', () => {
  it('dá e tira pontos, de um curso ou gerais, e registra a ação', async () => {
    const { db, coloracao } = await cenario()
    const dar = (pontos: number, cursoId: string | null, motivo: string) =>
      darPontosAvulsos(db, agora, {
        autorId: 'eq',
        alunoId: 'ana',
        cursoId,
        pontos,
        motivo,
      })
    const dado = await dar(80, coloracao, 'Ótimo exercício')
    await dar(30, null, 'Presença no encontro')
    await dar(-20, coloracao, 'Correção')
    expect(await saldoDoCurso(db, 'ana', coloracao)).toBe(60)
    expect(await saldoGeral(db, 'ana')).toBe(90)
    expect(dado.texto).toBe(
      'Você ganhou 80 pontos no curso Coloração: Ótimo exercício',
    )
    const registros = await db.select().from(registroDeAcoes)
    expect(registros.map((r) => r.acao)).toEqual([
      'pontos-avulsos',
      'pontos-avulsos',
      'pontos-avulsos',
    ])
    expect(JSON.parse(registros[0].detalhe)).toMatchObject({
      alunoId: 'ana',
      pontos: 80,
      motivo: 'Ótimo exercício',
    })
  })

  it('exige motivo, quantidade válida, aluno e curso existentes', async () => {
    const { db } = await cenario()
    const base = {
      autorId: 'eq',
      alunoId: 'ana',
      cursoId: null,
      pontos: 10,
      motivo: 'x',
    }
    await expect(
      darPontosAvulsos(db, agora, { ...base, motivo: '   ' }),
    ).rejects.toThrow(ErroDePontos)
    await expect(
      darPontosAvulsos(db, agora, { ...base, pontos: 0 }),
    ).rejects.toThrow(ErroDePontos)
    await expect(
      darPontosAvulsos(db, agora, { ...base, pontos: 1.5 }),
    ).rejects.toThrow(ErroDePontos)
    await expect(
      darPontosAvulsos(db, agora, { ...base, alunoId: 'eq' }),
    ).rejects.toThrow('Aluno não encontrado')
    await expect(
      darPontosAvulsos(db, agora, { ...base, alunoId: 'nao-existe' }),
    ).rejects.toThrow('Aluno não encontrado')
    await expect(
      darPontosAvulsos(db, agora, { ...base, cursoId: 'nao-existe' }),
    ).rejects.toThrow('Curso não encontrado')
    expect(await db.select().from(lancamentoDePontos)).toHaveLength(0)
    expect(await db.select().from(registroDeAcoes)).toHaveLength(0)
  })

  it('o texto do sininho diz ganhou ou perdeu', () => {
    expect(textoDoAvisoDePontos(1, 'Bom', null)).toBe(
      'Você ganhou 1 ponto: Bom',
    )
    expect(textoDoAvisoDePontos(-25, 'Erro', 'Corte')).toBe(
      'Você perdeu 25 pontos no curso Corte: Erro',
    )
  })
})

describe('saldos', () => {
  it('separa o saldo de cada curso do geral e ignora o estornado', async () => {
    const { db, coloracao, corte, aula1, aulaCorte } = await cenario()
    await concluirAula(db, agora, 'ana', aula1, ganchosDeProgresso)
    await concluirAula(db, agora, 'ana', aulaCorte, ganchosDeProgresso)
    await pontuarMelhorResposta(db, agora, {
      userId: 'ana',
      comentarioId: 'c1',
    })
    expect(await saldoDoCurso(db, 'ana', coloracao)).toBe(50)
    expect(await saldoDoCurso(db, 'ana', corte)).toBe(50)
    expect(await saldoGeral(db, 'ana')).toBe(150)
    await desmarcarAula(db, agora, 'ana', aulaCorte, ganchosDeProgresso)
    expect(await saldoDoCurso(db, 'ana', corte)).toBe(0)
    expect(await saldoGeral(db, 'ana')).toBe(100)
  })

  it('pontosDosAlunos devolve zero para quem não pontuou', async () => {
    const { db, coloracao, aula1 } = await cenario()
    await concluirAula(db, agora, 'ana', aula1, ganchosDeProgresso)
    const geral = await pontosDosAlunos(db, ['ana', 'bia'])
    expect([...geral]).toEqual([
      ['ana', 50],
      ['bia', 0],
    ])
    const doCurso = await pontosDosAlunos(db, ['ana', 'bia'], coloracao)
    expect(doCurso.get('ana')).toBe(50)
    expect((await pontosDosAlunos(db, [])).size).toBe(0)
  })
})

describe('extrato', () => {
  it('lista os lançamentos vigentes com origem, curso, pontos e o total', async () => {
    const { db, aula1 } = await cenario()
    await concluirAula(db, agora, 'ana', aula1, ganchosDeProgresso)
    await avaliarAula(db, agora, 'ana', aula1, { nota: 5 }, ganchosDaAvaliacao)
    await darPontosAvulsos(db, agora, {
      autorId: 'eq',
      alunoId: 'ana',
      cursoId: null,
      pontos: 10,
      motivo: 'Brinde',
    })
    await desmarcarAula(db, agora, 'ana', aula1, ganchosDeProgresso)
    const extrato = await extratoDoAluno(db, 'ana')
    expect(extrato.total).toBe(35)
    expect(extrato).toMatchObject({
      pagina: 1,
      porPagina: 20,
      totalDePaginas: 1,
    })
    expect(
      extrato.linhas.map((l) => [l.descricao, l.cursoNome, l.pontos]).sort(),
    ).toEqual(
      [
        ['Avaliação da aula: Raiz', 'Coloração', 25],
        ['Brinde', null, 10],
      ].sort(),
    )
  })
})

describe('extrato paginado', () => {
  it('traz 20 lançamentos por página; o total de pontos é o de tudo, não o da página', async () => {
    const { db } = await cenario()
    for (let i = 0; i < 25; i++) {
      await darPontosAvulsos(db, () => new Date(Date.UTC(2026, 5, 1, 12, i)), {
        autorId: 'eq',
        alunoId: 'ana',
        cursoId: null,
        pontos: 2,
        motivo: `Brinde ${i}`,
      })
    }
    const primeira = await extratoDoAluno(db, 'ana')
    expect(primeira.linhas).toHaveLength(20)
    expect(primeira).toMatchObject({
      total: 50,
      totalDeLancamentos: 25,
      totalDePaginas: 2,
    })
    expect(primeira.linhas[0].descricao).toBe('Brinde 24')
    const segunda = await extratoDoAluno(db, 'ana', 2)
    expect(segunda.linhas.map((l) => l.descricao)).toEqual([
      'Brinde 4',
      'Brinde 3',
      'Brinde 2',
      'Brinde 1',
      'Brinde 0',
    ])
  })
})

describe('últimos lançamentos', () => {
  it('traz só os 3 mais recentes, do mais novo ao mais antigo, sem os estornados', async () => {
    const { db } = await cenario()
    for (let i = 0; i < 5; i++) {
      await darPontosAvulsos(db, () => new Date(Date.UTC(2026, 5, 1, 12, i)), {
        autorId: 'eq',
        alunoId: 'ana',
        cursoId: null,
        pontos: i + 1,
        motivo: `Brinde ${i}`,
      })
    }
    const ultimos = await ultimosLancamentos(db, 'ana')
    expect(ultimos.map((l) => [l.descricao, l.pontos])).toEqual([
      ['Brinde 4', 5],
      ['Brinde 3', 4],
      ['Brinde 2', 3],
    ])
  })

  it('quem não tem pontos recebe lista vazia', async () => {
    const { db } = await cenario()
    expect(await ultimosLancamentos(db, 'caio')).toEqual([])
  })
})

describe('ranking', () => {
  it('só matrícula ativa, sem a equipe, com empate dividindo a posição', async () => {
    const { db, aula1, aula2 } = await cenario()
    for (const u of ['ana', 'bia', 'dora', 'eq']) {
      await concluirAula(db, agora, u, aula1, ganchosDeProgresso)
    }
    await concluirAula(db, agora, 'ana', aula2, ganchosDeProgresso)
    const r = await ranking(db, agora, { userId: 'bia' })
    expect(r.primeiros.map((p) => [p.posicao, p.nome, p.pontos])).toEqual([
      [1, 'Ana', 100],
      [2, 'Bia', 50],
    ])
    expect(r.eu).toEqual({ posicao: 2, pontos: 50 })
    // Expirada e equipe não entram, nem têm posição.
    expect((await ranking(db, agora, { userId: 'dora' })).eu).toBeNull()
    expect((await ranking(db, agora, { userId: 'eq' })).eu).toBeNull()

    await pontuarMelhorResposta(db, agora, { userId: 'bia', comentarioId: 'c' })
    const empate = await ranking(db, agora, { userId: 'bia' })
    expect(empate.primeiros.map((p) => p.posicao)).toEqual([1, 1])
  })

  it('nenhuma posição traz e-mail e cada uma traz foto e bio (ou nulo)', async () => {
    const { db, coloracao, aula1 } = await cenario()
    await db
      .update(user)
      .set({ image: '/api/imagens/avatar-ana', bio: 'Colorista de Recife' })
      .where(eq(user.id, 'ana'))
    for (const u of ['ana', 'bia', 'eq']) {
      await concluirAula(db, agora, u, aula1, ganchosDeProgresso)
    }
    for (const cursoId of [undefined, coloracao]) {
      const r = await ranking(db, agora, { cursoId, userId: 'bia' })
      expect(r.primeiros.map((p) => p.nome)).toEqual(['Ana', 'Bia'])
      expect(JSON.stringify(r)).not.toContain('@x.test')
      for (const p of r.primeiros) expect(p).not.toHaveProperty('email')
      expect(r.primeiros[0]).toMatchObject({
        imagem: '/api/imagens/avatar-ana',
        bio: 'Colorista de Recife',
      })
      expect(r.primeiros[1]).toMatchObject({ imagem: null, bio: null })
    }
  })

  it('mostra os 10 primeiros e a posição de quem está fora deles', async () => {
    const { db, coloracao } = await cenario()
    const t = await criarTurma(db, { cursoId: coloracao, nome: 'Grande' })
    for (let i = 1; i <= 12; i++) {
      const id = `u${i}`
      await db.insert(user).values({
        id,
        name: `Aluno ${String(i).padStart(2, '0')}`,
        email: `${id}@x.test`,
      })
      await db.insert(matricula).values({
        id: `m-${id}`,
        userId: id,
        turmaId: t,
        iniciaEm: new Date('2026-01-01T00:00:00Z'),
      })
      await darPontosAvulsos(db, agora, {
        autorId: 'eq',
        alunoId: id,
        cursoId: coloracao,
        pontos: 1000 - i * 10,
        motivo: 'Teste',
      })
    }
    const r = await ranking(db, agora, { cursoId: coloracao, userId: 'u12' })
    expect(r.primeiros).toHaveLength(10)
    expect(r.primeiros[0].nome).toBe('Aluno 01')
    expect(r.eu).toEqual({ posicao: 12, pontos: 880 })
    expect(await rankingCompleto(db, agora, coloracao)).toHaveLength(12)
  })

  it('o ranking do curso só conta os pontos e os alunos daquele curso', async () => {
    const { db, coloracao, corte, aula1, aulaCorte } = await cenario()
    await concluirAula(db, agora, 'ana', aula1, ganchosDeProgresso)
    await concluirAula(db, agora, 'caio', aulaCorte, ganchosDeProgresso)
    await pontuarMelhorResposta(db, agora, {
      userId: 'caio',
      comentarioId: 'c',
    })
    const doCurso = await ranking(db, agora, { cursoId: coloracao })
    expect(doCurso.primeiros.map((p) => p.nome)).toEqual(['Ana'])
    const doCorte = await ranking(db, agora, { cursoId: corte })
    expect(doCorte.primeiros.map((p) => [p.nome, p.pontos])).toEqual([
      ['Caio', 50],
    ])
    const geral = await ranking(db, agora)
    expect(geral.primeiros.map((p) => [p.nome, p.pontos])).toEqual([
      ['Caio', 100],
      ['Ana', 50],
    ])
  })

  it('lista só os cursos com matrícula ativa do aluno', async () => {
    const { db } = await cenario()
    expect(
      (await cursosDoRanking(db, agora, 'ana')).map((c) => c.nome),
    ).toEqual(['Coloração'])
    expect(await cursosDoRanking(db, agora, 'dora')).toEqual([])
  })

  it('o lançamento fica no banco depois de estornado', async () => {
    const { db, aula1 } = await cenario()
    await concluirAula(db, agora, 'ana', aula1, ganchosDeProgresso)
    await desmarcarAula(db, agora, 'ana', aula1, ganchosDeProgresso)
    const [linha] = await db
      .select()
      .from(lancamentoDePontos)
      .where(eq(lancamentoDePontos.userId, 'ana'))
    expect(linha.estornadoEm).toEqual(agora())
  })
})

describe('pontuação mínima ligada aos pontos do curso', () => {
  it('a aula com regra de pontos abre quando o saldo do curso chega lá', async () => {
    const { db, coloracao, corte, aula1, aula2, aulaCorte } = await cenario()
    const [turma] = await db.select().from(turmaDaTabela)
    const [mod] = await db
      .select()
      .from(moduloDaTabela)
      .where(eq(moduloDaTabela.cursoId, coloracao))
    await definirRegra(db, {
      turmaId: turma.id,
      moduloId: mod.id,
      tipo: 'pontuacao_minima',
      pontos: 100,
    })
    const ana = { id: 'ana', perfil: 'aluno' as const }
    const situacao = () =>
      situacaoDoConteudo(
        db,
        agora,
        ana,
        { tipo: 'aula', id: aula2 },
        opcoesDeAcesso(db, ana),
      )
    expect((await situacao()).tipo).toBe('cadeado')
    await concluirAula(db, agora, 'ana', aula1, ganchosDeProgresso)
    expect((await situacao()).tipo).toBe('cadeado')
    // Pontos de outro curso e gerais não contam.
    await concluirAula(db, agora, 'ana', aulaCorte, ganchosDeProgresso)
    await pontuarMelhorResposta(db, agora, { userId: 'ana', comentarioId: 'c' })
    expect(await saldoDoCurso(db, 'ana', corte)).toBe(50)
    expect((await situacao()).tipo).toBe('cadeado')
    await darPontosAvulsos(db, agora, {
      autorId: 'eq',
      alunoId: 'ana',
      cursoId: coloracao,
      pontos: 50,
      motivo: 'Bônus',
    })
    expect((await situacao()).tipo).toBe('liberado')
  })
})
