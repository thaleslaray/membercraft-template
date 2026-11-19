import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import {
  avisoDeVenda,
  conferenciaHotmart,
  matricula,
  origemDaMatricula,
} from '#/db/schema'
import {
  conferirHistoricoHotmart,
  listarConferenciasHotmart,
} from '#/regras/conferencia-hotmart'
import { criarCurso } from '#/regras/conteudo'
import { ErroDaHotmart } from '#/regras/hotmart-api'
import { criarTurma } from '#/regras/matricula'
import { gravarAviso, ligarProduto, processarAviso } from '#/regras/vendas'
import { criarBancoDeTeste } from '#/test/banco'
import { corpoDaFixtureHotmart } from '#/test/fixtures/hotmart'

const AGORA = new Date('2026-11-13T12:00:00Z')
const agora = () => AGORA
const PRODUTO = '9000001'
const DIA = 86_400_000

type Chamada = { caminho: string; query: Record<string, unknown> }

type Item = {
  product?: { id?: number; name?: string }
  buyer?: { email?: string; name?: string }
  purchase?: Record<string, unknown>
}

function item(
  transacao: string,
  status: string,
  extra: { subscription?: boolean; oferta?: string | null; data?: number } = {},
): Item {
  const data = extra.data ?? AGORA.getTime() - DIA / 2
  return {
    product: { id: Number(PRODUTO), name: 'Curso H' },
    buyer: { email: `${transacao.toLowerCase()}@exemplo.test`, name: 'Ana' },
    purchase: {
      transaction: transacao,
      order_date: data - 1000,
      approved_date: data,
      status,
      is_subscription: extra.subscription ?? false,
      ...(extra.oferta === null
        ? {}
        : { offer: { code: extra.oferta ?? 'of1' } }),
    },
  }
}

// Histórico falso: por status, devolve os itens em páginas de `porPagina`, só na primeira janela.
function clienteFalso(
  porStatus: Record<string, Item[]>,
  opcoes: { porPagina?: number; falharEm?: number } = {},
) {
  const chamadas: Chamada[] = []
  const entregues = new Set<string>()
  return {
    chamadas,
    cliente: {
      chamar: async <T>(
        caminho: string,
        c: { query?: Record<string, string | number | undefined> } = {},
      ): Promise<T> => {
        chamadas.push({ caminho, query: c.query ?? {} })
        if (opcoes.falharEm === chamadas.length) {
          throw new ErroDaHotmart('A Hotmart está com problema.', 502)
        }
        const status = String(c.query?.transaction_status)
        const todos = porStatus[status] ?? []
        const tamanho = opcoes.porPagina ?? 500
        const pagina = c.query?.page_token ? Number(c.query.page_token) : 0
        if (pagina === 0 && entregues.has(status)) {
          return { items: [], page_info: {} } as T
        }
        entregues.add(status)
        const fatia = todos.slice(pagina * tamanho, (pagina + 1) * tamanho)
        const temMais = (pagina + 1) * tamanho < todos.length
        return {
          items: fatia,
          page_info: { next_page_token: temMais ? String(pagina + 1) : null },
        } as T
      },
    },
  }
}

async function cenario(ligar = true) {
  const db = await criarBancoDeTeste()
  const cursoId = await criarCurso(db, { nome: 'Curso H' })
  const turmaId = await criarTurma(db, {
    cursoId,
    nome: 'Turma H',
    prazoEmDias: 365,
  })
  if (ligar) {
    await ligarProduto(db, agora, {
      gateway: 'hotmart',
      produtoId: PRODUTO,
      turmaId,
    })
  }
  return { db, turmaId }
}

const rodar = (
  db: Awaited<ReturnType<typeof criarBancoDeTeste>>,
  falso: ReturnType<typeof clienteFalso>,
) =>
  conferirHistoricoHotmart(db, agora, falso.cliente, {
    origem: 'cron',
    dias: 2,
  })

