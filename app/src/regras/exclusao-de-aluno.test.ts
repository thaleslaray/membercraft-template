import { eq, sql } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import {
  anexoDaPublicacao,
  avisoDeVenda,
  certificado,
  curso as cursoDaTabela,
  envioDeEmail,
  lancamentoDePontos,
  matricula,
  origemDaMatricula,
  pedidoDoMec,
  registroDeAcoes,
  session,
  tentativaDoQuiz,
  user,
} from '#/db/schema'
import { criarCurso } from '#/regras/conteudo'
import { ErroDeExclusao, excluirAluno } from '#/regras/exclusao-de-aluno'
import { criarTurma, matricularManual, trocarEmail } from '#/regras/matricula'
import { criarBancoDeTeste } from '#/test/banco'

const agora = () => new Date('2026-06-01T12:00:00Z')

async function cenario() {
  const db = await criarBancoDeTeste()
  await db.insert(user).values([
    { id: 'dono', name: 'Helena', email: 'helena@x.test', perfil: 'proprietario' },
    { id: 'eq', name: 'Marina', email: 'marina@x.test', perfil: 'equipe' },
  ])
  const cursoId = await criarCurso(db, { nome: 'Coloração' })
  const turmaId = await criarTurma(db, { cursoId, nome: 'T1' })
  await matricularManual(db, agora, {
    pessoas: [{ email: 'ana@x.test' }, { email: 'bia@x.test' }],
    turmaId,
    autorId: 'dono',
  })
  const idDe = async (email: string) =>
    (await db.select().from(user).where(eq(user.email, email)))[0].id
  return { db, idDe }
}

