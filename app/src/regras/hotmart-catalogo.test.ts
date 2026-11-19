import { describe, expect, it } from 'vitest'
import { criarClienteHotmart } from '#/regras/hotmart-api'
import {
  listarOfertasDaHotmart,
  listarProdutosDaHotmart,
} from '#/regras/hotmart-catalogo'

type Resposta = { status?: number; corpo?: unknown }

function montar(rotas: Record<string, Resposta[]>) {
  const urls: string[] = []
  const fetchFalso = (async (url: string | URL | Request) => {
    const u = new URL(String(url))
    urls.push(u.pathname + u.search)
    if (u.pathname.endsWith('/oauth/token')) {
      return new Response(
        JSON.stringify({ access_token: 't', expires_in: 3600 }),
        { status: 200 },
      )
    }
    const fila = rotas[u.pathname]
    const r = fila?.shift()
    if (!r) throw new Error(`sem resposta combinada para ${u.pathname}`)
    return new Response(JSON.stringify(r.corpo ?? {}), {
      status: r.status ?? 200,
    })
  }) as typeof fetch
  const cliente = criarClienteHotmart({
    credenciais: {
      clientId: 'c',
      clientSecret: 's',
      basic: 'b',
      hottok: 'h',
      sandbox: false,
    },
    tokens: {
      ler: async () => null,
      gravar: async () => {},
      limpar: async () => {},
    },
    fetch: fetchFalso,
    agora: () => new Date('2026-11-13T10:00:00Z'),
    dormir: async () => {},
  })
  return { cliente, urls }
}

const produto = (id: number, extra: object = {}) => ({
  id,
  name: `Produto ${id}`,
  ucode: `uc-${id}`,
  status: 'ACTIVE',
  format: 'ONLINE_COURSE',
  is_subscription: false,
  ...extra,
})

describe('listarProdutosDaHotmart', () => {
  it('segue o next_page_token até acabar e junta as páginas', async () => {
    const { cliente, urls } = montar({
      '/products/api/v1/products': [
        {
          corpo: {
            items: [produto(1), produto(2)],
            page_info: { next_page_token: 'pg2' },
          },
        },
        {
          corpo: {
            items: [produto(3, { format: 'BUNDLE' })],
            page_info: { next_page_token: null, prev_page_token: 'pg1' },
          },
        },
      ],
    })
    const lista = await listarProdutosDaHotmart(cliente)
    expect(lista.map((p) => p.id)).toEqual(['1', '2', '3'])
    expect(lista[2]).toMatchObject({
      nome: 'Produto 3',
      ucode: 'uc-3',
      combo: true,
    })
    const chamadas = urls.filter((u) => u.startsWith('/products'))
    expect(chamadas[0]).toContain('max_results=50')
    expect(chamadas[0]).not.toContain('page_token')
    expect(chamadas[1]).toContain('page_token=pg2')
  })

  it('esconde produtos de assinatura e apagados (só pagamento único liga)', async () => {
    const { cliente } = montar({
      '/products/api/v1/products': [
        {
          corpo: {
            items: [
              produto(1),
              produto(2, { is_subscription: true }),
              produto(3, { status: 'DELETED' }),
            ],
            page_info: {},
          },
        },
      ],
    })
    expect((await listarProdutosDaHotmart(cliente)).map((p) => p.id)).toEqual([
      '1',
    ])
  })

  it('não entra em laço se a Hotmart repetir o cursor', async () => {
    const igual = {
      corpo: { items: [produto(1)], page_info: { next_page_token: 'x' } },
    }
    const { cliente } = montar({
      '/products/api/v1/products': [igual, igual, igual, igual],
    })
    const lista = await listarProdutosDaHotmart(cliente)
    expect(lista.length).toBeLessThanOrEqual(2)
  })

  it('resposta sem items vira lista vazia', async () => {
    const { cliente } = montar({ '/products/api/v1/products': [{ corpo: {} }] })
    expect(await listarProdutosDaHotmart(cliente)).toEqual([])
  })
})

describe('listarOfertasDaHotmart', () => {
  it('lista as ofertas do produto pelo ucode, paginando por cursor', async () => {
    const { cliente, urls } = montar({
      '/products/api/v1/products/uc-1/offers': [
        {
          corpo: {
            items: [
              {
                code: '02mhofjd',
                name: '',
                is_main_offer: true,
                payment_mode: 'PAY_IN_FULL',
                price: { value: 10, currency_code: 'BRL' },
              },
            ],
            page_info: { next_page_token: 'o2' },
          },
        },
        {
          corpo: {
            items: [
              {
                code: 'abc123',
                name: 'Black Friday',
                is_main_offer: false,
                payment_mode: 'PAY_IN_FULL',
                price: { value: 7, currency_code: 'BRL' },
              },
            ],
            page_info: {},
          },
        },
      ],
    })
    const ofertas = await listarOfertasDaHotmart(cliente, 'uc-1')
    expect(ofertas).toEqual([
      {
        codigo: '02mhofjd',
        nome: '',
        principal: true,
        valor: 10,
        moeda: 'BRL',
      },
      {
        codigo: 'abc123',
        nome: 'Black Friday',
        principal: false,
        valor: 7,
        moeda: 'BRL',
      },
    ])
    expect(urls.at(-1)).toContain('page_token=o2')
  })

  it('ucode fora do formato é recusado antes de chamar a Hotmart', async () => {
    const { cliente, urls } = montar({})
    await expect(listarOfertasDaHotmart(cliente, '../me')).rejects.toThrow(
      /produto/i,
    )
    expect(urls).toEqual([])
  })
})