describe('conferência da Hotmart', () => {
  it('pede de propósito os quatro status, max_results=500 e janelas curtas de data', async () => {
    const { db } = await cenario()
    const falso = clienteFalso({})
    await rodar(db, falso)
    const status = new Set(
      falso.chamadas.map((c) => c.query.transaction_status),
    )
    expect(status).toEqual(
      new Set(['APPROVED', 'COMPLETE', 'REFUNDED', 'CHARGEBACK']),
    )
    // dias: 2 em APPROVED/COMPLETE; estorno consulta 60 dias (a janela maior vale).
    expect(falso.chamadas).toHaveLength(2 * 2 + 60 * 2)
    for (const c of falso.chamadas) {
      expect(c.caminho).toBe('/payments/api/v1/sales/history')
      expect(c.query.max_results).toBe(500)
      expect(
        Number(c.query.end_date) - Number(c.query.start_date),
      ).toBeLessThanOrEqual(DIA)
    }
    const inicioDe = (st: string) =>
      Math.min(
        ...falso.chamadas
          .filter((c) => c.query.transaction_status === st)
          .map((c) => Number(c.query.start_date)),
      )
    expect(inicioDe('APPROVED')).toBe(AGORA.getTime() - 2 * DIA)
    expect(inicioDe('COMPLETE')).toBe(AGORA.getTime() - 2 * DIA)
    expect(inicioDe('REFUNDED')).toBe(AGORA.getTime() - 60 * DIA)
    expect(inicioDe('CHARGEBACK')).toBe(AGORA.getTime() - 60 * DIA)
    expect(
      Math.max(...falso.chamadas.map((c) => Number(c.query.end_date))),
    ).toBe(AGORA.getTime())
  })

  it('estorno de venda do dia 20 atrás é achado na janela de 60 dias; aprovação continua em 5', async () => {
    const { db } = await cenario()
    // A venda de 20 dias atrás entrou por webhook e matriculou; o estorno de hoje só chega pela conferência.
    const aprovada = corpoDaFixtureHotmart('purchase-approved', (a) => {
      a.creation_date = AGORA.getTime() - 20 * DIA
      a.data.product.id = Number(PRODUTO)
      a.data.purchase.transaction = 'HP80'
    })
    const g = await gravarAviso(db, agora, aprovada, 'hotmart')
    await processarAviso(db, agora, g.id)
    expect(await db.select().from(matricula)).toHaveLength(1)

    // API que filtra pela data da venda dentro de [start_date, end_date).
    const antiga = AGORA.getTime() - 20 * DIA
    const itens: Record<string, Item[]> = {
      REFUNDED: [item('HP80', 'REFUNDED', { data: antiga })],
      APPROVED: [item('HP81', 'APPROVED', { data: antiga })],
    }
    const chamadas: Chamada[] = []
    const cliente = {
      chamar: async <T>(
        caminho: string,
        c: { query?: Record<string, string | number | undefined> } = {},
      ): Promise<T> => {
        const q = c.query ?? {}
        chamadas.push({ caminho, query: q })
        const doStatus = itens[String(q.transaction_status)] ?? []
        const dentro = doStatus.filter((i) => {
          const d = Number(i.purchase?.approved_date)
          return d >= Number(q.start_date) && d < Number(q.end_date)
        })
        return { items: dentro, page_info: {} } as T
      },
    }
    const r = await conferirHistoricoHotmart(db, agora, cliente, {
      origem: 'cron',
    })
    expect(r.consultadas).toBe(1)
    expect(r.recuperadas).toBe(1)
    const [m] = await db.select().from(matricula)
    expect(m.situacao).toBe('inativa')
    const diasDe = (st: string) =>
      chamadas.filter((c) => c.query.transaction_status === st).length
    expect(diasDe('APPROVED')).toBe(5)
    expect(diasDe('COMPLETE')).toBe(5)
    expect(diasDe('REFUNDED')).toBe(60)
    expect(diasDe('CHARGEBACK')).toBe(60)
  })

  it('segue o cursor page_token até acabar', async () => {
    const { db } = await cenario()
    const falso = clienteFalso(
      {
        APPROVED: [
          item('HP1', 'APPROVED'),
          item('HP2', 'APPROVED'),
          item('HP3', 'APPROVED'),
        ],
      },
      { porPagina: 2 },
    )
    const r = await rodar(db, falso)
    expect(r.recuperadas).toBe(3)
    const doAprovado = falso.chamadas.filter(
      (c) => c.query.transaction_status === 'APPROVED',
    )
    expect(doAprovado.some((c) => c.query.page_token === '1')).toBe(true)
  })

  it('venda aprovada (APPROVED) e completa (COMPLETE) viram matrícula pelo caminho do webhook', async () => {
    const { db } = await cenario()
    const falso = clienteFalso({
      APPROVED: [item('HP10', 'APPROVED')],
      COMPLETE: [item('HP11', 'COMPLETE')],
    })
    const r = await rodar(db, falso)
    expect(r).toMatchObject({ consultadas: 2, recuperadas: 2, comErro: 0 })
    const origens = await db.select().from(origemDaMatricula)
    expect(origens.map((o) => o.vendaId).sort()).toEqual([
      'hotmart:HP10',
      'hotmart:HP11',
    ])
    const avisos = await db.select().from(avisoDeVenda)
    expect(avisos.every((a) => a.gateway === 'hotmart')).toBe(true)
  })

  it('não tem efeito duplo: segunda execução e aviso de webhook da mesma transação', async () => {
    const { db } = await cenario()
    const webhook = corpoDaFixtureHotmart('purchase-approved', (a) => {
      a.data.product.id = Number(PRODUTO)
      a.data.buyer.email = 'hp20@exemplo.test'
      a.data.purchase.transaction = 'HP20'
    })
    const g = await gravarAviso(db, agora, webhook, 'hotmart')
    await processarAviso(db, agora, g.id)
    const falso = () =>
      clienteFalso({
        APPROVED: [item('HP20', 'APPROVED'), item('HP21', 'APPROVED')],
      })
    const r1 = await rodar(db, falso())
    expect(r1).toMatchObject({
      consultadas: 2,
      recuperadas: 1,
      jaProcessadas: 1,
    })
    const r2 = await rodar(db, falso())
    expect(r2).toMatchObject({ recuperadas: 0, jaProcessadas: 2 })
    expect(await db.select().from(origemDaMatricula)).toHaveLength(2)
    expect(await db.select().from(matricula)).toHaveLength(2)
  })

  it('reembolso e chargeback tiram a origem e inativam a matrícula', async () => {
    const { db } = await cenario()
    await rodar(
      db,
      clienteFalso({
        APPROVED: [item('HP30', 'APPROVED'), item('HP31', 'APPROVED')],
      }),
    )
    expect(
      (await db.select().from(matricula)).every((m) => m.situacao === 'ativa'),
    ).toBe(true)
    const r = await rodar(
      db,
      clienteFalso({
        REFUNDED: [item('HP30', 'REFUNDED')],
        CHARGEBACK: [item('HP31', 'CHARGEBACK')],
      }),
    )
    expect(r.recuperadas).toBe(2)
    expect(
      (await db.select().from(matricula)).every(
        (m) => m.situacao === 'inativa',
      ),
    ).toBe(true)
  })

  it('estorno de webhook mais novo que a data da venda vence a aprovação recuperada', async () => {
    const { db } = await cenario()
    const estorno = corpoDaFixtureHotmart('purchase-refunded', (a) => {
      a.creation_date = AGORA.getTime()
      a.data.product.id = Number(PRODUTO)
      a.data.purchase.transaction = 'HP40'
    })
    const g = await gravarAviso(db, agora, estorno, 'hotmart')
    await processarAviso(db, agora, g.id)
    const r = await rodar(
      db,
      clienteFalso({ APPROVED: [item('HP40', 'APPROVED')] }),
    )
    expect(r.ignoradas).toBe(1)
    expect(r.recuperadas).toBe(0)
    expect(await db.select().from(matricula)).toHaveLength(0)
  })

  it('ignora assinatura e item sem transação, e usa o produto inteiro quando falta a oferta', async () => {
    const { db } = await cenario()
    const r = await rodar(
      db,
      clienteFalso({
        APPROVED: [
          item('HP50', 'APPROVED', { subscription: true }),
          item('HP51', 'APPROVED', { oferta: null }),
          item('', 'APPROVED'),
        ],
      }),
    )
    expect(r).toMatchObject({ consultadas: 3, recuperadas: 1, ignoradas: 2 })
    expect(
      (await db.select().from(origemDaMatricula)).map((o) => o.vendaId),
    ).toEqual(['hotmart:HP51'])
  })

  it('produto sem ligação conta "sem turma"', async () => {
    const { db } = await cenario(false)
    const r = await rodar(
      db,
      clienteFalso({ APPROVED: [item('HP60', 'APPROVED')] }),
    )
    expect(r).toMatchObject({ recuperadas: 0, semTurma: 1 })
  })

  it('registra cada execução com totais e o que foi recuperado', async () => {
    const { db } = await cenario()
    await rodar(db, clienteFalso({ APPROVED: [item('HP70', 'APPROVED')] }))
    const lista = await listarConferenciasHotmart(db)
    expect(lista).toHaveLength(1)
    expect(lista[0]).toMatchObject({
      situacao: 'ok',
      origem: 'cron',
      consultadas: 1,
      recuperadas: 1,
    })
    expect(lista[0].detalhes).toEqual([
      expect.objectContaining({
        transacao: 'HP70',
        status: 'APPROVED',
        resultado: 'recuperada',
      }),
    ])
  })

  it('falha da API: registra "falhou" com o que já fez e relança para o alerta técnico', async () => {
    const { db } = await cenario()
    const falso = clienteFalso(
      { APPROVED: [item('HP80', 'APPROVED')] },
      { falharEm: 3 },
    )
    await expect(rodar(db, falso)).rejects.toThrow(
      'A Hotmart está com problema.',
    )
    const [l] = await db.select().from(conferenciaHotmart)
    expect(l).toMatchObject({ situacao: 'falhou', recuperadas: 1 })
    expect(l.erro).toContain('A Hotmart está com problema.')
    expect(
      await db
        .select()
        .from(avisoDeVenda)
        .where(eq(avisoDeVenda.vendaId, 'HP80')),
    ).toHaveLength(1)
  })
})
