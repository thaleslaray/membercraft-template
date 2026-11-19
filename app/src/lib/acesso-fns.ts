import { env } from 'cloudflare:workers'
import { createServerFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import { z } from 'zod'
import { getDb } from '#/db/index'
import { getAuth } from '#/lib/auth'
import { renovarSessaoNoCookie } from '#/lib/autorizacao'
import { isRateLimited } from '#/lib/rate-limit'
import { lerConfiguracaoDaArea } from '#/regras/configuracao-da-area'
import { chaveDeLimitePorEmail, emailCadastrado } from '#/regras/login'
import { concluirPrimeiroAcesso } from '#/regras/primeiro-acesso'
import { garantirProprietarioInicial } from '#/regras/proprietario-inicial'

export type ResultadoDoPedidoDeCodigo =
  | { status: 'enviado' }
  | { status: 'nao_encontrado'; suporte: string }
  | { status: 'limitado' }

// Pede o código de login. Só e-mail cadastrado recebe; os outros veem o contato do suporte.
export const solicitarCodigoFn = createServerFn({ method: 'POST' })
  .validator(z.object({ email: z.string().trim().email().max(254) }))
  .handler(async ({ data }): Promise<ResultadoDoPedidoDeCodigo> => {
    const request = getRequest()
    // Limite por IP (chave padrão do escopo) e por e-mail.
    if (
      (await isRateLimited('codigo-ip', { headers: request.headers })) ||
      (await isRateLimited('codigo-email', {
        key: chaveDeLimitePorEmail(data.email),
      }))
    ) {
      return { status: 'limitado' }
    }
    await garantirProprietarioInicial(
      getDb(env.DB),
      data.email,
      // Segredo opcional de cada instalação (`wrangler secret put PROPRIETARIO_INICIAL`), nunca no git.
      (env as { PROPRIETARIO_INICIAL?: string }).PROPRIETARIO_INICIAL,
    )
    if (!(await emailCadastrado(getDb(env.DB), data.email))) {
      const { suporteEmail } = await lerConfiguracaoDaArea(getDb(env.DB))
      return { status: 'nao_encontrado', suporte: suporteEmail }
    }
    await getAuth(env).api.sendVerificationOTP({
      body: { email: data.email.toLowerCase(), type: 'sign-in' },
      headers: request.headers,
    })
    return { status: 'enviado' }
  })

// Primeiro acesso do aluno: nome (se faltar) e aceite da versão vigente dos Termos.
export const concluirPrimeiroAcessoFn = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      nome: z.string().trim().max(120).optional(),
      aceitouTermos: z.boolean(),
    }),
  )
  .handler(async ({ data }) => {
    const sessao = await getAuth(env).api.getSession({
      headers: getRequest().headers,
    })
    if (!sessao) throw new Error('Entre para continuar.')
    const { termosVersao } = await lerConfiguracaoDaArea(getDb(env.DB))
    await concluirPrimeiroAcesso(
      getDb(env.DB),
      () => new Date(),
      sessao.user.id,
      {
        nome: data.nome,
        aceitouTermos: data.aceitouTermos,
        versaoDosTermos: termosVersao,
      },
    )
    await renovarSessaoNoCookie()
  })
