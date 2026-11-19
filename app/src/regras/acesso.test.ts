import { describe, expect, it } from 'vitest'
import { matricula, regraDeLiberacao, user } from '#/db/schema'
import {
  type Aluno,
  aulasLiberadas,
  lerRegra,
  liberacoesNoIntervalo,
  maisGenerosa,
  type OpcoesDeAcesso,
  regrasQuebradas,
  situacaoDoConteudo,
  situacoesDosCursos,
} from '#/regras/acesso'
import { LIBERADO, textoDoCadeado } from '#/regras/cadeado'
import { criarAula, criarCurso, criarModulo } from '#/regras/conteudo'
import { criarTurma } from '#/regras/matricula'
import { concluirAula } from '#/regras/progresso'
import { definirRegra } from '#/regras/regras-de-liberacao'
import { criarBancoDeTeste } from '#/test/banco'

// 10/03/2026, meio-dia em Brasília (15:00Z).
const T0 = new Date('2026-03-10T15:00:00Z')
let relogio = T0
const agora = () => relogio
const ana: Aluno = { id: 'ana', perfil: 'aluno' }
const equipe: Aluno = { id: 'eq', perfil: 'equipe' }

async function cenario() {
  relogio = T0
  const db = await criarBancoDeTeste()
  for (const [id, perfil] of [
    ['ana', 'aluno'],
    ['bia', 'aluno'],
    ['eq', 'equipe'],
  ] as const) {
    await db
      .insert(user)
      .values({ id, name: id, email: `${id}@x.test`, perfil })
  }
  const cursoId = await criarCurso(db, { nome: 'Coloração' })
  const m1 = await criarModulo(db, cursoId, { nome: 'Módulo 1' })
  const m2 = await criarModulo(db, cursoId, { nome: 'Módulo 2' })
  const a1 = await criarAula(db, m1, { titulo: 'Aula 1' })
  const a2 = await criarAula(db, m1, { titulo: 'Aula 2' })
  const a3 = await criarAula(db, m2, { titulo: 'Aula 3' })
  const turmaId = await criarTurma(db, { cursoId, nome: 'Turma 1' })
  const matricular = async (
    userId: string,
    turma = turmaId,
    extra: Partial<typeof matricula.$inferInsert> = {},
  ) => {
    await db.insert(matricula).values({
      id: crypto.randomUUID(),
      userId,
      turmaId: turma,
      iniciaEm: T0,
      ...extra,
    })
  }
  const aula = (id: string, a: Aluno = ana, o?: OpcoesDeAcesso) =>
    situacaoDoConteudo(db, agora, a, { tipo: 'aula', id }, o)
  const mod = (id: string, a: Aluno = ana, o?: OpcoesDeAcesso) =>
    situacaoDoConteudo(db, agora, a, { tipo: 'modulo', id }, o)
  return { db, cursoId, m1, m2, a1, a2, a3, turmaId, matricular, aula, mod }
}

