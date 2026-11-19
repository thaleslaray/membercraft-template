// Webhook da Voomp: lê o aviso (parser tolerante às variações reais) e confere o token. Só o que
// é puro mora aqui; gravar e processar o aviso é de `src/regras/vendas.ts`.
//
// Variações que o parser aceita (capturadas no #21): `coSeller` objeto (venda real) ou lista (botão
// de teste); `boleto_url` e `boleto_barcode` como "#"; ids em número ou texto; `product.offer_hash`
// ausente ou nulo (só as vendas reais trazem); `client`, `product` ou `sale` faltando ou nulos
// (nos gatilhos de assinatura e carrinho vêm quase todos nulos).

export type TipoDeAviso = 'sale' | 'contract' | 'checkout'

export interface CoVendedor {
  nome: string | null
  email: string | null
}

export interface AvisoInterpretado {
  tipo: string
  gatilho: string
  /** Id da venda (`sale.id`). Nulo nos avisos que não são de venda. */
  vendaId: string | null
  produtoId: string | null
  produtoNome: string | null
  /** "Código da oferta" do painel da Voomp; nulo na venda sem oferta. */
  ofertaHash: string | null
  /** Sempre em minúsculas. */
  email: string | null
  nome: string | null
  coVendedores: CoVendedor[]
  /** Nulo quando a Voomp manda "#" no lugar do link. */
  boletoUrl: string | null
}

export class AvisoInvalido extends Error {
  constructor(mensagem: string) {
    super(mensagem)
    this.name = 'AvisoInvalido'
  }
}

type Objeto = Record<string, unknown>

const objeto = (valor: unknown): Objeto =>
  typeof valor === 'object' && valor !== null && !Array.isArray(valor)
    ? (valor as Objeto)
    : {}

// Texto limpo ou nulo. Número vira texto; "", "#" e "null" não são valor.
function texto(valor: unknown): string | null {
  if (typeof valor === 'number' && Number.isFinite(valor)) return String(valor)
  if (typeof valor !== 'string') return null
  const limpo = valor.trim()
  return limpo === '' || limpo === '#' || limpo === 'null' ? null : limpo
}

function coVendedores(valor: unknown): CoVendedor[] {
  const itens = Array.isArray(valor) ? valor : [valor]
  const lista: CoVendedor[] = []
  for (const item of itens) {
    const o = objeto(item)
    const nome = texto(o.name)
    const email = texto(o.email)?.toLowerCase() ?? null
    if (nome || email) lista.push({ nome, email })
  }
  return lista
}

function tipoPeloGatilho(gatilho: string): string | null {
  for (const tipo of ['sale', 'contract', 'checkout']) {
    if (gatilho.startsWith(tipo)) return tipo
  }
  return null
}

export function interpretarAviso(corpo: string): AvisoInterpretado {
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
  const gatilho = texto(raiz.trigger)
  if (!gatilho) throw new AvisoInvalido('O aviso não traz o gatilho (trigger).')
  const tipo = texto(raiz.type) ?? tipoPeloGatilho(gatilho)
  if (!tipo) throw new AvisoInvalido('O aviso não traz o tipo (type).')

  const produto = objeto(raiz.product)
  const cliente = objeto(raiz.client)
  const venda = objeto(raiz.sale)
  return {
    tipo,
    gatilho,
    vendaId: texto(venda.id),
    produtoId: texto(produto.id),
    produtoNome: texto(produto.name),
    ofertaHash: texto(produto.offer_hash),
    email: texto(cliente.email)?.toLowerCase() ?? null,
    nome: texto(cliente.name)?.slice(0, 120) ?? null,
    coVendedores: coVendedores(raiz.coSeller),
    boletoUrl: texto(venda.boleto_url),
  }
}

/** Gatilhos de venda que mexem em matrícula; os demais só ficam gravados. */
export type EfeitoDoGatilho = 'pago' | 'estorno' | 'so-gravar'

export function efeitoDoAviso(aviso: {
  tipo: string
  gatilho: string
}): EfeitoDoGatilho {
  if (aviso.tipo !== 'sale') return 'so-gravar'
  if (aviso.gatilho === 'salePaid') return 'pago'
  if (aviso.gatilho === 'saleRefunded' || aviso.gatilho === 'saleChargedback') {
    return 'estorno'
  }
  return 'so-gravar'
}

// Comparação em tempo constante: o tempo da resposta não diz quantos caracteres batem.
export function tokenConfere(
  recebido: string | null,
  esperado: string | undefined,
): boolean {
  // Sem segredo configurado, recusa tudo (falha fechada).
  if (!esperado || recebido === null) return false
  const a = new TextEncoder().encode(recebido)
  const b = new TextEncoder().encode(esperado)
  let diferenca = a.length ^ b.length
  const tamanho = Math.max(a.length, b.length)
  for (let i = 0; i < tamanho; i++) diferenca |= (a[i] ?? 0) ^ (b[i] ?? 0)
  return diferenca === 0
}

export async function hashDoCorpo(corpo: string): Promise<string> {
  const resumo = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(corpo),
  )
  return Array.from(new Uint8Array(resumo), (b) =>
    b.toString(16).padStart(2, '0'),
  ).join('')
}
