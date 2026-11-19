import { eq } from 'drizzle-orm'
import { describe, expect, it, vi } from 'vitest'
import {
  ligacaoDeVenda,
  matricula,
  origemDaMatricula,
  registroDeAcoes,
  session,
  user,
} from '#/db/schema'
import { criarCurso } from '#/regras/conteudo'
import {
  aplicarEstorno,
  aplicarVendaPaga,
  buscarAlunos,
  criarTurma,
  cursosDoAluno,
  ErroDeMatricula,
  editarTurma,
  encerrar,
  excluirTurma,
  expirarMatriculas,
  interpretarLote,
  listarTurmas,
  matricularManual,
  matriculaVigenteSql,
  perfilDoAluno,
  prorrogar,
  reativar,
  resumoDasMatriculas,
  situacaoDaMatricula,
  trocarEmail,
} from '#/regras/matricula'
import { criarBancoDeTeste } from '#/test/banco'

const T0 = new Date('2026-06-01T12:00:00Z')
let relogio = T0
const agora = () => relogio
const em = (dias: number, de = T0) => new Date(de.getTime() + dias * 86_400_000)

async function cenario(prazoEmDias?: number) {
  relogio = T0
  const db = await criarBancoDeTeste()
  await db.insert(user).values({
    id: 'eq',
    name: 'Marina',
    email: 'marina@x.test',
    perfil: 'equipe',
  })
  const cursoId = await criarCurso(db, { nome: 'Coloração' })
  const turmaId = await criarTurma(db, {
    cursoId,
    nome: 'Turma 1',
    prazoEmDias,
  })
  const matricular = (emails: string[], extra = {}) =>
    matricularManual(db, agora, {
      pessoas: emails.map((email) => ({ email })),
      turmaId,
      autorId: 'eq',
      ...extra,
    })
  const idDe = async (email: string) => {
    const [conta] = await db.select().from(user).where(eq(user.email, email))
    return conta.id
  }
  const matriculaDe = async (email: string) => {
    const [m] = await db
      .select()
      .from(matricula)
      .where(eq(matricula.userId, await idDe(email)))
    return m
  }
  return { db, cursoId, turmaId, matricular, idDe, matriculaDe }
}

describe('turmas', () => {
  it('cria turma com prazo opcional e valida o prazo', async () => {
    const { db, cursoId } = await cenario()
    await criarTurma(db, { cursoId, nome: 'Vitalícia' })
    await criarTurma(db, { cursoId, nome: 'Anual', prazoEmDias: 365 })
    const turmas = await listarTurmas(db)
    expect(turmas.map((t) => [t.nome, t.prazoEmDias, t.cursoNome])).toEqual([
      ['Turma 1', null, 'Coloração'],
      ['Vitalícia', null, 'Coloração'],
      ['Anual', 365, 'Coloração'],
    ])
    for (const prazoEmDias of [0, -1, 1.5]) {
      await expect(
        criarTurma(db, { cursoId, nome: 'X', prazoEmDias }),
      ).rejects.toThrow(ErroDeMatricula)
    }
    await expect(criarTurma(db, { cursoId, nome: '  ' })).rejects.toThrow(
      ErroDeMatricula,
    )
    await expect(
      criarTurma(db, { cursoId: 'não existe', nome: 'X' }),
    ).rejects.toThrow('Curso não encontrado.')
  })

  it('editar o prazo da turma não mexe nas matrículas que já existem', async () => {
    const { db, turmaId, matricular, matriculaDe } = await cenario(30)
    await matricular(['ana@x.test'])
    await editarTurma(db, turmaId, { nome: 'Turma 1', prazoEmDias: 90 })
    expect((await matriculaDe('ana@x.test')).expiraEm).toEqual(em(30))
  })

  it('edita nome e prazo (vazio vira vitalício) com a mesma validação de criar', async () => {
    const { db, turmaId } = await cenario(30)
    await editarTurma(db, turmaId, { nome: '  Turma nova ', prazoEmDias: null })
    const [t] = (await listarTurmas(db)).filter((x) => x.id === turmaId)
    expect(t).toMatchObject({ nome: 'Turma nova', prazoEmDias: null })
    await expect(
      editarTurma(db, turmaId, { nome: '  ', prazoEmDias: 5 }),
    ).rejects.toThrow('Informe o nome da turma.')
    await expect(
      editarTurma(db, turmaId, { nome: 'X', prazoEmDias: 0 }),
    ).rejects.toThrow('O prazo de acesso é um número de dias')
    await expect(
      editarTurma(db, turmaId, { nome: 'X', prazoEmDias: 1.5 }),
    ).rejects.toThrow(ErroDeMatricula)
    await expect(editarTurma(db, 'não existe', { nome: 'X' })).rejects.toThrow(
      'Turma não encontrada.',
    )
  })
})

describe('situação da matrícula', () => {
  it('ativa vencida vale como expirada; inativa continua inativa', () => {
    const m = { situacao: 'ativa' as const, expiraEm: em(1) }
    expect(situacaoDaMatricula(m, em(0))).toBe('ativa')
    expect(situacaoDaMatricula(m, em(1))).toBe('expirada')
    expect(situacaoDaMatricula({ ...m, expiraEm: null }, em(9999))).toBe(
      'ativa',
    )
    expect(situacaoDaMatricula({ ...m, situacao: 'inativa' }, em(9))).toBe(
      'inativa',
    )
  })
})

