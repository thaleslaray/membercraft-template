// Conferência diária da Hotmart (#134): consulta o histórico de vendas da API e aplica, pelo MESMO
// caminho do webhook (`gravarAviso` + `processarAviso`), as compras aprovadas e os estornos que o aviso
// não trouxe. Cada item da API vira um aviso sintético no formato do webhook 2.0.0.
//
// - Sem filtro a API só devolve APPROVED e COMPLETE: pedimos de propósito os quatro status, um por chamada.
// - Janelas de um dia e `max_results=500` (o histórico dá 502 depois de 30 s); paginação por `page_token`.
// - APPROVED e COMPLETE olham 5 dias para trás; REFUNDED e CHARGEBACK olham 60 (`DIAS_ESTORNO`).
// - Sem efeito duplo: se já existe aviso (webhook ou conferência anterior) da mesma transação e do mesmo
//   gatilho, o item só conta como "já processado"; e `aplicarVendaPaga`/`aplicarEstorno` já são idempotentes.
// - Data do aviso sintético: aprovação usa a data da venda (`approved_date`/`order_date`), para não
//   atropelar um estorno de webhook mais novo; estorno usa o instante da conferência, porque o status da
//   API é o estado atual e vale mais que qualquer aprovação já gravada.
// - Assinatura (`is_subscription`) é ignorada. Sem código de oferta, vale a ligação do produto inteiro.

import { and, desc, eq } from 'drizzle-orm'
import { avisoDeVenda, conferenciaHotmart } from '#/db/schema'
import { type Banco, comoLibsql, type Relogio } from '#/regras/tipos'
import type { OpcoesDeProcessamento } from '#/regras/vendas'
import { gravarAviso, processarAviso } from '#/regras/vendas'

const CAMINHO = '/payments/api/v1/sales/history'
const DIA_MS = 86_400_000
const DIAS_PADRAO = 5
// Estorno e chargeback chegam semanas depois da venda: consultam uma janela maior que a da aprovação.
const DIAS_ESTORNO = 60
const MAX_RESULTADOS = 500
const MAX_PAGINAS = 50
const MAX_DETALHES = 200

const STATUS_PEDIDOS = [
  'APPROVED',
  'COMPLETE',
  'REFUNDED',
  'CHARGEBACK',
] as const
const GATILHO_DO_STATUS: Record<string, string> = {
  APPROVED: 'PURCHASE_APPROVED',
  COMPLETE: 'PURCHASE_APPROVED',
  REFUNDED: 'PURCHASE_REFUNDED',
  CHARGEBACK: 'PURCHASE_CHARGEBACK',
}

export interface ClienteDoHistorico {
  chamar: <T = unknown>(
    caminho: string,
    chamada?: { query?: Record<string, string | number | undefined> },
  ) => Promise<T>
}

export type ResultadoDoItem =
  | 'recuperada'
  | 'sem_turma'
  | 'ignorada'
  | 'com_erro'

export interface DetalheDaConferencia {
  transacao: string
  status: string
  resultado: ResultadoDoItem
  motivo: string | null
}

export interface TotaisDaConferenciaHotmart {
  consultadas: number
  recuperadas: number
  jaProcessadas: number
  semTurma: number
  ignoradas: number
  comErro: number
}

export interface ResumoDaConferenciaHotmart extends TotaisDaConferenciaHotmart {
  id: string
  detalhes: DetalheDaConferencia[]
}

export interface OpcoesDaConferenciaHotmart extends OpcoesDeProcessamento {
  origem: 'cron' | 'manual'
  /** Quantos dias para trás consultar aprovações (padrão 5); estornos olham no mínimo 60. */
  dias?: number
}

type Obj = Record<string, unknown>
const obj = (v: unknown): Obj =>
  typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Obj) : {}
const txt = (v: unknown): string | null => {
  if (typeof v === 'number' && Number.isFinite(v)) return String(v)
  if (typeof v !== 'string') return null
  const t = v.trim()
  return t === '' ? null : t
}
const num = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : null

// Aviso sintético no formato do webhook 2.0.0, só com o que o caminho de vendas lê.
function avisoSintetico(
  item: Obj,
  transacao: string,
  gatilho: string,
  criadoEm: number,
): string {
  const produto = obj(item.product)
  const comprador = obj(item.buyer)
  const compra = obj(item.purchase)
  const oferta = txt(obj(compra.offer).code)
  return JSON.stringify({
    id: `conferencia:${transacao}:${gatilho}`,
    event: gatilho,
    version: '2.0.0',
    creation_date: criadoEm,
    data: {
      product: { id: produto.id, name: produto.name },
      buyer: { email: comprador.email, name: comprador.name },
      purchase: {
        transaction: transacao,
        ...(oferta ? { offer: { code: oferta } } : {}),
      },
    },
  })
}