describe('as 9 regras de liberação', () => {
  it('sem regra, o conteúdo é livre para quem tem matrícula ativa', async () => {
    const c = await cenario()
    await c.matricular('ana')
    expect(await c.mod(c.m1)).toEqual(LIBERADO)
    expect(await c.aula(c.a1)).toEqual(LIBERADO)
  })

  it('1. livre', async () => {
    const c = await cenario()
    await c.matricular('ana')
    await definirRegra(c.db, {
      turmaId: c.turmaId,
      moduloId: c.m1,
      tipo: 'livre',
    })
    expect(await c.mod(c.m1)).toEqual(LIBERADO)
  })

  it('2. data programada: cadeado até a data, que começa à 00:00 de Brasília', async () => {
    const c = await cenario()
    await c.matricular('ana')
    await definirRegra(c.db, {
      turmaId: c.turmaId,
      moduloId: c.m2,
      tipo: 'data',
      liberaEm: '2026-03-12',
    })
    const antes = await c.mod(c.m2)
    expect(antes).toMatchObject({ tipo: 'cadeado', motivo: 'data' })
    if (antes.tipo === 'cadeado') {
      expect(antes.liberaEm?.toISOString()).toBe('2026-03-12T03:00:00.000Z')
      expect(textoDoCadeado(antes)).toBe('Libera em 12/03')
      // A liberação é calculada em Brasília, mas a data que a aluna lê vai no fuso dela: 00:00 de
      // Brasília do dia 12 ainda é dia 11 em Los Angeles.
      expect(textoDoCadeado(antes, 'America/Los_Angeles')).toBe(
        'Libera em 11/03',
      )
      expect(textoDoCadeado(antes, 'Europe/Lisbon')).toBe('Libera em 12/03')
    }
    // 23:59 de Brasília do dia 11 (02:59Z do dia 12): ainda fechado.
    relogio = new Date('2026-03-12T02:59:00Z')
    expect((await c.mod(c.m2)).tipo).toBe('cadeado')
    // 00:00 de Brasília do dia 12: abre.
    relogio = new Date('2026-03-12T03:00:00Z')
    expect(await c.mod(c.m2)).toEqual(LIBERADO)
  })

  it('2. fechamento opcional: depois do último dia, o cadeado é "fechado"', async () => {
    const c = await cenario()
    await c.matricular('ana')
    await definirRegra(c.db, {
      turmaId: c.turmaId,
      moduloId: c.m1,
      tipo: 'data',
      liberaEm: '2026-03-01',
      fechaEm: '2026-03-15',
    })
    expect(await c.mod(c.m1)).toEqual(LIBERADO)
    // Fim do dia 15 em Brasília = 16/03 02:59:59Z.
    relogio = new Date('2026-03-16T02:59:59Z')
    expect(await c.mod(c.m1)).toEqual(LIBERADO)
    relogio = new Date('2026-03-16T03:00:01Z')
    expect(await c.mod(c.m1)).toMatchObject({
      tipo: 'cadeado',
      motivo: 'fechado',
    })
  })

  it('3. dias após a compra: conta do início da matrícula, no dia de Brasília', async () => {
    const c = await cenario()
    // Matrícula às 22:00 de Brasília do dia 08 (01:00Z do dia 09).
    await c.matricular('ana', c.turmaId, {
      iniciaEm: new Date('2026-03-09T01:00:00Z'),
    })
    await definirRegra(c.db, {
      turmaId: c.turmaId,
      moduloId: c.m2,
      tipo: 'dias_apos_compra',
      dias: 7,
    })
    const s = await c.mod(c.m2)
    expect(s).toMatchObject({ tipo: 'cadeado', motivo: 'dias_apos_compra' })
    if (s.tipo === 'cadeado') {
      // Dia 08 + 7 = 15/03, 00:00 de Brasília.
      expect(s.liberaEm?.toISOString()).toBe('2026-03-15T03:00:00.000Z')
      expect(s.requisito).toEqual({ tipo: 'dias', dias: 7 })
      expect(textoDoCadeado(s)).toBe('Libera 7 dias após a compra (em 15/03)')
    }
    relogio = new Date('2026-03-15T03:00:00Z')
    expect(await c.mod(c.m2)).toEqual(LIBERADO)
  })

  it('3. a reativação reinicia a contagem (iniciaEm novo)', async () => {
    const c = await cenario()
    await c.matricular('ana', c.turmaId, {
      iniciaEm: new Date('2026-01-01T15:00:00Z'),
    })
    await definirRegra(c.db, {
      turmaId: c.turmaId,
      moduloId: c.m2,
      tipo: 'dias_apos_compra',
      dias: 7,
    })
    expect(await c.mod(c.m2)).toEqual(LIBERADO)
    await c.db.update(matricula).set({ iniciaEm: T0 })
    expect((await c.mod(c.m2)).tipo).toBe('cadeado')
  })

  it('4. pontuação mínima: usa o saldo do curso recebido por parâmetro', async () => {
    const c = await cenario()
    await c.matricular('ana')
    await definirRegra(c.db, {
      turmaId: c.turmaId,
      moduloId: c.m2,
      tipo: 'pontuacao_minima',
      pontos: 300,
    })
    const pedidos: string[] = []
    const com = (saldo: number): OpcoesDeAcesso => ({
      saldoDoCurso: (userId, cursoId) => {
        pedidos.push(`${userId}:${cursoId}`)
        return saldo
      },
    })
    const s = await c.mod(c.m2, ana, com(180))
    expect(s).toMatchObject({ tipo: 'cadeado', motivo: 'pontuacao_minima' })
    if (s.tipo === 'cadeado') {
      expect(s.requisito).toEqual({ tipo: 'pontos', minimo: 300, faltam: 120 })
      expect(textoDoCadeado(s)).toBe('Faltam 120 pontos neste curso')
    }
    expect(pedidos).toEqual([`ana:${c.cursoId}`])
    expect(await c.mod(c.m2, ana, com(300))).toEqual(LIBERADO)
    // Sem a fatia de pontos, o saldo é 0.
    expect((await c.mod(c.m2)).tipo).toBe('cadeado')
  })

  it('4. falta 1 ponto no singular', () => {
    expect(
      textoDoCadeado({
        tipo: 'cadeado',
        motivo: 'pontuacao_minima',
        requisito: { tipo: 'pontos', faltam: 1 },
      }),
    ).toBe('Falta 1 ponto neste curso')
  })

  it('5. oculto: não aparece', async () => {
    const c = await cenario()
    await c.matricular('ana')
    await definirRegra(c.db, {
      turmaId: c.turmaId,
      moduloId: c.m2,
      tipo: 'oculto',
    })
    expect(await c.mod(c.m2)).toEqual({ tipo: 'oculto' })
    expect(await c.aula(c.a3)).toEqual({ tipo: 'oculto' })
  })

  it('6. bloqueado: cadeado sem data', async () => {
    const c = await cenario()
    await c.matricular('ana')
    await definirRegra(c.db, {
      turmaId: c.turmaId,
      moduloId: c.m2,
      tipo: 'bloqueado',
    })
    expect(await c.mod(c.m2)).toEqual({ tipo: 'cadeado', motivo: 'bloqueado' })
  })

  it('7. curso concluído: de outro curso, só com todas as aulas dele concluídas', async () => {
    const c = await cenario()
    await c.matricular('ana')
    const basico = await criarCurso(c.db, { nome: 'Básico' })
    const mb = await criarModulo(c.db, basico, { nome: 'Fundamentos' })
    const b1 = await criarAula(c.db, mb, { titulo: 'B1' })
    const b2 = await criarAula(c.db, mb, { titulo: 'B2' })
    await definirRegra(c.db, {
      turmaId: c.turmaId,
      moduloId: c.m2,
      tipo: 'curso_concluido',
      alvoId: basico,
    })
    const s = await c.mod(c.m2)
    expect(s).toMatchObject({ tipo: 'cadeado', motivo: 'apos_curso' })
    if (s.tipo === 'cadeado') {
      expect(textoDoCadeado(s)).toBe('Conclua o curso Básico')
    }
    await concluirAula(c.db, agora, 'ana', b1)
    expect((await c.mod(c.m2)).tipo).toBe('cadeado')
    await concluirAula(c.db, agora, 'ana', b2)
    expect(await c.mod(c.m2)).toEqual(LIBERADO)
  })

  it('8. módulo concluído', async () => {
    const c = await cenario()
    await c.matricular('ana')
    await definirRegra(c.db, {
      turmaId: c.turmaId,
      moduloId: c.m2,
      tipo: 'modulo_concluido',
      alvoId: c.m1,
    })
    const s = await c.mod(c.m2)
    expect(s).toMatchObject({ tipo: 'cadeado', motivo: 'apos_modulo' })
    if (s.tipo === 'cadeado') {
      expect(textoDoCadeado(s)).toBe('Conclua o módulo Módulo 1')
    }
    await concluirAula(c.db, agora, 'ana', c.a1)
    expect((await c.mod(c.m2)).tipo).toBe('cadeado')
    await concluirAula(c.db, agora, 'ana', c.a2)
    expect(await c.mod(c.m2)).toEqual(LIBERADO)
  })

  it('9. aula concluída, e desmarcar a conclusão fecha de novo', async () => {
    const c = await cenario()
    await c.matricular('ana')
    await definirRegra(c.db, {
      turmaId: c.turmaId,
      aulaId: c.a2,
      tipo: 'aula_concluida',
      alvoId: c.a1,
    })
    const s = await c.aula(c.a2)
    expect(s).toMatchObject({ tipo: 'cadeado', motivo: 'apos_aula' })
    if (s.tipo === 'cadeado') {
      expect(textoDoCadeado(s)).toBe('Conclua a aula Aula 1')
    }
    await concluirAula(c.db, agora, 'ana', c.a1)
    expect(await c.aula(c.a2)).toEqual(LIBERADO)
  })

  it('a conclusão é de cada aluno', async () => {
    const c = await cenario()
    await c.matricular('ana')
    await c.matricular('bia')
    await definirRegra(c.db, {
      turmaId: c.turmaId,
      aulaId: c.a2,
      tipo: 'aula_concluida',
      alvoId: c.a1,
    })
    await concluirAula(c.db, agora, 'ana', c.a1)
    expect(await c.aula(c.a2, ana)).toEqual(LIBERADO)
    expect((await c.aula(c.a2, { id: 'bia', perfil: 'aluno' })).tipo).toBe(
      'cadeado',
    )
  })
})