describe('predicado SQL da matrícula vigente', () => {
  it('concorda com situacaoDaMatricula numa tabela de casos', async () => {
    relogio = T0
    const db = await criarBancoDeTeste()
    const casos = [
      { situacao: 'ativa', expiraEm: null },
      { situacao: 'ativa', expiraEm: em(1) },
      { situacao: 'ativa', expiraEm: em(0) },
      { situacao: 'ativa', expiraEm: em(-1) },
      { situacao: 'expirada', expiraEm: em(1) },
      { situacao: 'expirada', expiraEm: null },
      { situacao: 'inativa', expiraEm: null },
      { situacao: 'inativa', expiraEm: em(1) },
    ] as const
    const cursoId = await criarCurso(db, { nome: 'Coloração' })
    const turmaId = await criarTurma(db, { cursoId, nome: 'Turma 1' })
    for (const [i, c] of casos.entries()) {
      await db.insert(user).values({
        id: `u${i}`,
        name: `Aluno ${i}`,
        email: `u${i}@x.test`,
      })
      await db.insert(matricula).values({
        id: `m${i}`,
        userId: `u${i}`,
        turmaId,
        situacao: c.situacao,
        iniciaEm: em(-10),
        expiraEm: c.expiraEm,
      })
    }
    const vigentes = await db
      .select({ id: matricula.id })
      .from(matricula)
      .where(matriculaVigenteSql(T0))
    const esperadas = casos
      .map((c, i) => [c, `m${i}`] as const)
      .filter(([c]) => situacaoDaMatricula(c, T0) === 'ativa')
      .map(([, id]) => id)
    expect(vigentes.map((v) => v.id).sort()).toEqual(esperadas.sort())
    expect(esperadas).toEqual(['m0', 'm1'])
  })
})

describe('interpretar o lote de e-mails', () => {
  it('aceita e-mail, e-mail com nome e Nome <e-mail>', () => {
    const texto = [
      'ana@x.test',
      'bia@x.test, Bia Souza',
      'Caio Lima <caio@x.test>',
      'dani@x.test;Dani',
      '',
      'isto não é e-mail',
    ].join('\n')
    expect(interpretarLote(texto)).toEqual([
      { email: 'ana@x.test' },
      { email: 'bia@x.test', nome: 'Bia Souza' },
      { email: 'caio@x.test', nome: 'Caio Lima' },
      { email: 'dani@x.test', nome: 'Dani' },
      { email: 'isto não é e-mail' },
    ])
  })
})

