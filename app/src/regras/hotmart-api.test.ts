import { describe, expect, it } from 'vitest'

import {
  criarClienteHotmart,
  ErroDaHotmart,
  testarConexao,
} from '#/regras/hotmart-api'

const credenciais = {
  clientId: 'cid',
  clientSecret: 'csecret',
  basic: 'basic-valor',
  hottok: 'hottok',
  sandbox: false,
}

type Chamada = { url: string; init?: RequestInit }
type Resposta = {
  status: number
  corpo?: unknown
  cabecalhos?: Record<string, string>
}

function montar(
  respostas: Resposta[],
  opcoes: { sandbox?: boolean; cache?: { token: string; expiraEm: Date } } = {},
) {
  const chamadas: Chamada[] = []
  const esperas: number[] = []
  let cache: { token: string; expiraEm: Date } | null = opcoes.cache ?? null
  let agora = new Date('2026-11-13T10:00:00Z')
  const fetchFalso = (async (
    url: string | URL | Request,
    init?: RequestInit,
  ) => {
    chamadas.push({ url: String(url), init })
    const r = respostas.shift()
    if (!r) throw new Error('sem resposta combinada')
    return new Response(JSON.stringify(r.corpo ?? {}), {
      status: r.status,
      headers: r.cabecalhos,
    })
  }) as typeof fetch
  const cliente = criarClienteHotmart({
    credenciais: { ...credenciais, sandbox: opcoes.sandbox ?? false },
    tokens: {
      ler: async () => cache,
      gravar: async (token, expiraEm) => {
        cache = { token, expiraEm }
      },
      limpar: async () => {
        cache = null
      },
    },
    fetch: fetchFalso,
    agora: () => agora,
    dormir: async (ms) => {
      esperas.push(ms)
    },
  })
  return {
    cliente,
    chamadas,
    esperas,
    cache: () => cache,
    avancar: (ms: number) => {
      agora = new Date(agora.getTime() + ms)
    },
  }
}

const token = (t = 't1', expires_in = 172799): Resposta => ({
  status: 200,
  corpo: { access_token: t, token_type: 'bearer', expires_in },
})
const auth = (c: Chamada) =>
  ((c.init?.headers ?? {}) as Record<string, string>).Authorization

const falha = (p: Promise<unknown>) =>
  p.then(
    () => {
      throw new Error('a chamada deveria ter falhado')
    },
    (e: Error) => e,
  )