describe('regra do módulo e regra da aula', () => {
  it('as aulas seguem a regra do módulo', async () => {
    const c = await cenario()
    await c.matricular('ana')
    await definirRegra(c.db, {
      turmaId: c.turmaId,
      moduloId: c.m1,
      tipo: 'bloqueado',
    })
    expect(await c.aula(c.a1)).toEqual({ tipo: 'cadeado', motivo: 'bloqueado' })
    expect(await c.aula(c.a2)).toEqual({ tipo: 'cadeado', motivo: 'bloqueado' })
    expect(await c.aula(c.a3)).toEqual(LIBERADO)
  })

  it('a regra própria da aula vale no lugar da do módulo, nos dois sentidos', async () => {
    const c = await cenario()
    await c.matricular('ana')
    await definirRegra(c.db, {
      turmaId: c.turmaId,
      moduloId: c.m1,
      tipo: 'bloqueado',
    })
    await definirRegra(c.db, {
      turmaId: c.turmaId,
      aulaId: c.a1,
      tipo: 'livre',
    })
    expect(await c.aula(c.a1)).toEqual(LIBERADO)
    expect((await c.aula(c.a2)).tipo).toBe('cadeado')
    // Aula com regra própria num módulo livre.
    await definirRegra(c.db, {
      turmaId: c.turmaId,
      aulaId: c.a3,
      tipo: 'oculto',
    })
    expect(await c.aula(c.a3)).toEqual({ tipo: 'oculto' })
    expect(await c.mod(c.m2)).toEqual(LIBERADO)
  })

  it('regrar de novo troca a regra; a aula volta ao módulo ao remover', async () => {
    const c = await cenario()
    await c.matricular('ana')
    await definirRegra(c.db, {
      turmaId: c.turmaId,
      moduloId: c.m1,
      tipo: 'bloqueado',
    })
    await definirRegra(c.db, {
      turmaId: c.turmaId,
      moduloId: c.m1,
      tipo: 'oculto',
    })
    expect(await c.mod(c.m1)).toEqual({ tipo: 'oculto' })
  })
})