describe('matrícula manual', () => {
  it('cria a conta só com o e-mail, matricula e sustenta com uma origem manual', async () => {
    const { db, matricular, matriculaDe } = await cenario()
    const resumo = await matricular(['Ana@X.test'], {
      observacao: 'Veio da Memberkit',
    })
    expect(resumo).toEqual({
      criados: ['ana@x.test'],
      contasNovas: ['ana@x.test'],
      jaMatriculados: [],
      reativados: [],
      invalidos: [],
    })
    const [conta] = await db.select().from(user)
    expect(conta).toBeDefined()
    const m = await matriculaDe('ana@x.test')
    expect(m.situacao).toBe('ativa')
    expect(m.expiraEm).toBeNull()
    expect(m.iniciaEm).toEqual(T0)
    const origens = await db.select().from(origemDaMatricula)
    expect(origens).toHaveLength(1)
    expect(origens[0]).toMatchObject({
      matriculaId: m.id,
      tipo: 'manual',
      autorId: 'eq',
      observacao: 'Veio da Memberkit',
    })
  })

  it('guarda o nome quando informado e deixa vazio (primeiro acesso) quando não', async () => {
    const { db, turmaId } = await cenario()
    await matricularManual(db, agora, {
      pessoas: [{ email: 'ana@x.test', nome: 'Ana' }, { email: 'bia@x.test' }],
      turmaId,
      autorId: 'eq',
    })
    const contas = await db.select().from(user)
    expect(contas.find((c) => c.email === 'ana@x.test')?.name).toBe('Ana')
    expect(contas.find((c) => c.email === 'bia@x.test')?.name).toBe('')
    expect(contas.find((c) => c.email === 'ana@x.test')?.perfil).toBe('aluno')
  })

  it('usa a conta que já existe em vez de criar outra', async () => {
    const { db, matricular } = await cenario()
    await db.insert(user).values({ id: 'u1', name: 'Bia', email: 'bia@x.test' })
    const resumo = await matricular(['bia@x.test'])
    expect(resumo.criados).toEqual(['bia@x.test'])
    expect(resumo.contasNovas).toEqual([])
    expect(await db.select().from(user)).toHaveLength(2)
  })

  it('separa criados, já matriculados, reativados e inválidos; ignora repetidos', async () => {
    const { db, matricular, matriculaDe } = await cenario()
    await matricular(['ativa@x.test', 'velha@x.test', 'encerrada@x.test'])
    const velha = await matriculaDe('velha@x.test')
    const encerrada = await matriculaDe('encerrada@x.test')
    await db
      .update(matricula)
      .set({ situacao: 'expirada' })
      .where(eq(matricula.id, velha.id))
    await encerrar(db, { matriculaId: encerrada.id })

    const resumo = await matricular([
      'nova@x.test',
      'NOVA@x.test',
      'ativa@x.test',
      'velha@x.test',
      'encerrada@x.test',
      'sem-arroba',
      'a@b',
    ])
    expect(resumo).toEqual({
      criados: ['nova@x.test'],
      contasNovas: ['nova@x.test'],
      jaMatriculados: ['ativa@x.test'],
      reativados: ['velha@x.test', 'encerrada@x.test'],
      invalidos: ['sem-arroba', 'a@b'],
    })
    expect((await matriculaDe('velha@x.test')).situacao).toBe('ativa')
  })

  it('aplica a expiração informada, ou o prazo da turma, ou vitalícia', async () => {
    const turmaComPrazo = await cenario(30)
    await turmaComPrazo.matricular(['a@x.test'])
    expect((await turmaComPrazo.matriculaDe('a@x.test')).expiraEm).toEqual(
      em(30),
    )
    await turmaComPrazo.matricular(['b@x.test'], { expiracao: em(10) })
    expect((await turmaComPrazo.matriculaDe('b@x.test')).expiraEm).toEqual(
      em(10),
    )

    const semPrazo = await cenario()
    await semPrazo.matricular(['c@x.test'])
    expect((await semPrazo.matriculaDe('c@x.test')).expiraEm).toBeNull()
    await expect(
      semPrazo.matricular(['d@x.test'], { expiracao: em(-1) }),
    ).rejects.toThrow('no futuro')
  })

  it('reativar uma expirada recomeça a contagem e soma uma origem', async () => {
    const { db, matricular, matriculaDe } = await cenario(30)
    await matricular(['ana@x.test'])
    relogio = em(40)
    await matricular(['ana@x.test'])
    const m = await matriculaDe('ana@x.test')
    expect(m.situacao).toBe('ativa')
    expect(m.iniciaEm).toEqual(em(40))
    expect(m.expiraEm).toEqual(em(30, em(40)))
    expect(await db.select().from(origemDaMatricula)).toHaveLength(2)
  })

  it('entra no registro de ações com o resumo', async () => {
    const { db, turmaId, matricular } = await cenario()
    await matricular(['ana@x.test', 'ruim'])
    const [registro] = await db.select().from(registroDeAcoes)
    expect(registro.acao).toBe('matricula-manual')
    expect(registro.autorId).toBe('eq')
    expect(JSON.parse(registro.detalhe)).toMatchObject({
      turmaId,
      criados: ['ana@x.test'],
      invalidos: ['ruim'],
    })
  })

  it('avisa o ponto de extensão do "Curso liberado" e não falha se ele falhar', async () => {
    const { matricular } = await cenario()
    const avisos: string[] = []
    const resumo = await matricular(['ana@x.test', 'bia@x.test'], {
      aoLiberarCurso: async (e: { email: string }) => {
        avisos.push(e.email)
        throw new Error('e-mail fora do ar')
      },
    })
    expect(resumo.criados).toHaveLength(2)
    expect(avisos).toEqual(['ana@x.test', 'bia@x.test'])
  })

  it('recusa lote grande demais e turma inexistente', async () => {
    const { db, matricular, turmaId } = await cenario()
    const muitos = Array.from({ length: 201 }, (_, i) => `a${i}@x.test`)
    await expect(matricular(muitos)).rejects.toThrow('no máximo 200')
    await expect(
      matricularManual(db, agora, {
        pessoas: [{ email: 'a@x.test' }],
        turmaId: 'não existe',
        autorId: 'eq',
      }),
    ).rejects.toThrow('Turma não encontrada.')
    expect(turmaId).toBeTruthy()
  })

  it('dá conta de um lote de 200 e-mails', async () => {
    const { db, matricular } = await cenario()
    const emails = Array.from({ length: 200 }, (_, i) => `aluno${i}@x.test`)
    const resumo = await matricular(emails)
    expect(resumo.criados).toHaveLength(200)
    expect(await db.select().from(matricula)).toHaveLength(200)
  })
})