describe('cliente da API da Hotmart', () => {
  it('obtém o token por client_credentials com o Basic e chama a API de produção', async () => {
    const m = montar([token(), { status: 200, corpo: { name: 'Maria' } }])
    const r = await m.cliente.chamar('/user/api/v1/me')
    expect(r).toEqual({ name: 'Maria' })
    const [oauth, api] = m.chamadas
    const u = new URL(oauth.url)
    expect(u.origin + u.pathname).toBe(
      'https://api-sec-vlc.hotmart.com/security/oauth/token',
    )
    expect(u.searchParams.get('grant_type')).toBe('client_credentials')
    expect(u.searchParams.get('client_id')).toBe('cid')
    expect(u.searchParams.get('client_secret')).toBe('csecret')
    expect(oauth.init?.method).toBe('POST')
    expect(auth(oauth)).toBe('Basic basic-valor')
    expect(api.url).toBe('https://developers.hotmart.com/user/api/v1/me')
    expect(auth(api)).toBe('Bearer t1')
  })

  it('credencial sandbox vai para sandbox.hotmart.com', async () => {
    const m = montar([token(), { status: 200 }], { sandbox: true })
    await m.cliente.chamar('/user/api/v1/me')
    expect(m.chamadas[1].url).toBe('https://sandbox.hotmart.com/user/api/v1/me')
  })

  it('aceita o Basic colado já com o prefixo "Basic "', async () => {
    const m = montar([token(), { status: 200 }])
    const c = criarClienteHotmart({
      credenciais: { ...credenciais, basic: 'Basic xyz' },
      tokens: {
        ler: async () => null,
        gravar: async () => {},
        limpar: async () => {},
      },
      fetch: (async (url: string, init?: RequestInit) => {
        m.chamadas.push({ url, init })
        return new Response(
          JSON.stringify({ access_token: 'a', expires_in: 100 }),
        )
      }) as unknown as typeof fetch,
      agora: () => new Date(),
      dormir: async () => {},
    })
    await c.chamar('/x')
    expect(auth(m.chamadas[0])).toBe('Basic xyz')
  })

  it('reaproveita o token em cache até expirar e renova depois', async () => {
    const m = montar([
      token('t1', 3600),
      { status: 200 },
      { status: 200 },
      token('t2', 3600),
      { status: 200 },
    ])
    await m.cliente.chamar('/a')
    await m.cliente.chamar('/b')
    expect(m.chamadas).toHaveLength(3) // 1 token + 2 chamadas
    m.avancar(3600 * 1000)
    await m.cliente.chamar('/c')
    expect(m.chamadas).toHaveLength(5)
    expect(auth(m.chamadas[4])).toBe('Bearer t2')
  })

  it('usa o token que já estava guardado (de outro pedido) sem pedir outro', async () => {
    const m = montar([{ status: 200 }], {
      cache: { token: 'guardado', expiraEm: new Date('2026-11-14T00:00:00Z') },
    })
    await m.cliente.chamar('/a')
    expect(m.chamadas).toHaveLength(1)
    expect(auth(m.chamadas[0])).toBe('Bearer guardado')
  })

  it('com 401 renova o token e tenta de novo uma vez só', async () => {
    const m = montar([
      token('velho'),
      { status: 401, corpo: { error: 'token_expired' } },
      token('novo'),
      { status: 200, corpo: { ok: true } },
    ])
    expect(await m.cliente.chamar('/a')).toEqual({ ok: true })
    expect(auth(m.chamadas[3])).toBe('Bearer novo')

    const m2 = montar([
      token('velho'),
      { status: 401 },
      token('novo'),
      { status: 401 },
    ])
    await expect(m2.cliente.chamar('/a')).rejects.toThrow(ErroDaHotmart)
    expect(m2.chamadas).toHaveLength(4)
  })

  it('com 429 espera o RateLimit-Reset e tenta de novo', async () => {
    const m = montar([
      token(),
      { status: 429, cabecalhos: { 'RateLimit-Reset': '12' } },
      { status: 200, corpo: { ok: 1 } },
    ])
    expect(await m.cliente.chamar('/a')).toEqual({ ok: 1 })
    expect(m.esperas).toEqual([12_000])
  })

  it('com 429 sem cabeçalho espera um minuto; segundo 429 vira erro em linguagem simples', async () => {
    const m = montar([token(), { status: 429 }, { status: 429 }])
    const erro = await falha(m.cliente.chamar('/a'))
    expect(erro).toBeInstanceOf(ErroDaHotmart)
    expect(erro.message).toMatch(/limite|muitas/i)
    expect(m.esperas).toEqual([60_000])
  })

  it('credencial recusada na hora de pegar o token vira mensagem simples, sem eco dos segredos', async () => {
    const m = montar([{ status: 401, corpo: { error: 'invalid_client' } }])
    const erro = await falha(m.cliente.chamar('/a'))
    expect(erro).toBeInstanceOf(ErroDaHotmart)
    expect(erro.message).toMatch(/credenciais/i)
    expect(erro.message).not.toMatch(/csecret|basic-valor|cid/)
  })

  it('erro do servidor da Hotmart e falha de rede viram mensagem simples', async () => {
    const m = montar([token(), { status: 502 }])
    expect((await falha(m.cliente.chamar('/a'))).message).toMatch(
      /Hotmart.*(problema|demorou)/i,
    )
    const semRede = criarClienteHotmart({
      credenciais,
      tokens: {
        ler: async () => null,
        gravar: async () => {},
        limpar: async () => {},
      },
      fetch: (async () => {
        throw new TypeError('fetch failed')
      }) as unknown as typeof fetch,
      agora: () => new Date(),
      dormir: async () => {},
    })
    expect((await falha(semRede.chamar('/a'))).message).toMatch(
      /não foi possível falar/i,
    )
  })
})

describe('testar conexão', () => {
  it('sucesso diz em nome de quem a conta está', async () => {
    const m = montar([
      token(),
      { status: 200, corpo: { name: 'Maria Silva', email: 'm@x.com' } },
    ])
    expect(await testarConexao(m.cliente)).toEqual({
      ok: true,
      mensagem: 'Conexão funcionando. Conta: Maria Silva.',
    })
    expect(m.chamadas[1].url).toContain('/user/api/v1/me')
  })

  it('falha devolve o motivo em linguagem simples, sem lançar', async () => {
    const m = montar([{ status: 400, corpo: { error: 'invalid_client' } }])
    const r = await testarConexao(m.cliente)
    expect(r.ok).toBe(false)
    expect(r.mensagem).toMatch(/credenciais/i)
  })
})
