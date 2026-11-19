// Webhook da Hotmart (eventos de pedido, versão 2.0.0): lê o aviso com um parser tolerante e diz que
// efeito ele tem. Só o que é puro mora aqui; gravar e processar é de `src/regras/vendas.ts`, e o
// hottok (cabeçalho `X-HOTMART-HOTTOK`) é conferido com `tokenConfere` de `src/regras/voomp.ts`.
//
// Tolerâncias (campos que a página oficial diz serem opcionais): `shipping`, `affiliates`, `offer`,
// `content`, `currency_conversion`, e tudo de `data` nos eventos de carrinho e de Club.

import { type AvisoInterpretado, AvisoInvalido } from '#/regras/voomp'

export interface AvisoDaHotmart extends AvisoInterpretado {
  /** `id` do evento: a chave de idempotência. */
  eventoId: string
  /**
   * Compra de assinatura (só pagamento único matricula): `data.subscription.plan.id` existe OU
   * `data.purchase.recurrence_number` > 1. O bloco `subscription` solto (só assinante/status) não basta.
   */
  assinatura: boolean
  /** `creation_date` do evento (ms): decide o estado mais recente quando os avisos chegam fora de ordem. */
  criadoEm: number | null
}

type Objeto = Record<string, unknown>

const objeto = (valor: unknown): Objeto =>
  typeof valor === 'object' && valor !== null && !Array.isArray(valor)
    ? (valor as Objeto)
    : {}

function texto(valor: unknown): string | null {
  if (typeof valor === 'number' && Number.isFinite(valor)) return String(valor)
  if (typeof valor !== 'string') return null
  const limpo = valor.trim()
  return limpo === '' || limpo === 'null' ? null : limpo
}

function numero(valor: unknown): number | null {
  const n = typeof valor === 'string' ? Number(valor.trim()) : valor
  return typeof n === 'number' && Number.isFinite(n) ? n : null
}

export function interpretarAvisoHotmart(corpo: string): AvisoDaHotmart {
  let json: unknown
  try {
    json = JSON.parse(corpo)
  } catch {
    throw new AvisoInvalido('O corpo não é um JSON válido.')
  }
  if (typeof json !== 'object' || json === null || Array.isArray(json)) {
    throw new AvisoInvalido('O corpo do aviso não é um objeto JSON.')
  }
  const raiz = json as Objeto
  const eventoId = texto(raiz.id)
  if (!eventoId) throw new AvisoInvalido('O aviso não traz o id do evento.')
  const gatilho = texto(raiz.event)
  if (!gatilho) throw new AvisoInvalido('O aviso não traz o evento (event).')

  const dados = objeto(raiz.data)
  const produto = objeto(dados.product)
  const comprador = objeto(dados.buyer)
  const compra = objeto(dados.purchase)
  const oferta = objeto(compra.offer)
  return {
    eventoId,
    tipo: gatilho.startsWith('PURCHASE_')
      ? 'sale'
      : gatilho.toLowerCase().split('_')[0],
    gatilho,
    vendaId: texto(compra.transaction),
    produtoId: texto(produto.id),
    produtoNome: texto(produto.name),
    ofertaHash: texto(oferta.code),
    email: texto(comprador.email)?.toLowerCase() ?? null,
    nome: texto(comprador.name)?.slice(0, 120) ?? null,
    coVendedores: [],
    boletoUrl: null,
    assinatura:
      texto(objeto(objeto(dados.subscription).plan).id) !== null ||
      (numero(compra.recurrence_number) ?? 0) > 1,
    criadoEm: numero(raiz.creation_date),
  }
}

export type EfeitoDoEventoHotmart = 'pago' | 'estorno' | 'so-gravar'

// `PURCHASE_APPROVED` matricula; `PURCHASE_REFUNDED` e `PURCHASE_CHARGEBACK` tiram a origem. Só
// pagamento único mexe em matrícula (assinatura é gravada). PROTEST, PARTIALLY_REFUNDED e os demais
// só ficam gravados: o acesso não muda.
export function efeitoDoAvisoHotmart(
  aviso: Pick<AvisoDaHotmart, 'gatilho' | 'assinatura'>,
): EfeitoDoEventoHotmart {
  if (aviso.assinatura) return 'so-gravar'
  if (aviso.gatilho === 'PURCHASE_APPROVED') return 'pago'
  if (
    aviso.gatilho === 'PURCHASE_REFUNDED' ||
    aviso.gatilho === 'PURCHASE_CHARGEBACK'
  ) {
    return 'estorno'
  }
  return 'so-gravar'
}

export function motivoSoGravarHotmart(
  aviso: Pick<AvisoDaHotmart, 'gatilho' | 'assinatura'>,
): string {
  return aviso.assinatura
    ? `Só gravado: ${aviso.gatilho} é de assinatura e só o pagamento único matricula.`
    : `Só gravado: ${aviso.gatilho} não mexe em matrícula.`
}