describe('prorrogar, encerrar e reativar', () => {
  it('prorroga para depois da atual e recusa data que não avança', async () => {
    const { db, matricular, matriculaDe } = await cenario()
    await matricular(['ana@x.test'], { expiracao: em(10) })
    const m = await matriculaDe('ana@x.test')
    await expect(
      prorrogar(db, agora, { matriculaId: m.id, ate: em(5) }),
    ).rejects.toThrow('depois da atual')
    await prorrogar(db, agora, { matriculaId: m.id, ate: em(60) })
    expect((await matriculaDe('ana@x.test')).expiraEm).toEqual(em(60))
    await prorrogar(db, agora, { matriculaId: m.id, ate: null })
    expect((await matriculaDe('ana@x.test')).expiraEm).toBeNull()
  })

  it('prorrogar uma expirada a deixa ativa; uma inativa pede reativar', async () => {
    const { db, matricular, matriculaDe } = await cenario()
    await matricular(['ana@x.test'], { expiracao: em(10) })
    const m = await matriculaDe('ana@x.test')
    relogio = em(20)
    await prorrogar(db, agora, { matriculaId: m.id, ate: em(30) })
    expect(situacaoDaMatricula(await matriculaDe('ana@x.test'), agora())).toBe(
      'ativa',
    )
    await encerrar(db, { matriculaId: m.id })
    await expect(
      prorrogar(db, agora, { matriculaId: m.id, ate: em(90) }),
    ).rejects.toThrow('reative')
  })

  it('encerra e reativa, com autor e nova contagem', async () => {
    const { db, matricular, matriculaDe } = await cenario(30)
    await matricular(['ana@x.test'])
    const m = await matriculaDe('ana@x.test')
    await encerrar(db, { matriculaId: m.id })
    expect((await matriculaDe('ana@x.test')).situacao).toBe('inativa')
    await expect(encerrar(db, { matriculaId: m.id })).rejects.toThrow(
      'já está inativa',
    )

    relogio = em(5)
    await reativar(db, agora, {
      matriculaId: m.id,
      autorId: 'eq',
      observacao: 'voltou',
    })
    const depois = await matriculaDe('ana@x.test')
    expect(depois.situacao).toBe('ativa')
    expect(depois.iniciaEm).toEqual(em(5))
    expect(depois.expiraEm).toEqual(em(30, em(5)))
    const origens = await db.select().from(origemDaMatricula)
    expect(origens.map((o) => o.observacao)).toEqual([null, 'voltou'])
    await expect(
      reativar(db, agora, { matriculaId: m.id, autorId: 'eq' }),
    ).rejects.toThrow('já está ativa')
  })
})

describe('expiração automática', () => {
  it('marca como expiradas as ativas vencidas e só elas', async () => {
    const { db, matricular, matriculaDe } = await cenario()
    await matricular(['vence@x.test'], { expiracao: em(10) })
    await matricular(['livre@x.test'])
    await matricular(['longe@x.test'], { expiracao: em(100) })
    relogio = em(11)
    expect(await expirarMatriculas(db, agora)).toBe(1)
    expect((await matriculaDe('vence@x.test')).situacao).toBe('expirada')
    expect((await matriculaDe('livre@x.test')).situacao).toBe('ativa')
    expect((await matriculaDe('longe@x.test')).situacao).toBe('ativa')
    expect(await expirarMatriculas(db, agora)).toBe(0)
  })
})

describe('cursos do aluno', () => {
  it('separa ativos de expirados; com duas turmas do mesmo curso, a ativa vence', async () => {
    const { db, cursoId, matricular, idDe } = await cenario()
    const turma2 = await criarTurma(db, { cursoId, nome: 'Turma 2' })
    await matricular(['ana@x.test'], { expiracao: em(10) })
    relogio = em(20)
    expect(await cursosDoAluno(db, agora, await idDe('ana@x.test'))).toEqual({
      ativos: [],
      expirados: [cursoId],
    })
    await matricularManual(db, agora, {
      pessoas: [{ email: 'ana@x.test' }],
      turmaId: turma2,
      autorId: 'eq',
    })
    expect(await cursosDoAluno(db, agora, await idDe('ana@x.test'))).toEqual({
      ativos: [cursoId],
      expirados: [],
    })
  })
})

describe('perfil do aluno e busca', () => {
  it('lista as matrículas com situação e origens, e busca por e-mail ou nome', async () => {
    const { db, turmaId, idDe } = await cenario()
    await matricularManual(db, agora, {
      pessoas: [
        { email: 'ana@x.test', nome: 'Ana Paula' },
        { email: 'bia@x.test' },
      ],
      turmaId,
      expiracao: em(10),
      autorId: 'eq',
      observacao: 'cortesia',
    })
    relogio = em(11)
    const perfil = await perfilDoAluno(db, agora, await idDe('ana@x.test'))
    expect(perfil?.aluno.email).toBe('ana@x.test')
    expect(perfil?.matriculas).toHaveLength(1)
    expect(perfil?.matriculas[0]).toMatchObject({
      cursoNome: 'Coloração',
      turmaNome: 'Turma 1',
      situacao: 'expirada',
    })
    expect(perfil?.matriculas[0].origens[0]).toMatchObject({
      tipo: 'manual',
      autorNome: 'Marina',
      observacao: 'cortesia',
    })
    expect(await perfilDoAluno(db, agora, 'nada')).toBeNull()
    expect((await buscarAlunos(db, 'paula')).itens.map((a) => a.email)).toEqual(
      ['ana@x.test'],
    )
    expect((await buscarAlunos(db, 'BIA@')).itens.map((a) => a.email)).toEqual([
      'bia@x.test',
    ])
    // A linha de cada aluno traz o curso e a situação de verdade (a data já passou: expirada).
    expect(
      (await buscarAlunos(db, 'paula', 1, agora)).itens[0].matriculas,
    ).toEqual([{ cursoNome: 'Coloração', situacao: 'expirada' }])
    // A equipe não aparece na lista de alunos.
    expect((await buscarAlunos(db)).itens.map((a) => a.email).sort()).toEqual([
      'ana@x.test',
      'bia@x.test',
    ])
  })
})