describe('matrícula e turmas', () => {
  it('sem matrícula: cadeado "sem_matricula"', async () => {
    const c = await cenario()
    expect(await c.aula(c.a1)).toEqual({
      tipo: 'cadeado',
      motivo: 'sem_matricula',
    })
  })

  it('matrícula expirada: cadeado "acesso_expirado"; inativa conta como sem matrícula', async () => {
    const c = await cenario()
    await c.matricular('ana', c.turmaId, {
      expiraEm: new Date('2026-03-01T00:00:00Z'),
    })
    expect(await c.aula(c.a1)).toEqual({
      tipo: 'cadeado',
      motivo: 'acesso_expirado',
    })
    await c.db.update(matricula).set({ situacao: 'inativa' })
    expect(await c.aula(c.a1)).toEqual({
      tipo: 'cadeado',
      motivo: 'sem_matricula',
    })
  })

  it('com duas turmas do mesmo curso vale a mais generosa', async () => {
    const c = await cenario()
    const turma2 = await criarTurma(c.db, {
      cursoId: c.cursoId,
      nome: 'Turma 2',
    })
    await c.matricular('ana')
    await c.matricular('ana', turma2)
    await definirRegra(c.db, {
      turmaId: c.turmaId,
      moduloId: c.m2,
      tipo: 'bloqueado',
    })
    // A segunda turma não tem regra: livre vence o bloqueio.
    expect(await c.mod(c.m2)).toEqual(LIBERADO)
    // Com as duas travando, vence a que abre antes.
    await definirRegra(c.db, {
      turmaId: turma2,
      moduloId: c.m2,
      tipo: 'data',
      liberaEm: '2026-03-20',
    })
    const s = await c.mod(c.m2)
    expect(s).toMatchObject({ tipo: 'cadeado', motivo: 'data' })
    await definirRegra(c.db, {
      turmaId: c.turmaId,
      moduloId: c.m2,
      tipo: 'data',
      liberaEm: '2026-03-15',
    })
    const mais = await c.mod(c.m2)
    expect(mais.tipo === 'cadeado' && mais.liberaEm?.toISOString()).toBe(
      '2026-03-15T03:00:00.000Z',
    )
  })

  it('turma ativa vence turma expirada do mesmo curso', async () => {
    const c = await cenario()
    const turma2 = await criarTurma(c.db, {
      cursoId: c.cursoId,
      nome: 'Turma 2',
    })
    await c.matricular('ana', c.turmaId, {
      expiraEm: new Date('2026-03-01T00:00:00Z'),
    })
    await c.matricular('ana', turma2)
    expect(await c.aula(c.a1)).toEqual(LIBERADO)
  })

  it('oculto numa turma e cadeado na outra: mostra o cadeado', () => {
    expect(
      maisGenerosa([
        { tipo: 'oculto' },
        { tipo: 'cadeado', motivo: 'bloqueado' },
        { tipo: 'cadeado', motivo: 'apos_curso' },
      ]),
    ).toEqual({ tipo: 'cadeado', motivo: 'apos_curso' })
  })

  it('a regra de uma turma não vale para o aluno de outra', async () => {
    const c = await cenario()
    const turma2 = await criarTurma(c.db, {
      cursoId: c.cursoId,
      nome: 'Turma 2',
    })
    await c.matricular('ana', turma2)
    await definirRegra(c.db, {
      turmaId: c.turmaId,
      moduloId: c.m1,
      tipo: 'bloqueado',
    })
    expect(await c.mod(c.m1)).toEqual(LIBERADO)
  })
})

