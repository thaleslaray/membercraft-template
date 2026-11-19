import { type ClienteHotmart, ErroDaHotmart } from '#/regras/hotmart-api'

/**
 * Catálogo da Hotmart para a tela de ligação (#130): produtos (`/products/api/v1/products`) e ofertas
 * de um produto (`/products/api/v1/products/:ucode/offers`), ambos com paginação por cursor
 * (`page_info.next_page_token`). A ligação usa o `id` numérico do produto e o `code` da oferta; o
 * `ucode` só serve para buscar as ofertas.
 */

const POR_PAGINA_DA_API = 50
// Teto de páginas por consulta: protege contra cursor que nunca acaba (limite de 500 chamadas/min).
const MAXIMO_DE_PAGINAS = 20

export type ProdutoDaHotmart = {
  /** `product.id` numérico, como texto: é o `produto_id` da ligação. */
  id: string
  nome: string
  ucode: string
  /** Combo (formato BUNDLE): ligado como pacote, pelo próprio id. */
  combo: boolean
}

export type OfertaDaHotmart = {
  /** Código da oferta: é o `oferta_hash` da ligação. */
  codigo: string
  nome: string
  principal: boolean
  valor: number | null
  moeda: string | null
}

type Pagina<T> = {
  items?: T[]
  page_info?: { next_page_token?: string | null }
}

async function percorrer<T>(
  cliente: ClienteHotmart,
  caminho: string,
): Promise<T[]> {
  const itens: T[] = []
  const vistos = new Set<string>()
  let cursor: string | undefined
  for (let i = 0; i < MAXIMO_DE_PAGINAS; i++) {
    const pagina: Pagina<T> = await cliente.chamar<Pagina<T>>(caminho, {
      query: { max_results: POR_PAGINA_DA_API, page_token: cursor },
    })
    itens.push(...(Array.isArray(pagina.items) ? pagina.items : []))
    const proximo = pagina.page_info?.next_page_token
    if (!proximo || vistos.has(proximo)) break
    vistos.add(proximo)
    cursor = proximo
  }
  return itens
}

type ProdutoCru = {
  id?: number | string
  name?: string
  ucode?: string
  status?: string
  format?: string
  is_subscription?: boolean
}

export async function listarProdutosDaHotmart(
  cliente: ClienteHotmart,
): Promise<ProdutoDaHotmart[]> {
  const crus = await percorrer<ProdutoCru>(cliente, '/products/api/v1/products')
  return crus.flatMap((p) => {
    // Só pagamento único (decisão do #127); produto apagado não vende mais.
    if (p.id === undefined || p.id === null) return []
    if (p.is_subscription || p.status === 'DELETED') return []
    return [
      {
        id: String(p.id),
        nome: p.name ?? `Produto ${p.id}`,
        ucode: p.ucode ?? '',
        combo: p.format === 'BUNDLE',
      },
    ]
  })
}

type OfertaCrua = {
  code?: string
  name?: string
  is_main_offer?: boolean
  price?: { value?: number; currency_code?: string }
}

export async function listarOfertasDaHotmart(
  cliente: ClienteHotmart,
  ucode: string,
): Promise<OfertaDaHotmart[]> {
  if (!/^[A-Za-z0-9-]{1,100}$/.test(ucode)) {
    throw new ErroDaHotmart('Produto da Hotmart inválido.')
  }
  const crus = await percorrer<OfertaCrua>(
    cliente,
    `/products/api/v1/products/${ucode}/offers`,
  )
  return crus.flatMap((o) =>
    o.code
      ? [
          {
            codigo: o.code,
            nome: o.name ?? '',
            principal: o.is_main_offer === true,
            valor: o.price?.value ?? null,
            moeda: o.price?.currency_code ?? null,
          },
        ]
      : [],
  )
}
