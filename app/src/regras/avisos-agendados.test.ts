import { eq } from 'drizzle-orm'
import { describe, expect, it, vi } from 'vitest'
import { matricula, session, user } from '#/db/schema'
import {
  AJUSTES_PADRAO,
  avisarAcessoExpirando,
  avisarAcessoPronto,
  avisarConteudoLiberado,
  avisarSentimosSuaFalta,
  ErroDeAviso,
  lerAjustes,
  rodarAvisosAgendados,
  salvarAjustes,
} from '#/regras/avisos-agendados'
import { criarAula, criarCurso, criarModulo } from '#/regras/conteudo'
import type { PedidoDeEmail } from '#/regras/envio-de-email'
import { criarTurma } from '#/regras/matricula'
import { avisosDaPessoa } from '#/regras/notificacoes'
import { definirRegra } from '#/regras/regras-de-liberacao'
import { criarBancoDeTeste } from '#/test/banco'

const DIA = 86_400_000
// 10/03/2026, 03:00Z = 00:00 em Brasília.
const T0 = new Date('2026-03-10T03:00:00Z')
let t = T0
const agora = () => t
const em = (dias: number, base = T0) => new Date(base.getTime() + dias * DIA)

async function cenario() {
  t = T0
  const db = await criarBancoDeTeste()
  for (const [id, nome, perfil] of [
    ['ana', 'Ana Souza', 'aluno'],
    ['bia', 'Bia Lima', 'aluno'],
    ['eq', 'Equipe', 'equipe'],
  ] as const) {
    await db
      .insert(user)
      .values({ id, name: nome, email: `${id}@x.test`, perfil })
  }
  const cursoId = await criarCurso(db, { nome: 'Coloração' })
  const m1 = await criarModulo(db, cursoId, { nome: 'Módulo 1' })
  const m2 = await criarModulo(db, cursoId, { nome: 'Módulo 2' })
  const a1 = await criarAula(db, m2, { titulo: 'Aula especial' })
  const turmaId = await criarTurma(db, { cursoId, nome: 'Turma 1' })
  const pedidos: PedidoDeEmail[] = []
  const deps = {
    pedirEmail: vi.fn(async (p: PedidoDeEmail) => {
      pedidos.push(p)
    }),
  }
  const matricular = async (
    userId: string,
    extra: Partial<typeof matricula.$inferInsert> = {},
  ) => {
    const id = crypto.randomUUID()
    await db
      .insert(matricula)
      .values({ id, userId, turmaId, iniciaEm: T0, ...extra })
    return id
  }
  const entrou = async (userId: string, quando: Date) => {
    await db.insert(session).values({
      id: crypto.randomUUID(),
      userId,
      token: crypto.randomUUID(),
      expiresAt: em(30, quando),
      createdAt: quando,
      updatedAt: quando,
    })
  }
  return { db, cursoId, m1, m2, a1, turmaId, pedidos, deps, matricular, entrou }
}

describe('ajustes dos dias', () => {
  it('sem nada salvo valem 7, 3 e 14 dias', async () => {
    const { db } = await cenario()
    expect(await lerAjustes(db)).toEqual({
      diasAcessoExpirando: 7,
      diasAcessoPronto: 3,
      diasSentimosSuaFalta: 14,
      acessoProntoLigado: true,
      sentimosSuaFaltaLigado: true,
    })
    expect(AJUSTES_PADRAO.diasSentimosSuaFalta).toBe(14)
  })

  it('a equipe ajusta e o valor vale na leitura seguinte', async () => {
    const { db } = await cenario()
    await salvarAjustes(db, agora, {
      diasAcessoExpirando: 10,
      diasAcessoPronto: 2,
      diasSentimosSuaFalta: 21,
      acessoProntoLigado: true,
      sentimosSuaFaltaLigado: true,
    })
    await salvarAjustes(db, agora, {
      diasAcessoExpirando: 5,
      diasAcessoPronto: 2,
      diasSentimosSuaFalta: 21,
      acessoProntoLigado: true,
      sentimosSuaFaltaLigado: true,
    })
    expect(await lerAjustes(db)).toEqual({
      diasAcessoExpirando: 5,
      diasAcessoPronto: 2,
      diasSentimosSuaFalta: 21,
      acessoProntoLigado: true,
      sentimosSuaFaltaLigado: true,
    })
  })

  it('recusa dias que não são inteiros de 1 a 365 e não salva nada', async () => {
    const { db } = await cenario()
    for (const ruim of [0, -1, 1.5, 366, Number.NaN]) {
      await expect(
        salvarAjustes(db, agora, {
          diasAcessoExpirando: 7,
          diasAcessoPronto: ruim,
          diasSentimosSuaFalta: 14,
          acessoProntoLigado: true,
          sentimosSuaFaltaLigado: true,
        }),
      ).rejects.toBeInstanceOf(ErroDeAviso)
    }
    expect((await lerAjustes(db)).diasAcessoExpirando).toBe(7)
  })
})

