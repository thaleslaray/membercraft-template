import { env } from 'cloudflare:workers'
import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { getDb } from '#/db/index'
import { exigirPermissaoNaSessao } from '#/lib/autorizacao'
import {
  detalheDaEntrega,
  listarEntregas,
  opcoesDeEntregas,
} from '#/regras/entregas-do-painel'

const id = z.string().min(1).max(100)

// Tudo aqui é da Equipe que corrige (`corrigir-quiz`): as entregas trazem texto e arquivos das alunas.

export const entregasFn = createServerFn({ method: 'GET' })
  .validator(
    z.object({
      cursoId: id.optional(),
      quizId: id.optional(),
      turmaId: id.optional(),
      aluno: z.string().max(100).optional(),
      estado: z
        .enum(['aguardando_correcao', 'aprovada', 'reprovada'])
        .optional(),
      pagina: z.number().int().min(1).optional(),
    }),
  )
  .handler(async ({ data }) => {
    await exigirPermissaoNaSessao('corrigir-quiz')
    const { pagina, ...filtros } = data
    return listarEntregas(getDb(env.DB), filtros, pagina)
  })

export const opcoesDeEntregasFn = createServerFn({ method: 'GET' }).handler(
  async () => {
    await exigirPermissaoNaSessao('corrigir-quiz')
    return opcoesDeEntregas(getDb(env.DB))
  },
)

export const entregasDoAlunoFn = createServerFn({ method: 'GET' })
  .validator(z.object({ alunoId: id }))
  .handler(async ({ data }) => {
    await exigirPermissaoNaSessao('corrigir-quiz')
    return listarEntregas(getDb(env.DB), { alunoId: data.alunoId })
  })

export const detalheDaEntregaFn = createServerFn({ method: 'GET' })
  .validator(z.object({ tentativaId: id }))
  .handler(async ({ data }) => {
    await exigirPermissaoNaSessao('corrigir-quiz')
    return detalheDaEntrega(getDb(env.DB), data.tentativaId)
  })