describe('trocar o e-mail', () => {
  it('troca, encerra as sessões e registra a ação', async () => {
    const { db, matricular, idDe } = await cenario()
    await matricular(['ana@x.test', 'bia@x.test'])
    const anaId = await idDe('ana@x.test')
    await db.insert(session).values({
      id: 's1',
      token: 't1',
      userId: anaId,
      expiresAt: em(30),
      updatedAt: T0,
    })
    const troca1 = await trocarEmail(db, agora, {
      userId: anaId,
      novoEmail: ' ANA.NOVA@x.test ',
      autorId: 'eq',
    })
    // Os dois endereços voltam para o e-mail "Troca de e-mail" ir ao antigo e ao novo.
    expect(troca1).toMatchObject({
      antigo: 'ana@x.test',
      novo: 'ana.nova@x.test',
    })
    expect(
      await trocarEmail(db, agora, {
        userId: anaId,
        novoEmail: 'ana.nova@x.test',
        autorId: 'eq',
      }),
    ).toBeNull()
    const [conta] = await db.select().from(user).where(eq(user.id, anaId))
    expect(conta.email).toBe('ana.nova@x.test')
    expect(await db.select().from(session)).toHaveLength(0)
    const registros = await db.select().from(registroDeAcoes)
    const troca = registros.find((r) => r.acao === 'troca-de-email')
    expect(JSON.parse(troca?.detalhe ?? '{}')).toEqual({
      alunoId: anaId,
      de: 'ana@x.test',
      para: 'ana.nova@x.test',
    })
  })

  it('recusa trocar o e-mail de quem não é aluno', async () => {
    const { db } = await cenario()
    await db.insert(user).values({
      id: 'dono',
      name: 'Dono',
      email: 'dono@x.test',
      perfil: 'proprietario',
    })
    for (const userId of ['eq', 'dono']) {
      await expect(
        trocarEmail(db, agora, {
          userId,
          novoEmail: 'invasor@x.test',
          autorId: 'eq',
        }),
      ).rejects.toThrow('Só é possível trocar o e-mail de um aluno.')
    }
    const emails = (await db.select().from(user)).map((u) => u.email).sort()
    expect(emails).toEqual(['dono@x.test', 'marina@x.test'])
  })

  it('recusa e-mail inválido, em uso ou de aluno que não existe', async () => {
    const { db, matricular, idDe } = await cenario()
    await matricular(['ana@x.test', 'bia@x.test'])
    const anaId = await idDe('ana@x.test')
    await expect(
      trocarEmail(db, agora, { userId: anaId, novoEmail: 'xx', autorId: 'eq' }),
    ).rejects.toThrow('e-mail válido')
    await expect(
      trocarEmail(db, agora, {
        userId: anaId,
        novoEmail: 'bia@x.test',
        autorId: 'eq',
      }),
    ).rejects.toThrow('Já existe')
    await expect(
      trocarEmail(db, agora, {
        userId: 'nada',
        novoEmail: 'z@x.test',
        autorId: 'eq',
      }),
    ).rejects.toThrow('Aluno não encontrado')
  })
})