describe('conteúdo liberado', () => {
  it('avisa no sininho e por e-mail quem tem matrícula ativa, só no dia da liberação', async () => {
    const c = await cenario()
    await c.matricular('ana')
    await c.matricular('bia', { situacao: 'inativa' })
    await definirRegra(c.db, {
      turmaId: c.turmaId,
      moduloId: c.m2,
      tipo: 'data',
      liberaEm: '2026-03-12',
    })
    // Primeira execução (dia 10): marco novo, nada abre ainda.
    expect(await avisarConteudoLiberado(c.db, agora, c.deps)).toBe(0)
    // Dia 11: ainda não.
    t = em(1)
    expect(await avisarConteudoLiberado(c.db, agora, c.deps)).toBe(0)
    // Dia 12, 00:00 em Brasília.
    t = em(2)
    expect(await avisarConteudoLiberado(c.db, agora, c.deps)).toBe(1)
    const { avisos } = await avisosDaPessoa(c.db, 'ana')
    expect(avisos).toHaveLength(1)
    expect(avisos[0]).toMatchObject({
      tipo: 'conteudo-liberado',
      texto: 'Módulo 2 de Coloração foi liberado.',
      link: `/cursos/${c.cursoId}`,
    })
    expect(c.pedidos).toEqual([
      {
        tipo: 'conteudo-liberado',
        para: 'ana@x.test',
        userId: 'ana',
        variaveis: { nome: 'Ana', curso: 'Coloração', conteudo: 'Módulo 2' },
      },
    ])
    expect((await avisosDaPessoa(c.db, 'bia')).naoLidas).toBe(0)
  })

  it('não repete: o último instante processado fica guardado', async () => {
    const c = await cenario()
    await c.matricular('ana')
    await definirRegra(c.db, {
      turmaId: c.turmaId,
      moduloId: c.m2,
      tipo: 'data',
      liberaEm: '2026-03-12',
    })
    await avisarConteudoLiberado(c.db, agora, c.deps)
    t = em(2)
    expect(await avisarConteudoLiberado(c.db, agora, c.deps)).toBe(1)
    expect(await avisarConteudoLiberado(c.db, agora, c.deps)).toBe(0)
    t = em(3)
    expect(await avisarConteudoLiberado(c.db, agora, c.deps)).toBe(0)
    expect(c.pedidos).toHaveLength(1)
  })

  it('uma execução atrasada recupera o que abriu no intervalo todo', async () => {
    const c = await cenario()
    await c.matricular('ana')
    await definirRegra(c.db, {
      turmaId: c.turmaId,
      moduloId: c.m2,
      tipo: 'data',
      liberaEm: '2026-03-11',
    })
    await avisarConteudoLiberado(c.db, agora, c.deps)
    // O cron ficou parado 3 dias.
    t = em(3)
    expect(await avisarConteudoLiberado(c.db, agora, c.deps)).toBe(1)
  })

  it('aula liberada por dias após a compra: o texto nomeia a aula e o link leva a ela', async () => {
    const c = await cenario()
    await c.matricular('ana')
    await definirRegra(c.db, {
      turmaId: c.turmaId,
      aulaId: c.a1,
      tipo: 'dias_apos_compra',
      dias: 3,
    })
    await avisarConteudoLiberado(c.db, agora, c.deps)
    t = em(3)
    expect(await avisarConteudoLiberado(c.db, agora, c.deps)).toBe(1)
    expect((await avisosDaPessoa(c.db, 'ana')).avisos[0]).toMatchObject({
      texto: 'Aula especial de Coloração foi liberado.',
      link: `/aulas/${c.a1}`,
    })
  })
})

