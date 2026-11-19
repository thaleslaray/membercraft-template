import { env } from 'cloudflare:workers'
import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { getDb } from '#/db/index'
import {
  exigirPermissaoNaSessao,
  pessoaLogadaNaSessao,
} from '#/lib/autorizacao'
import { agora } from '#/lib/relogio'
import { lerAjustes, salvarAjustes } from '#/regras/avisos-agendados'
import {
  avisosDaPessoa,
  marcarComoLida,
  marcarTodasComoLidas,
} from '#/regras/notificacoes'

export const sininhoFn = createServerFn({ method: 'GET' }).handler(async () =>
  avisosDaPessoa(getDb(env.DB), (await pessoaLogadaNaSessao()).id),
)

export const marcarAvisoComoLidoFn = createServerFn({ method: 'POST' })
  .validator(z.object({ id: z.string().min(1).max(100) }))
  .handler(async ({ data }) =>
    marcarComoLida(
      getDb(env.DB),
      agora,
      (await pessoaLogadaNaSessao()).id,
      data.id,
    ),
  )

export const marcarTodosComoLidosFn = createServerFn({
  method: 'POST',
}).handler(async () =>
  marcarTodasComoLidas(getDb(env.DB), agora, (await pessoaLogadaNaSessao()).id),
)

// Dias dos avisos agendados: da Equipe.
export const ajustesDeAvisoFn = createServerFn({ method: 'GET' }).handler(
  async () => {
    await exigirPermissaoNaSessao('gerir-matriculas')
    return lerAjustes(getDb(env.DB))
  },
)

export const salvarAjustesDeAvisoFn = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      diasAcessoExpirando: z.number().int(),
      diasAcessoPronto: z.number().int(),
      diasSentimosSuaFalta: z.number().int(),
      acessoProntoLigado: z.boolean(),
      sentimosSuaFaltaLigado: z.boolean(),
    }),
  )
  .handler(async ({ data }) => {
    await exigirPermissaoNaSessao('gerir-matriculas')
    await salvarAjustes(getDb(env.DB), agora, data)
    return lerAjustes(getDb(env.DB))
  })
