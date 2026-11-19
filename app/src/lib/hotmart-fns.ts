import { env } from 'cloudflare:workers'
import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { getDb } from '#/db/index'
import { exigirPermissaoNaSessao } from '#/lib/autorizacao'
import { clienteDaHotmart } from '#/lib/hotmart-cliente'
import {
  salvarCredenciais,
  situacaoDasCredenciais,
} from '#/regras/credenciais-hotmart'
import { testarConexao } from '#/regras/hotmart-api'

// Só o Proprietário (`gerir-credenciais-da-hotmart`). A leitura devolve apenas quais campos estão
// preenchidos: os valores nunca saem do servidor.
export const credenciaisDaHotmartFn = createServerFn({
  method: 'GET',
}).handler(async () => {
  await exigirPermissaoNaSessao('gerir-credenciais-da-hotmart')
  return situacaoDasCredenciais(getDb(env.DB))
})

const campo = z.string().max(4000).optional()

export const salvarCredenciaisDaHotmartFn = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      clientId: campo,
      clientSecret: campo,
      basic: campo,
      hottok: campo,
      sandbox: z.boolean(),
    }),
  )
  .handler(async ({ data }) => {
    const sessao = await exigirPermissaoNaSessao('gerir-credenciais-da-hotmart')
    await salvarCredenciais(
      getDb(env.DB),
      () => new Date(),
      env.HOTMART_CHAVE_DE_CIFRA,
      data,
      sessao.user.id,
    )
    return { salvo: true }
  })

export const testarConexaoDaHotmartFn = createServerFn({
  method: 'POST',
}).handler(async () => {
  await exigirPermissaoNaSessao('gerir-credenciais-da-hotmart')
  const cliente = await clienteDaHotmart(getDb(env.DB))
  if (!cliente) {
    return { ok: false, mensagem: 'Salve as credenciais antes de testar.' }
  }
  return testarConexao(cliente)
})