describe('acesso expirando', () => {
  it('avisa 7 dias antes, uma vez, no sininho e por e-mail', async () => {
    const c = await cenario()
    await c.matricular('ana', { expiraEm: em(7) })
    await c.matricular('bia', { expiraEm: em(8) })
    expect(await avisarAcessoExpirando(c.db, agora, c.deps, 7)).toBe(1)
    expect(await avisarAcessoExpirando(c.db, agora, c.deps, 7)).toBe(0)
    expect(c.pedidos).toHaveLength(1)
    expect(c.pedidos[0]).toMatchObject({
      tipo: 'acesso-expirando',
      para: 'ana@x.test',
      variaveis: { nome: 'Ana', curso: 'Coloração', data: '17/03/2026' },
    })
    expect((await avisosDaPessoa(c.db, 'ana')).avisos[0]?.texto).toBe(
      'Seu acesso a Coloração expira em 17/03/2026.',
    )
    // Amanhã a Bia entra na janela de 7 dias.
    t = em(1)
    expect(await avisarAcessoExpirando(c.db, agora, c.deps, 7)).toBe(1)
  })

  it('os dias são ajustáveis', async () => {
    const c = await cenario()
    await c.matricular('ana', { expiraEm: em(10) })
    expect(await avisarAcessoExpirando(c.db, agora, c.deps, 7)).toBe(0)
    expect(await avisarAcessoExpirando(c.db, agora, c.deps, 10)).toBe(1)
  })

  it('ignora vitalícia, já expirada e inativa', async () => {
    const c = await cenario()
    await c.matricular('ana', { expiraEm: null })
    await c.matricular('bia', { expiraEm: em(-1) })
    await c.matricular('eq', { expiraEm: em(3), situacao: 'inativa' })
    expect(await avisarAcessoExpirando(c.db, agora, c.deps, 7)).toBe(0)
  })

  it('prorrogar abre um ciclo novo: avisa de novo para a data nova', async () => {
    const c = await cenario()
    const id = await c.matricular('ana', { expiraEm: em(5) })
    expect(await avisarAcessoExpirando(c.db, agora, c.deps, 7)).toBe(1)
    await c.db
      .update(matricula)
      .set({ expiraEm: em(40) })
      .where(eq(matricula.id, id))
    t = em(34)
    expect(await avisarAcessoExpirando(c.db, agora, c.deps, 7)).toBe(1)
  })
})

describe('seu acesso está pronto', () => {
  it('avisa por e-mail quem nunca entrou, 3 dias depois da matrícula, uma vez', async () => {
    const c = await cenario()
    await c.matricular('ana')
    t = em(2)
    expect(await avisarAcessoPronto(c.db, agora, c.deps, 3)).toBe(0)
    t = em(3)
    expect(await avisarAcessoPronto(c.db, agora, c.deps, 3)).toBe(1)
    expect(c.pedidos).toEqual([
      {
        tipo: 'acesso-pronto',
        para: 'ana@x.test',
        userId: 'ana',
        variaveis: { nome: 'Ana' },
      },
    ])
    t = em(4)
    expect(await avisarAcessoPronto(c.db, agora, c.deps, 3)).toBe(0)
  })

  it('não avisa quem já entrou (sessão ou aceite dos termos)', async () => {
    const c = await cenario()
    await c.matricular('ana')
    await c.matricular('bia')
    await c.entrou('ana', em(1))
    await c.db
      .update(user)
      .set({ termosAceitoEm: em(1), termosVersao: '1' })
      .where(eq(user.id, 'bia'))
    t = em(3)
    expect(await avisarAcessoPronto(c.db, agora, c.deps, 3)).toBe(0)
  })

  it('quem tem várias matrículas recebe um e-mail só, e matrícula muito antiga não dispara', async () => {
    const c = await cenario()
    await c.matricular('ana')
    const outraTurma = await criarTurma(c.db, {
      cursoId: c.cursoId,
      nome: 'Turma 2',
    })
    await c.db.insert(matricula).values({
      id: crypto.randomUUID(),
      userId: 'ana',
      turmaId: outraTurma,
      iniciaEm: T0,
    })
    await c.matricular('bia', { iniciaEm: em(-200) })
    t = em(3)
    expect(await avisarAcessoPronto(c.db, agora, c.deps, 3)).toBe(1)
  })

  it('os dias são ajustáveis', async () => {
    const c = await cenario()
    await c.matricular('ana')
    t = em(1)
    expect(await avisarAcessoPronto(c.db, agora, c.deps, 1)).toBe(1)
  })
})