describe('excluirAluno', () => {
  it('apaga a conta, as matrículas e o histórico dela, e só dela', async () => {
    const { db, idDe } = await cenario()
    const ana = await idDe('ana@x.test')
    await db.insert(session).values({
      id: 's1',
      token: 't1',
      userId: ana,
      expiresAt: new Date('2027-01-01'),
    })
    await db.insert(envioDeEmail).values([
      {
        id: 'e1',
        userId: ana,
        para: 'ana@x.test',
        tipo: 'curso-liberado',
        criadoEm: agora(),
      },
      {
        id: 'e2',
        userId: null,
        para: 'bia@x.test',
        tipo: 'curso-liberado',
        criadoEm: agora(),
      },
    ])
    await db.insert(avisoDeVenda).values({
      id: 'v1',
      chave: 'c1',
      tipo: 'sale',
      gatilho: 'salePaid',
      email: 'ana@x.test',
      nome: 'Ana',
      corpo: '{"client":{"email":"ana@x.test"}}',
      recebidoEm: agora(),
    })

    await excluirAluno(db, agora, { autorId: 'dono', userId: ana })

    expect(await db.select().from(user).where(eq(user.id, ana))).toHaveLength(0)
    expect(await db.select().from(session)).toHaveLength(0)
    const matriculas = await db.select().from(matricula)
    expect(matriculas).toHaveLength(1)
    expect(matriculas[0].userId).not.toBe(ana)
    expect(await db.select().from(origemDaMatricula)).toHaveLength(1)
    expect((await db.select().from(envioDeEmail)).map((e) => e.id)).toEqual([
      'e2',
    ])
    const [aviso] = await db.select().from(avisoDeVenda)
    expect(aviso.email).toBeNull()
    expect(aviso.corpo).toBe('{}')
  })

  it('apaga os pontos do aluno e só os dele', async () => {
    const { db, idDe } = await cenario()
    const ana = await idDe('ana@x.test')
    const bia = await idDe('bia@x.test')
    await db.insert(lancamentoDePontos).values([
      { id: 'l1', userId: ana, origemTipo: 'avulso', pontos: 10, motivo: 'a' },
      {
        id: 'l2',
        userId: ana,
        origemTipo: 'aula',
        origemId: 'x',
        pontos: 50,
        estornadoEm: agora(),
      },
      { id: 'l3', userId: bia, origemTipo: 'avulso', pontos: 10, motivo: 'b' },
    ])
    await excluirAluno(db, agora, { autorId: 'dono', userId: ana })
    expect(
      (await db.select().from(lancamentoDePontos)).map((l) => l.id),
    ).toEqual(['l3'])
  })

  it('apaga os certificados do aluno e só os dele', async () => {
    const { db, idDe } = await cenario()
    const ana = await idDe('ana@x.test')
    const bia = await idDe('bia@x.test')
    const [c] = await db.select().from(cursoDaTabela)
    const base = {
      cursoId: c.id,
      nome: 'Nome',
      cursoNome: 'Coloração',
      concluidoEm: agora(),
      emitidoEm: agora(),
    }
    await db.insert(certificado).values([
      { id: 'c1', userId: ana, codigo: 'AAAA-1111', ...base },
      { id: 'c2', userId: bia, codigo: 'BBBB-2222', ...base },
    ])
    await excluirAluno(db, agora, { autorId: 'dono', userId: ana })
    expect((await db.select().from(certificado)).map((l) => l.id)).toEqual([
      'c2',
    ])
  })

  it('apaga os pedidos do MEC do aluno (e o certificado a que apontam) e só os dele', async () => {
    const { db, idDe } = await cenario()
    const ana = await idDe('ana@x.test')
    const bia = await idDe('bia@x.test')
    const [c] = await db.select().from(cursoDaTabela)
    const base = {
      cursoId: c.id,
      nome: 'Nome',
      cursoNome: 'Coloração',
      concluidoEm: agora(),
      emitidoEm: agora(),
    }
    await db.insert(certificado).values([
      { id: 'c1', userId: ana, codigo: 'AAAA-1111', ...base },
      { id: 'c2', userId: bia, codigo: 'BBBB-2222', ...base },
    ])
    await db.insert(pedidoDoMec).values(
      [
        ['p1', 'c1', ana],
        ['p2', 'c2', bia],
      ].map(([id, certificadoId, userId]) => ({
        id,
        certificadoId,
        userId,
        cursoId: c.id,
        criadoEm: agora(),
        naFilaDesde: agora(),
      })),
    )
    await excluirAluno(db, agora, { autorId: 'dono', userId: ana })
    expect((await db.select().from(pedidoDoMec)).map((l) => l.id)).toEqual([
      'p2',
    ])
  })

  it('registra quem excluiu, sem guardar o e-mail do aluno', async () => {
    const { db, idDe } = await cenario()
    const ana = await idDe('ana@x.test')
    await excluirAluno(db, agora, { autorId: 'dono', userId: ana })
    const linhas = await db
      .select()
      .from(registroDeAcoes)
      .where(eq(registroDeAcoes.acao, 'aluno-excluido'))
    expect(linhas).toHaveLength(1)
    expect(linhas[0].autorId).toBe('dono')
    expect(linhas[0].detalhe).not.toContain('ana@x.test')
  })

  it('limpa o e-mail do aluno dos registros antigos', async () => {
    const { db, idDe } = await cenario()
    const ana = await idDe('ana@x.test')
    await trocarEmail(db, agora, {
      userId: ana,
      novoEmail: 'ana2@x.test',
      autorId: 'eq',
    })
    await excluirAluno(db, agora, { autorId: 'dono', userId: ana })
    const todos = JSON.stringify(await db.select().from(registroDeAcoes))
    expect(todos).not.toContain('ana@x.test')
    expect(todos).not.toContain('ana2@x.test')
  })

  it('não exclui a equipe nem quem não existe', async () => {
    const { db } = await cenario()
    await expect(
      excluirAluno(db, agora, { autorId: 'dono', userId: 'eq' }),
    ).rejects.toThrow('Remova-a da equipe')
    await expect(
      excluirAluno(db, agora, { autorId: 'dono', userId: 'nada' }),
    ).rejects.toThrow(ErroDeExclusao)
  })

  it('devolve as chaves do R2 do que era dele (foto, entregas de quiz, PDFs e anexos) e apaga as tentativas', async () => {
    const { db, idDe } = await cenario()
    const ana = await idDe('ana@x.test')
    const bia = await idDe('bia@x.test')
    const [c] = await db.select().from(cursoDaTabela)
    const rodar = (texto: string) => db.run(sql.raw(texto))
    await rodar(
      `update user set image = '/api/fotos/arquivo/ana-1.png' where id = '${ana}'`,
    )
    await rodar(
      `insert into modulo (id, curso_id, nome, ordem) values ('m', '${c.id}', 'M', 1)`,
    )
    await rodar(
      `insert into aula (id, modulo_id, titulo, ordem) values ('a', 'm', 'A', 1)`,
    )
    await rodar(`insert into quiz (id, aula_id) values ('q', 'a')`)
    for (const [t, dono, chave] of [
      ['t1', ana, 'entregas/ana.zip'],
      ['t2', bia, 'entregas/bia.zip'],
    ]) {
      await rodar(
        `insert into tentativa_do_quiz (id, quiz_id, user_id, numero, estado, perguntas, respostas, acertos, total, percentual, minimo_de_acertos, enviada_em) values ('${t}', 'q', '${dono}', 1, 'aprovada', '[]', '{}', 1, 1, 100, 70, 0)`,
      )
      await rodar(
        `insert into arquivo_da_resposta (id, tentativa_id, pergunta_id, chave, nome, tipo, tamanho, enviado_em) values ('f${t}', '${t}', 'p', '${chave}', 'x', 'x', 1, 0)`,
      )
    }
    await rodar(
      `insert into liberacao_de_tentativa (id, quiz_id, user_id, liberada_por_id, liberada_em) values ('l', 'q', '${ana}', 'eq', 0)`,
    )
    await db.insert(certificado).values({
      id: 'c1',
      userId: ana,
      codigo: 'AAAA-1111',
      cursoId: c.id,
      nome: 'Ana',
      cursoNome: 'Coloração',
      concluidoEm: agora(),
      emitidoEm: agora(),
      pdfChave: 'pdfs/ana.pdf',
    })
    await rodar(
      `insert into comunidade (id, nome, icone, cor) values ('com', 'G', 'x', '#000')`,
    )
    await rodar(
      `insert into publicacao (id, comunidade_id, autor_id, titulo, texto_html, chave_de_envio, ultima_atividade_em) values ('p1', 'com', '${ana}', 'T', '<img src="/api/comunidade/imagens/i1/foto.png">', 'k', 0)`,
    )
    await db.insert(anexoDaPublicacao).values({
      id: 'an1',
      publicacaoId: 'p1',
      chave: 'comunidade/anexos/ana/1/a.pdf',
      nome: 'a.pdf',
      tipo: 'application/pdf',
      tamanho: 1,
    })

    const chaves = await excluirAluno(db, agora, {
      autorId: 'dono',
      userId: ana,
    })

    expect(chaves.sort()).toEqual(
      [
        'fotos/ana-1.png',
        'entregas/ana.zip',
        'pdfs/ana.pdf',
        'comunidade/anexos/ana/1/a.pdf',
        'comunidade/imagens/i1/foto.png',
      ].sort(),
    )
    expect((await db.select().from(tentativaDoQuiz)).map((t) => t.id)).toEqual([
      't2',
    ])
  })
})
