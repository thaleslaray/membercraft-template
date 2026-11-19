// Server functions de "Entrar como esta aluna": a regra e a sessão ficam no plugin
// (`auth-entrar-como.ts`); aqui só se chama o endpoint com os cabeçalhos do pedido, e o
// `tanstackStartCookies` repassa os cookies novos ao navegador.
import { env } from 'cloudflare:workers'
import { createServerFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import { z } from 'zod'

import { getAuth } from '#/lib/auth'
import { exigirPermissaoNaSessao } from '#/lib/autorizacao'

type ApiDoPlugin = {
  entrarComoAluna: (o: {
    headers: Headers
    body: { alunoId: string }
  }) => Promise<unknown>
  sairDeEntrarComo: (o: { headers: Headers }) => Promise<{
    voltou: boolean
    alunaId: string
  }>
}
const api = () => getAuth(env).api as unknown as ApiDoPlugin

export const entrarComoFn = createServerFn({ method: 'POST' })
  .validator(z.object({ alunoId: z.string().min(1).max(200) }))
  .handler(async ({ data }) => {
    await exigirPermissaoNaSessao('entrar-como')
    await api().entrarComoAluna({
      headers: getRequest().headers,
      body: { alunoId: data.alunoId },
    })
  })

export const sairDeEntrarComoFn = createServerFn({ method: 'POST' }).handler(
  async () => {
    const { voltou, alunaId } = await api().sairDeEntrarComo({
      headers: getRequest().headers,
    })
    return { voltou, alunaId }
  },
)