describe('sentimos sua falta', () => {
  it('avisa quem passou 14 dias sem acessar, uma vez por ciclo', async () => {
    const c = await cenario()
    await c.matricular('ana')
    await c.entrou('ana', T0)
    t = em(13)
    expect(await avisarSentimosSuaFalta(c.db, agora, c.deps, 14)).toBe(0)
    t = em(14)
    expect(await avisarSentimosSuaFalta(c.db, agora, c.deps, 14)).toBe(1)
    expect(c.pedidos[0]).toMatchObject({
      tipo: 'sentimos-sua-falta',
      para: 'ana@x.test',
      variaveis: { nome: 'Ana', dias: '14' },
    })
    expect((await avisosDaPessoa(c.db, 'ana')).avisos[0]).toMatchObject({
      tipo: 'sentimos-sua-falta',
      link: '/',
    })
    t = em(15)
    expect(await avisarSentimosSuaFalta(c.db, agora, c.deps, 14)).toBe(0)
  })

  it('voltar e sumir de novo abre um ciclo novo', async () => {
    const c = await cenario()
    await c.matricular('ana')
    await c.entrou('ana', T0)
    t = em(14)
    await avisarSentimosSuaFalta(c.db, agora, c.deps, 14)
    await c.entrou('ana', em(16))
    t = em(20)
    expect(await avisarSentimosSuaFalta(c.db, agora, c.deps, 14)).toBe(0)
    t = em(30)
    expect(await avisarSentimosSuaFalta(c.db, agora, c.deps, 14)).toBe(1)
  })

  it('só quem tem matrícula ativa, e nunca a equipe', async () => {
    const c = await cenario()
    await c.matricular('ana', { situacao: 'expirada' })
    await c.entrou('ana', T0)
    await c.entrou('bia', T0)
    await c.entrou('eq', T0)
    await c.matricular('eq')
    t = em(14)
    expect(await avisarSentimosSuaFalta(c.db, agora, c.deps, 14)).toBe(0)
  })
})

describe('rodarAvisosAgendados', () => {
  it('não envia o aviso desligado (acesso pronto e sentimos sua falta)', async () => {
    const c = await cenario()
    await c.matricular('bia')
    await c.matricular('ana')
    await c.entrou('ana', T0)
    t = em(14)
    await salvarAjustes(c.db, agora, {
      diasAcessoExpirando: 7,
      diasAcessoPronto: 3,
      diasSentimosSuaFalta: 14,
      acessoProntoLigado: false,
      sentimosSuaFaltaLigado: false,
    })
    expect(await lerAjustes(c.db)).toMatchObject({
      acessoProntoLigado: false,
      sentimosSuaFaltaLigado: false,
    })
    const resumo = await rodarAvisosAgendados(c.db, agora, c.deps)
    expect(resumo.acessoPronto).toBe(0)
    expect(resumo.sentimosSuaFalta).toBe(0)
    expect(c.pedidos).not.toContainEqual(
      expect.objectContaining({ tipo: 'sentimos-sua-falta' }),
    )
    expect(c.pedidos).not.toContainEqual(
      expect.objectContaining({ tipo: 'acesso-pronto' }),
    )
  })

  it('roda os quatro avisos com os dias ajustados', async () => {
    const c = await cenario()
    await c.matricular('ana', { expiraEm: em(30) })
    await salvarAjustes(c.db, agora, {
      diasAcessoExpirando: 30,
      diasAcessoPronto: 3,
      diasSentimosSuaFalta: 14,
      acessoProntoLigado: true,
      sentimosSuaFaltaLigado: true,
    })
    const resumo = await rodarAvisosAgendados(c.db, agora, c.deps)
    expect(resumo.acessoExpirando).toBe(1)
    expect(resumo).toMatchObject({
      conteudoLiberado: 0,
      acessoPronto: 0,
      sentimosSuaFalta: 0,
    })
  })

  it('um aviso que falha não impede os outros; o erro sobe no fim', async () => {
    const c = await cenario()
    await c.matricular('ana', { expiraEm: em(5) })
    const deps = {
      pedirEmail: vi.fn(async (p: PedidoDeEmail) => {
        if (p.tipo === 'acesso-expirando') throw new Error('sem fila')
      }),
    }
    await c.matricular('bia')
    t = em(3)
    await expect(rodarAvisosAgendados(c.db, agora, deps)).rejects.toThrow(
      'acessoExpirando: sem fila',
    )
    // O "acesso pronto" da Bia ainda saiu.
    expect(deps.pedirEmail).toHaveBeenCalledWith(
      expect.objectContaining({ tipo: 'acesso-pronto', userId: 'bia' }),
    )
  })
})