describe('venda paga', () => {
  const venda = (vendaId: string, turmaId: string, extra = {}) => ({
    vendaId,
    email: 'Ana@X.test',
    nome: 'Ana Souza',
    turmas: [{ turmaId }],
    ...extra,
  })
  const origensDe = async (db: Awaited<ReturnType<typeof cenario>>['db']) =>
    db.select().from(origemDaMatricula)

  it('cria a conta (só pelo e-mail) e a matrícula ativa, com o prazo da turma contado do pagamento', async () => {
    const { db, turmaId, matriculaDe } = await cenario(30)
    const r = await aplicarVendaPaga(db, agora, venda('v1', turmaId))
    expect(r.contaNova).toBe(true)
    expect(r.resultados.map((x) => x.resultado)).toEqual(['criada'])
    const [conta] = await db
      .select()
      .from(user)
      .where(eq(user.email, 'ana@x.test'))
    expect(conta).toMatchObject({ name: 'Ana Souza', perfil: 'aluno' })
    const m = await matriculaDe('ana@x.test')
    expect(m).toMatchObject({ situacao: 'ativa', iniciaEm: T0 })
    expect(m.expiraEm).toEqual(em(30))
    expect(await origensDe(db)).toMatchObject([
      { tipo: 'venda', vendaId: 'v1', matriculaId: m.id },
    ])
  })

  it('o prazo da ligação substitui o da turma; sem prazo em nenhum, é vitalícia', async () => {
    const { db, turmaId, matriculaDe } = await cenario(30)
    await aplicarVendaPaga(db, agora, {
      ...venda('v1', turmaId),
      turmas: [{ turmaId, prazoEmDias: 90 }],
    })
    expect((await matriculaDe('ana@x.test')).expiraEm).toEqual(em(90))

    const outro = await cenario()
    await aplicarVendaPaga(outro.db, agora, venda('v2', outro.turmaId))
    expect((await outro.matriculaDe('ana@x.test')).expiraEm).toBeNull()
  })

  it('repetir a mesma venda não muda nada', async () => {
    const { db, turmaId, matriculaDe } = await cenario(30)
    await aplicarVendaPaga(db, agora, venda('v1', turmaId))
    relogio = em(5)
    const r = await aplicarVendaPaga(db, agora, venda('v1', turmaId))
    expect(r.contaNova).toBe(false)
    expect(r.resultados.map((x) => x.resultado)).toEqual(['repetida'])
    expect((await matriculaDe('ana@x.test')).expiraEm).toEqual(em(30, T0))
    expect(await origensDe(db)).toHaveLength(1)
  })

  it('outra venda na matrícula ativa fica com a expiração mais distante', async () => {
    const { db, turmaId, matriculaDe } = await cenario(30)
    await aplicarVendaPaga(db, agora, venda('v1', turmaId))
    relogio = em(10)
    const r = await aplicarVendaPaga(db, agora, venda('v2', turmaId))
    expect(r.resultados.map((x) => x.resultado)).toEqual(['estendida'])
    const m = await matriculaDe('ana@x.test')
    expect(m.expiraEm).toEqual(em(40, T0))
    expect(m.iniciaEm).toEqual(T0)
    // Uma venda de prazo menor não encurta.
    await aplicarVendaPaga(db, agora, {
      ...venda('v3', turmaId),
      turmas: [{ turmaId, prazoEmDias: 5 }],
    })
    expect((await matriculaDe('ana@x.test')).expiraEm).toEqual(em(40, T0))
    expect(await origensDe(db)).toHaveLength(3)
  })

  it('a vitalícia continua vitalícia e a venda vitalícia vence a com prazo', async () => {
    const { db, turmaId, matriculaDe } = await cenario(30)
    await aplicarVendaPaga(db, agora, venda('v1', turmaId))
    // Vitalícia = venda sem prazo em turma sem prazo; aqui a turma tem 30 dias, então edita-se a turma.
    await editarTurma(db, turmaId, { nome: 'Turma 1', prazoEmDias: null })
    await aplicarVendaPaga(db, agora, venda('v2', turmaId))
    const m = await matriculaDe('ana@x.test')
    expect(m.expiraEm).toBeNull()
    await aplicarVendaPaga(db, agora, {
      ...venda('v3', turmaId),
      turmas: [{ turmaId, prazoEmDias: 10 }],
    })
    expect((await matriculaDe('ana@x.test')).expiraEm).toBeNull()
  })

  it('reativa a matrícula expirada ou inativa, recomeçando a contar, sem apagar o que existe', async () => {
    const { db, turmaId, matriculaDe, matricular } = await cenario(30)
    await matricular(['ana@x.test'])
    relogio = em(60)
    expect(await expirarMatriculas(db, agora)).toBe(1)
    const eventos: string[] = []
    const r = await aplicarVendaPaga(db, agora, {
      ...venda('v1', turmaId),
      aoLiberarCursos: async (es) => {
        for (const e of es) eventos.push(`${e.email}:${e.contaNova}`)
      },
    })
    expect(r.resultados.map((x) => x.resultado)).toEqual(['reativada'])
    expect(await matriculaDe('ana@x.test')).toMatchObject({
      situacao: 'ativa',
      iniciaEm: em(60, T0),
      expiraEm: em(90, T0),
    })
    expect(eventos).toEqual(['ana@x.test:false'])

    await encerrar(db, { matriculaId: (await matriculaDe('ana@x.test')).id })
    const r2 = await aplicarVendaPaga(db, agora, venda('v2', turmaId))
    expect(r2.resultados.map((x) => x.resultado)).toEqual(['reativada'])
    expect((await matriculaDe('ana@x.test')).situacao).toBe('ativa')
  })

  it('matricula em todas as turmas da ligação e avisa o curso liberado só no que é novo, uma vez por curso', async () => {
    const { db, cursoId, turmaId } = await cenario()
    const outra = await criarTurma(db, { cursoId, nome: 'Turma 2' })
    const liberados: string[] = []
    const r = await aplicarVendaPaga(db, agora, {
      ...venda('v1', turmaId),
      turmas: [{ turmaId }, { turmaId: outra }, { turmaId }],
      aoLiberarCursos: async (es) => {
        for (const e of es) liberados.push(e.turmaId)
      },
    })
    expect(r.resultados).toHaveLength(2)
    // Duas turmas do mesmo curso: um evento só.
    expect(liberados).toHaveLength(1)
    // Mais uma venda, só da turma já ativa: ninguém é avisado de novo.
    liberados.length = 0
    await aplicarVendaPaga(db, agora, {
      ...venda('v2', turmaId),
      aoLiberarCursos: async (es) => {
        for (const e of es) liberados.push(e.turmaId)
      },
    })
    expect(liberados).toEqual([])
  })

  it('o gancho da venda roda UMA vez, com um evento por curso', async () => {
    const { db, cursoId, turmaId } = await cenario()
    const outroCurso = await criarCurso(db, { nome: 'Corte' })
    const terceiro = await criarCurso(db, { nome: 'Curso de exemplo C' })
    const deOutro = await criarTurma(db, { cursoId: outroCurso, nome: 'T' })
    const deTerceiro = await criarTurma(db, { cursoId: terceiro, nome: 'T' })
    const chamadas: string[][] = []
    await aplicarVendaPaga(db, agora, {
      ...venda('v1', turmaId),
      turmas: [{ turmaId }, { turmaId: deOutro }, { turmaId: deTerceiro }],
      aoLiberarCursos: async (es) => {
        chamadas.push(es.map((e) => e.cursoId))
      },
    })
    expect(chamadas).toHaveLength(1)
    expect([...(chamadas[0] ?? [])].sort()).toEqual(
      [cursoId, outroCurso, terceiro].sort(),
    )
  })

  it('duas turmas do mesmo curso viram um curso só, e venda repetida não chama o gancho', async () => {
    const { db, cursoId, turmaId } = await cenario()
    const outra = await criarTurma(db, { cursoId, nome: 'Turma 2' })
    const chamadas: string[][] = []
    const aoLiberarCursos = async (es: { cursoId: string }[]) => {
      chamadas.push(es.map((e) => e.cursoId))
    }
    const entrada = {
      ...venda('v1', turmaId),
      turmas: [{ turmaId }, { turmaId: outra }],
      aoLiberarCursos,
    }
    await aplicarVendaPaga(db, agora, entrada)
    expect(chamadas).toEqual([[cursoId]])
    await aplicarVendaPaga(db, agora, entrada)
    expect(chamadas).toHaveLength(1)
  })

  it('a falha do aviso de curso liberado não desfaz a matrícula', async () => {
    const { db, turmaId, matriculaDe } = await cenario()
    const erro = vi.spyOn(console, 'error').mockImplementation(() => {})
    await aplicarVendaPaga(db, agora, {
      ...venda('v1', turmaId),
      aoLiberarCursos: async () => {
        throw new Error('e-mail fora do ar')
      },
    })
    erro.mockRestore()
    expect((await matriculaDe('ana@x.test')).situacao).toBe('ativa')
  })

  it('usa a conta que já existe pelo e-mail, sem mudar o nome', async () => {
    const { db, turmaId, matricular } = await cenario()
    await matricular(['ana@x.test'])
    const outra = await criarTurma(db, {
      cursoId: (await listarTurmas(db))[0].cursoId,
      nome: 'Turma 2',
    })
    const r = await aplicarVendaPaga(db, agora, {
      ...venda('v1', turmaId),
      turmas: [{ turmaId: outra }],
    })
    expect(r.contaNova).toBe(false)
    expect(
      await db.select().from(user).where(eq(user.email, 'ana@x.test')),
    ).toHaveLength(1)
  })

  it('recusa e-mail inválido, venda sem id e venda sem turma', async () => {
    const { db, turmaId } = await cenario()
    await expect(
      aplicarVendaPaga(db, agora, { ...venda('v1', turmaId), email: 'x' }),
    ).rejects.toThrow(ErroDeMatricula)
    await expect(
      aplicarVendaPaga(db, agora, venda(' ', turmaId)),
    ).rejects.toThrow(ErroDeMatricula)
    await expect(
      aplicarVendaPaga(db, agora, { ...venda('v1', turmaId), turmas: [] }),
    ).rejects.toThrow(ErroDeMatricula)
    expect(
      await db.select().from(user).where(eq(user.email, 'ana@x.test')),
    ).toHaveLength(0)
  })
})

