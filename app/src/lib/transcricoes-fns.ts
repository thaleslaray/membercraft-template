import { env } from 'cloudflare:workers'
import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { getDb } from '#/db/index'
import { exigirPermissaoNaSessao } from '#/lib/autorizacao'
import { agora } from '#/lib/relogio'
import { importarTranscricoes, listarTranscricoes } from '#/regras/transcricoes'

export const transcricoesDoPainelFn = createServerFn({ method: 'GET' }).handler(
  async () => {
    await exigirPermissaoNaSessao('usar-estudio')
    return listarTranscricoes(getDb(env.DB))
  },
)

// A tela manda os arquivos em levas pequenas, para cada chamada caber no limite do corpo.
export const importarTranscricoesFn = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      arquivos: z
        .array(
          z.object({
            nome: z.string().min(1).max(200),
            conteudo: z.string().max(2_000_000),
          }),
        )
        .min(1)
        .max(50),
    }),
  )
  .handler(async ({ data }) => {
    await exigirPermissaoNaSessao('usar-estudio')
    return importarTranscricoes(getDb(env.DB), agora, data.arquivos)
  })