export async function conferirHistoricoHotmart(
  banco: Banco,
  agora: Relogio,
  cliente: ClienteDoHistorico,
  opcoes: OpcoesDaConferenciaHotmart,
): Promise<ResumoDaConferenciaHotmart> {
  const db = comoLibsql(banco)
  const iniciadaEm = agora()
  const dias = opcoes.dias ?? DIAS_PADRAO
  const fim = iniciadaEm.getTime()
  const diasDoEstorno = Math.max(DIAS_ESTORNO, dias)
  const inicio = fim - diasDoEstorno * DIA_MS
  const totais: TotaisDaConferenciaHotmart = {
    consultadas: 0,
    recuperadas: 0,
    jaProcessadas: 0,
    semTurma: 0,
    ignoradas: 0,
    comErro: 0,
  }
  const detalhes: DetalheDaConferencia[] = []
  const anotar = (d: DetalheDaConferencia) => {
    if (detalhes.length < MAX_DETALHES) detalhes.push(d)
  }

  async function conferirItem(bruto: unknown, status: string) {
    totais.consultadas++
    const item = obj(bruto)
    const compra = obj(item.purchase)
    const transacao = txt(compra.transaction)
    const ignorar = (motivo: string) => {
      totais.ignoradas++
      anotar({
        transacao: transacao ?? '(sem transação)',
        status,
        resultado: 'ignorada',
        motivo,
      })
    }
    if (!transacao) return ignorar('O item não traz a transação.')
    if (compra.is_subscription === true) {
      return ignorar('Assinatura: só pagamento único matricula.')
    }
    if (!obj(item.product).id) return ignorar('O item não traz o produto.')
    const gatilho = GATILHO_DO_STATUS[status]
    const ja = await db
      .select({ id: avisoDeVenda.id })
      .from(avisoDeVenda)
      .where(
        and(
          eq(avisoDeVenda.gateway, 'hotmart'),
          eq(avisoDeVenda.vendaId, transacao),
          eq(avisoDeVenda.gatilho, gatilho),
        ),
      )
      .limit(1)
    if (ja.length > 0) {
      totais.jaProcessadas++
      return
    }
    const estorno = gatilho !== 'PURCHASE_APPROVED'
    const criadoEm = estorno
      ? fim
      : (num(compra.approved_date) ?? num(compra.order_date) ?? fim)
    const gravado = await gravarAviso(
      banco,
      agora,
      avisoSintetico(item, transacao, gatilho, criadoEm),
      'hotmart',
    )
    if (gravado.invalido || !gravado.enfileirar) {
      totais.jaProcessadas++
      return
    }
    try {
      const r = await processarAviso(banco, agora, gravado.id, opcoes)
      if (r.situacao === 'aplicada') {
        totais.recuperadas++
        anotar({ transacao, status, resultado: 'recuperada', motivo: r.motivo })
      } else if (r.situacao === 'sem_turma') {
        totais.semTurma++
        anotar({ transacao, status, resultado: 'sem_turma', motivo: r.motivo })
      } else if (r.situacao === 'com_erro') {
        totais.comErro++
        anotar({ transacao, status, resultado: 'com_erro', motivo: r.motivo })
      } else {
        totais.ignoradas++
        anotar({ transacao, status, resultado: 'ignorada', motivo: r.motivo })
      }
    } catch (erro) {
      totais.comErro++
      anotar({
        transacao,
        status,
        resultado: 'com_erro',
        motivo: erro instanceof Error ? erro.message : String(erro),
      })
    }
  }

  let falha: unknown = null
  try {
    for (const status of STATUS_PEDIDOS) {
      const estorno = GATILHO_DO_STATUS[status] !== 'PURCHASE_APPROVED'
      const doStatus = fim - (estorno ? diasDoEstorno : dias) * DIA_MS
      for (let de = doStatus; de < fim; de += DIA_MS) {
        const ate = Math.min(de + DIA_MS, fim)
        let cursor: string | undefined
        for (let p = 0; p < MAX_PAGINAS; p++) {
          const pagina = await cliente.chamar<{
            items?: unknown[]
            page_info?: { next_page_token?: string | null }
          }>(CAMINHO, {
            query: {
              transaction_status: status,
              start_date: de,
              end_date: ate,
              max_results: MAX_RESULTADOS,
              page_token: cursor,
            },
          })
          for (const bruto of pagina.items ?? []) {
            await conferirItem(bruto, status)
          }
          cursor = pagina.page_info?.next_page_token ?? undefined
          if (!cursor) break
        }
      }
    }
  } catch (erro) {
    falha = erro
  }

  const id = crypto.randomUUID()
  const mensagem =
    falha === null
      ? null
      : falha instanceof Error
        ? falha.message
        : String(falha)
  await db.insert(conferenciaHotmart).values({
    id,
    origem: opcoes.origem,
    situacao: falha === null ? 'ok' : 'falhou',
    iniciadaEm,
    concluidaEm: agora(),
    janelaInicio: new Date(inicio),
    janelaFim: new Date(fim),
    ...totais,
    erro: mensagem,
    detalhes: JSON.stringify(detalhes),
  })
  if (falha !== null) throw falha
  return { id, ...totais, detalhes }
}

export interface ConferenciaHotmartListada extends TotaisDaConferenciaHotmart {
  id: string
  origem: 'cron' | 'manual'
  situacao: 'ok' | 'falhou'
  iniciadaEm: Date
  janelaInicio: Date
  janelaFim: Date
  erro: string | null
  detalhes: DetalheDaConferencia[]
}

export async function listarConferenciasHotmart(
  banco: Banco,
  limite = 30,
): Promise<ConferenciaHotmartListada[]> {
  const linhas = await comoLibsql(banco)
    .select()
    .from(conferenciaHotmart)
    .orderBy(desc(conferenciaHotmart.iniciadaEm))
    .limit(limite)
  return linhas.map((l) => ({
    id: l.id,
    origem: l.origem,
    situacao: l.situacao,
    iniciadaEm: l.iniciadaEm,
    janelaInicio: l.janelaInicio,
    janelaFim: l.janelaFim,
    consultadas: l.consultadas,
    recuperadas: l.recuperadas,
    jaProcessadas: l.jaProcessadas,
    semTurma: l.semTurma,
    ignoradas: l.ignoradas,
    comErro: l.comErro,
    erro: l.erro,
    detalhes: JSON.parse(l.detalhes) as DetalheDaConferencia[],
  }))
}