describe('estorno', () => {
  const paga = (
    db: Awaited<ReturnType<typeof cenario>>['db'],
    vendaId: string,
    turmaId: string,
  ) =>
    aplicarVendaPaga(db, agora, {
      vendaId,
      email: 'ana@x.test',
      turmas: [{ turmaId }],
    })

  it('a venda era a única origem: tira a origem e inativa a matrícula', async () => {
    const { db, turmaId, matriculaDe } = await cenario()
    await paga(db, 'v1', turmaId)
    const r = await aplicarEstorno(db, { vendaId: 'v1' })
    const m = await matriculaDe('ana@x.test')
    expect(r).toEqual({ inativadas: [m.id], mantidas: [] })
    expect(m.situacao).toBe('inativa')
    expect(await db.select().from(origemDaMatricula)).toHaveLength(0)
  })

  it('estorno de uma de duas vendas mantém a matrícula ativa', async () => {
    const { db, turmaId, matriculaDe } = await cenario(30)
    await paga(db, 'v1', turmaId)
    await paga(db, 'v2', turmaId)
    const r = await aplicarEstorno(db, { vendaId: 'v1' })
    const m = await matriculaDe('ana@x.test')
    expect(r).toEqual({ inativadas: [], mantidas: [m.id] })
    expect(m.situacao).toBe('ativa')
    expect(await db.select().from(origemDaMatricula)).toMatchObject([
      { vendaId: 'v2' },
    ])
  })

  it('uma matrícula manual também sustenta a matrícula depois do estorno', async () => {
    const { db, turmaId, matriculaDe, matricular } = await cenario()
    await matricular(['ana@x.test'])
    await paga(db, 'v1', turmaId)
    // A matrícula manual já estava ativa: a venda só entrou como origem.
    const r = await aplicarEstorno(db, { vendaId: 'v1' })
    expect(r.inativadas).toEqual([])
    expect(r.mantidas).toHaveLength(1)
    expect((await matriculaDe('ana@x.test')).situacao).toBe('ativa')
    const origens = await db.select().from(origemDaMatricula)
    expect(origens.map((o) => o.tipo)).toEqual(['manual'])
  })

  it('o estorno atinge todas as turmas da venda e é repetível sem efeito', async () => {
    const { db, cursoId, turmaId } = await cenario()
    const outra = await criarTurma(db, { cursoId, nome: 'Turma 2' })
    await aplicarVendaPaga(db, agora, {
      vendaId: 'v1',
      email: 'ana@x.test',
      turmas: [{ turmaId }, { turmaId: outra }],
    })
    const r = await aplicarEstorno(db, { vendaId: 'v1' })
    expect(r.inativadas).toHaveLength(2)
    expect(await aplicarEstorno(db, { vendaId: 'v1' })).toEqual({
      inativadas: [],
      mantidas: [],
    })
  })

  it('venda que não sustentava nada não faz nada', async () => {
    const { db, turmaId, matricular, matriculaDe } = await cenario()
    await matricular(['ana@x.test'])
    expect(await aplicarEstorno(db, { vendaId: 'v-desconhecida' })).toEqual({
      inativadas: [],
      mantidas: [],
    })
    expect(await matriculaDe('ana@x.test')).toMatchObject({ situacao: 'ativa' })
    expect(turmaId).toBeTruthy()
  })
})