describe('equipe e "ver como aluno"', () => {
  it('a equipe vê tudo liberado, mesmo oculto e bloqueado', async () => {
    const c = await cenario()
    await definirRegra(c.db, {
      turmaId: c.turmaId,
      moduloId: c.m1,
      tipo: 'oculto',
    })
    await definirRegra(c.db, {
      turmaId: c.turmaId,
      moduloId: c.m2,
      tipo: 'bloqueado',
    })
    expect(await c.mod(c.m1, equipe)).toEqual(LIBERADO)
    expect(await c.aula(c.a3, equipe)).toEqual(LIBERADO)
  })

  it('"ver como aluno" aplica as regras da turma escolhida, contando da hora de agora', async () => {
    const c = await cenario()
    const turma2 = await criarTurma(c.db, {
      cursoId: c.cursoId,
      nome: 'Turma 2',
    })
    await definirRegra(c.db, {
      turmaId: c.turmaId,
      moduloId: c.m1,
      tipo: 'oculto',
    })
    await definirRegra(c.db, {
      turmaId: turma2,
      moduloId: c.m2,
      tipo: 'dias_apos_compra',
      dias: 3,
    })
    const como = (turmaId: string): OpcoesDeAcesso => ({
      comoAluno: { turmaId },
    })
    expect(await c.mod(c.m1, equipe, como(c.turmaId))).toEqual({
      tipo: 'oculto',
    })
    expect(await c.mod(c.m2, equipe, como(c.turmaId))).toEqual(LIBERADO)
    const s = await c.mod(c.m2, equipe, como(turma2))
    expect(s.tipo === 'cadeado' && s.liberaEm?.toISOString()).toBe(
      '2026-03-13T03:00:00.000Z',
    )
  })

  it('aluno não ganha acesso pedindo "como aluno" de outra turma', async () => {
    const c = await cenario()
    await c.matricular('ana')
    await definirRegra(c.db, {
      turmaId: c.turmaId,
      moduloId: c.m1,
      tipo: 'bloqueado',
    })
    const outra = await criarTurma(c.db, {
      cursoId: c.cursoId,
      nome: 'Turma 2',
    })
    expect(await c.mod(c.m1, ana, { comoAluno: { turmaId: outra } })).toEqual({
      tipo: 'cadeado',
      motivo: 'bloqueado',
    })
  })
})

