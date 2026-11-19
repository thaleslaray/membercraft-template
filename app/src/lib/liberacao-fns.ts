import { env } from 'cloudflare:workers'
import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { getDb } from '#/db/index'
import { exigirPermissaoNaSessao } from '#/lib/autorizacao'
import {
  definirRegra,
  removerRegra,
  TIPOS_DE_REGRA,
} from '#/regras/regras-de-liberacao'

const id = z.string().min(1).max(100)

const escopo = z.union([
  z.object({ moduloId: id, aulaId: z.undefined().optional() }),
  z.object({ aulaId: id, moduloId: z.undefined().optional() }),
])

export const salvarRegraFn = createServerFn({ method: 'POST' })
  .validator(
    z
      .object({
        turmaId: id,
        tipo: z.enum(TIPOS_DE_REGRA),
        liberaEm: z.string().max(10).nullish(),
        fechaEm: z.string().max(10).nullish(),
        dias: z.number().int().nullish(),
        pontos: z.number().int().nullish(),
        alvoId: id.nullish(),
      })
      .and(escopo),
  )
  .handler(async ({ data }) => {
    await exigirPermissaoNaSessao('gerir-matriculas')
    await definirRegra(getDb(env.DB), data)
  })

export const removerRegraFn = createServerFn({ method: 'POST' })
  .validator(z.object({ turmaId: id }).and(escopo))
  .handler(async ({ data }) => {
    await exigirPermissaoNaSessao('gerir-matriculas')
    await removerRegra(
      getDb(env.DB),
      data.turmaId,
      data.aulaId ? { aulaId: data.aulaId } : { moduloId: data.moduloId ?? '' },
    )
  })
