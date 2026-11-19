import type { Credenciais, TokenEmCache } from '#/regras/credenciais-hotmart'

/**
 * Cliente central da API da Hotmart (#129). Toda chamada à Hotmart passa por aqui:
 * - token OAuth (client_credentials) em cache até expirar (guardado pelo `tokens`, que sobrevive entre pedidos);
 * - com 401, descarta o token, renova e tenta de novo UMA vez;
 * - com 429, espera o `RateLimit-Reset` (segundos) e tenta de novo uma vez;
 * - base sandbox (`sandbox.hotmart.com`) ou produção (`developers.hotmart.com`) conforme a credencial.
 * `fetch`, relógio e espera entram por parâmetro: o teste nunca fala com a Hotmart de verdade.
 */

const URL_DO_TOKEN = 'https://api-sec-vlc.hotmart.com/security/oauth/token'
const BASE_PRODUCAO = 'https://developers.hotmart.com'
const BASE_SANDBOX = 'https://sandbox.hotmart.com'
const ESPERA_PADRAO_DO_429_S = 60
const ESPERA_MAXIMA_DO_429_S = 60
// Renova um pouco antes de expirar, para a chamada não sair com token no limite.
const MARGEM_DO_TOKEN_MS = 60_000

export class ErroDaHotmart extends Error {
  constructor(
    mensagem: string,
    readonly status?: number,
  ) {
    super(mensagem)
    this.name = 'ErroDaHotmart'
  }
}

export type ArmazenamentoDoToken = {
  ler: () => Promise<TokenEmCache | null>
  gravar: (token: string, expiraEm: Date) => Promise<void>
  limpar: () => Promise<void>
}

export type OpcoesDoCliente = {
  credenciais: Credenciais
  tokens: ArmazenamentoDoToken
  fetch: typeof fetch
  agora: () => Date
  dormir: (ms: number) => Promise<void>
  /** Só para teste ponta a ponta: aponta a API e o OAuth para um servidor falso local. */
  urls?: { base: string; token: string }
}

export type OpcoesDaChamada = {
  metodo?: 'GET' | 'POST'
  query?: Record<string, string | number | undefined>
}

const MSG_CREDENCIAIS =
  'A Hotmart não aceitou as credenciais. Confira o Client ID, o Client Secret e o Client Token, e se a credencial é do tipo certo (sandbox ou produção).'
const MSG_REDE =
  'Não foi possível falar com a Hotmart. Tente de novo daqui a pouco.'

function mensagemDoStatus(status: number, esperaS?: number): string {
  if (status === 401) {
    return 'A Hotmart recusou o acesso mesmo com um token novo. Confira as credenciais.'
  }
  if (status === 403)
    return 'Essa credencial não tem permissão para esta consulta.'
  if (status === 404) return 'A Hotmart não encontrou o endereço consultado.'
  if (status === 429) {
    return `Muitas consultas à Hotmart (o limite é de 500 por minuto). Tente de novo em ${esperaS ?? ESPERA_PADRAO_DO_429_S} segundos.`
  }
  if (status >= 500) {
    return 'A Hotmart está com problema ou demorou demais para responder. Tente de novo daqui a pouco.'
  }
  return `A Hotmart recusou a consulta (erro ${status}).`
}

function segundosDeEspera(resposta: Response): number {
  const lido = Number(resposta.headers.get('RateLimit-Reset'))
  const s = Number.isFinite(lido) && lido > 0 ? lido : ESPERA_PADRAO_DO_429_S
  return Math.min(s, ESPERA_MAXIMA_DO_429_S)
}

export function criarClienteHotmart(opcoes: OpcoesDoCliente) {
  const { credenciais, tokens, agora, dormir } = opcoes
  const base =
    opcoes.urls?.base ?? (credenciais.sandbox ? BASE_SANDBOX : BASE_PRODUCAO)
  const basic = /^basic\s/i.test(credenciais.basic)
    ? credenciais.basic
    : `Basic ${credenciais.basic}`

  async function enviar(url: string, init: RequestInit): Promise<Response> {
    try {
      return await opcoes.fetch(url, init)
    } catch {
      throw new ErroDaHotmart(MSG_REDE)
    }
  }

  async function pedirToken(): Promise<string> {
    const url = new URL(opcoes.urls?.token ?? URL_DO_TOKEN)
    url.searchParams.set('grant_type', 'client_credentials')
    url.searchParams.set('client_id', credenciais.clientId)
    url.searchParams.set('client_secret', credenciais.clientSecret)
    const resposta = await enviar(url.toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: basic },
    })
    if (
      resposta.status === 400 ||
      resposta.status === 401 ||
      resposta.status === 403
    ) {
      throw new ErroDaHotmart(MSG_CREDENCIAIS, resposta.status)
    }
    if (!resposta.ok) {
      throw new ErroDaHotmart(
        mensagemDoStatus(resposta.status),
        resposta.status,
      )
    }
    const corpo = (await resposta.json().catch(() => ({}))) as {
      access_token?: string
      expires_in?: number
    }
    if (!corpo.access_token) throw new ErroDaHotmart(MSG_CREDENCIAIS)
    const expiraEm = new Date(
      agora().getTime() + (corpo.expires_in ?? 0) * 1000 - MARGEM_DO_TOKEN_MS,
    )
    await tokens.gravar(corpo.access_token, expiraEm)
    return corpo.access_token
  }

  async function tokenValido(): Promise<string> {
    const guardado = await tokens.ler()
    if (guardado && guardado.expiraEm.getTime() > agora().getTime()) {
      return guardado.token
    }
    return pedirToken()
  }

  async function chamar<T = unknown>(
    caminho: string,
    chamada: OpcoesDaChamada = {},
  ): Promise<T> {
    const url = new URL(base + caminho)
    for (const [k, v] of Object.entries(chamada.query ?? {})) {
      if (v !== undefined) url.searchParams.set(k, String(v))
    }
    let renovou = false
    let esperou = false
    let token = await tokenValido()
    for (;;) {
      const resposta = await enviar(url.toString(), {
        method: chamada.metodo ?? 'GET',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      })
      if (resposta.ok) return (await resposta.json().catch(() => ({}))) as T
      if (resposta.status === 401 && !renovou) {
        renovou = true
        await tokens.limpar()
        token = await pedirToken()
        continue
      }
      if (resposta.status === 429) {
        const s = segundosDeEspera(resposta)
        if (!esperou) {
          esperou = true
          await dormir(s * 1000)
          continue
        }
        throw new ErroDaHotmart(mensagemDoStatus(429, s), 429)
      }
      throw new ErroDaHotmart(
        mensagemDoStatus(resposta.status),
        resposta.status,
      )
    }
  }

  return { chamar }
}

export type ClienteHotmart = ReturnType<typeof criarClienteHotmart>

/** "Testar conexão": token OAuth + `GET /user/api/v1/me`. Nunca lança: devolve o resultado em português. */
export async function testarConexao(
  cliente: ClienteHotmart,
): Promise<{ ok: boolean; mensagem: string }> {
  try {
    const eu = await cliente.chamar<{ name?: string }>('/user/api/v1/me')
    return {
      ok: true,
      mensagem: eu.name
        ? `Conexão funcionando. Conta: ${eu.name}.`
        : 'Conexão funcionando.',
    }
  } catch (e) {
    return {
      ok: false,
      mensagem:
        e instanceof ErroDaHotmart
          ? e.message
          : 'Não foi possível testar a conexão. Tente de novo.',
    }
  }
}