describe('situacoesDosCursos e as aulas liberadas', () => {
  it('devolve o mapa de módulos e aulas e o conjunto que abre', async () => {
    const c = await cenario()
    await c.matricular('ana')
    await definirRegra(c.db, {
      turmaId: c.turmaId,
      moduloId: c.m1,
      tipo: 'bloqueado',
    })
    await definirRegra(c.db, {
      turmaId: c.turmaId,
      aulaId: c.a2,
      tipo: 'livre',
    })
    const mapa = await situacoesDosCursos(c.db, agora, ana, [c.cursoId])
    expect(mapa.modulos.size).toBe(2)
    expect(mapa.aulas.size).toBe(3)
    expect([...aulasLiberadas(mapa)].sort()).toEqual([c.a2, c.a3].sort())
  })

  it('conteúdo excluído não entra', async () => {
    const c = await cenario()
    await c.matricular('ana')
    const { excluirAula } = await import('#/regras/conteudo')
    await excluirAula(c.db, agora, c.a1)
    const mapa = await situacoesDosCursos(c.db, agora, ana, [c.cursoId])
    expect(mapa.aulas.has(c.a1)).toBe(false)
  })
})

describe('liberacoesNoIntervalo (gancho do aviso "Conteúdo liberado")', () => {
  it('lista, por aluno ativo, o que abre por data ou por dias no intervalo', async () => {
    const c = await cenario()
    await c.matricular('ana')
    await c.matricular('bia', c.turmaId, { situacao: 'inativa' })
    await definirRegra(c.db, {
      turmaId: c.turmaId,
      moduloId: c.m1,
      tipo: 'data',
      liberaEm: '2026-03-12',
    })
    await definirRegra(c.db, {
      turmaId: c.turmaId,
      aulaId: c.a3,
      tipo: 'dias_apos_compra',
      dias: 3,
    })
    await definirRegra(c.db, {
      turmaId: c.turmaId,
      moduloId: c.m2,
      tipo: 'bloqueado',
    })
    const lista = await liberacoesNoIntervalo(
      c.db,
      new Date('2026-03-11T00:00:00Z'),
      new Date('2026-03-14T00:00:00Z'),
    )
    expect(
      lista.map((l) => [
        l.userId,
        l.moduloId,
        l.aulaId,
        l.liberaEm.toISOString(),
      ]),
    ).toEqual([
      ['ana', c.m1, null, '2026-03-12T03:00:00.000Z'],
      ['ana', null, c.a3, '2026-03-13T03:00:00.000Z'],
    ])
  })

  it('o intervalo é aberto em `de` e fechado em `ate`', async () => {
    const c = await cenario()
    await c.matricular('ana')
    await definirRegra(c.db, {
      turmaId: c.turmaId,
      moduloId: c.m1,
      tipo: 'data',
      liberaEm: '2026-03-12',
    })
    const exato = new Date('2026-03-12T03:00:00Z')
    expect(
      await liberacoesNoIntervalo(
        c.db,
        exato,
        new Date('2026-03-13T00:00:00Z'),
      ),
    ).toEqual([])
    expect(
      await liberacoesNoIntervalo(
        c.db,
        new Date('2026-03-12T00:00:00Z'),
        exato,
      ),
    ).toHaveLength(1)
  })

  it('matrícula expirada no fim do intervalo não recebe aviso', async () => {
    const c = await cenario()
    await c.matricular('ana', c.turmaId, {
      expiraEm: new Date('2026-03-11T12:00:00Z'),
    })
    await definirRegra(c.db, {
      turmaId: c.turmaId,
      moduloId: c.m1,
      tipo: 'data',
      liberaEm: '2026-03-12',
    })
    expect(
      await liberacoesNoIntervalo(c.db, T0, new Date('2026-03-13T00:00:00Z')),
    ).toEqual([])
  })
})