describe('lista de alunos paginada', () => {
  it('traz 20 por página, com o total, e a página que passa do fim vem vazia', async () => {
    const db = await criarBancoDeTeste()
    // O D1 aceita 100 parâmetros por comando: 45 alunas entram em lotes.
    const alunas = Array.from({ length: 45 }, (_, i) => ({
      id: `a${i}`,
      name: `Aluna ${i}`,
      email: `a${String(i).padStart(2, '0')}@x.test`,
    }))
    for (let i = 0; i < alunas.length; i += 10) {
      await db.insert(user).values(alunas.slice(i, i + 10))
    }
    const primeira = await buscarAlunos(db)
    expect(primeira.itens).toHaveLength(20)
    expect(primeira).toMatchObject({
      pagina: 1,
      porPagina: 20,
      total: 45,
      totalDePaginas: 3,
    })
    expect((await buscarAlunos(db, '', 3)).itens).toHaveLength(5)
    expect((await buscarAlunos(db, '', 4)).itens).toHaveLength(0)
    const todas = [
      ...(await buscarAlunos(db, '', 1)).itens,
      ...(await buscarAlunos(db, '', 2)).itens,
      ...(await buscarAlunos(db, '', 3)).itens,
    ]
    expect(new Set(todas.map((a) => a.id)).size).toBe(45)
    // O total respeita a busca.
    expect((await buscarAlunos(db, 'a4')).total).toBe(5)
  })
})

describe('excluirTurma', () => {
  it('recusa edição com alunos, ativos ou não', async () => {
    const { db, turmaId, matricular } = await cenario()
    await matricular(['ana@x.test'])
    await expect(excluirTurma(db, agora, turmaId, 'eq')).rejects.toThrow(
      'Esta edição tem 1 aluno. Mova ou cancele as matrículas antes de excluir.',
    )
    expect(await listarTurmas(db)).toHaveLength(1)
  })

  it('exclui edição vazia com as ligações de venda, e registra a ação', async () => {
    const { db, turmaId } = await cenario()
    await db
      .insert(ligacaoDeVenda)
      .values({ id: 'l1', produtoId: 'p1', turmaId })
    await excluirTurma(db, agora, turmaId, 'eq')
    expect(await listarTurmas(db)).toHaveLength(0)
    expect(await db.select().from(ligacaoDeVenda)).toHaveLength(0)
    const [reg] = await db.select().from(registroDeAcoes)
    expect(reg.acao).toBe('edicao-excluida')
  })

  it('turma que não existe dá erro', async () => {
    const { db } = await cenario()
    await expect(excluirTurma(db, agora, 'nada', 'eq')).rejects.toThrow(
      'Turma não encontrada.',
    )
  })
})

describe('resumo das matrículas da lista de alunos', () => {
  const hoje = new Date('2026-11-16T12:00:00Z')
  it('uma linha por curso, com a melhor situação, em ordem de nome', () => {
    expect(
      resumoDasMatriculas(
        [
          { cursoNome: 'Mechas', situacao: 'inativa', expiraEm: null },
          { cursoNome: 'Mechas', situacao: 'ativa', expiraEm: null },
          {
            cursoNome: 'Corte',
            situacao: 'ativa',
            expiraEm: new Date('2026-01-01'),
          },
          { cursoNome: 'Corte', situacao: 'inativa', expiraEm: null },
        ],
        hoje,
      ),
    ).toEqual([
      { cursoNome: 'Corte', situacao: 'expirada' },
      { cursoNome: 'Mechas', situacao: 'ativa' },
    ])
    expect(resumoDasMatriculas([], hoje)).toEqual([])
  })
})
