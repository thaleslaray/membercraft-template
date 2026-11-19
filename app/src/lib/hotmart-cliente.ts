import { env } from 'cloudflare:workers'
import {
  armazenamentoDoToken,
  lerCredenciais,
} from '#/regras/credenciais-hotmart'
import { criarClienteHotmart } from '#/regras/hotmart-api'
import type { Banco } from '#/regras/tipos'

/**
 * Cliente da API da Hotmart com as credenciais salvas no painel; `null` se ainda não há credencial.
 * `HOTMART_URL_DE_TESTE` (só o e2e define, pelo vite.config.ts; ignorada se a URL do app não for http://localhost) aponta a API e o OAuth para
 * um servidor falso local: o teste nunca fala com a Hotmart de verdade.
 */
export async function clienteDaHotmart(db: Banco) {
  const credenciais = await lerCredenciais(db, env.HOTMART_CHAVE_DE_CIFRA)
  if (!credenciais) return null
  const falsa = (env as { HOTMART_URL_DE_TESTE?: string }).HOTMART_URL_DE_TESTE
  const urls =
    falsa && env.BETTER_AUTH_URL.startsWith('http://localhost')
      ? { base: falsa, token: `${falsa}/security/oauth/token` }
      : undefined
  return criarClienteHotmart({
    credenciais,
    tokens: armazenamentoDoToken(db, env.HOTMART_CHAVE_DE_CIFRA),
    fetch: (...a) => fetch(...a),
    agora: () => new Date(),
    dormir: (ms) => new Promise((r) => setTimeout(r, ms)),
    urls,
  })
}