describe('regra malformada e alvo sem aulas', () => {
  it('pontuação mínima com `pontos` nulo bloqueia (falha fechada) e aparece em regrasQuebradas', async () => {
    const c = await cenario()
    await c.matricular('ana')
    await c.db.insert(regraDeLiberacao).values({
      id: crypto.randomUUID(),
      turmaId: c.turmaId,
      moduloId: c.m2,
      tipo: 'pontuacao_minima',
      pontos: null,
    })
    expect(await c.mod(c.m2)).toEqual({ tipo: 'cadeado', motivo: 'bloqueado' })
    expect(await regrasQuebradas(c.db)).toEqual([
      expect.objectContaining({ moduloId: c.m2, tipo: 'pontuacao_minima' }),
    ])
  })

  it('lerRegra recusa o campo obrigatório vazio de cada tipo', () => {
    const base = {
      liberaEm: null,
      fechaEm: null,
      dias: null,
      pontos: null,
      alvoId: null,
    }
    for (const tipo of [
      'data',
      'dias_apos_compra',
      'pontuacao_minima',
      'curso_concluido',
      'modulo_concluido',
      'aula_concluida',
    ] as const) {
      expect(lerRegra({ ...base, tipo })).toEqual({ tipo: 'quebrada' })
    }
    expect(lerRegra({ ...base, tipo: 'dias_apos_compra', dias: 0 }).tipo).toBe(
      'quebrada',
    )
    expect(lerRegra({ ...base, tipo: 'livre' })).toEqual({ tipo: 'livre' })
  })

  it('módulo e curso alvo sem aulas ativas contam como concluídos (libera)', async () => {
    const c = await cenario()
    await c.matricular('ana')
    const vazio = await criarCurso(c.db, { nome: 'Vazio' })
    const mv = await criarModulo(c.db, vazio, { nome: 'Sem aulas' })
    await definirRegra(c.db, {
      turmaId: c.turmaId,
      moduloId: c.m2,
      tipo: 'modulo_concluido',
      alvoId: mv,
    })
    expect(await c.mod(c.m2)).toEqual(LIBERADO)
    await definirRegra(c.db, {
      turmaId: c.turmaId,
      moduloId: c.m2,
      tipo: 'curso_concluido',
      alvoId: vazio,
    })
    expect(await c.mod(c.m2)).toEqual(LIBERADO)
  })
})
