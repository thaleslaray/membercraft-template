import { env } from 'cloudflare:workers'
import { createFileRoute } from '@tanstack/react-router'
import { getAuth } from '#/lib/auth'
import { isRateLimited, tooManyRequests } from '#/lib/rate-limit'
import {
  chaveDeLimiteDeVerificacao,
  chaveDeLimitePorEmail,
} from '#/regras/login'

// Endpoints de escrita do Better Auth que disparam e-mail ou tentativa de login:
// alvo clássico de abuso (spam de OTP, força bruta). Limite por IP via PUBLIC_RATE_LIMIT.
const RATE_LIMITED_SUFFIXES = [
  '/email-otp/send-verification-otp',
  '/sign-in/email',
  '/sign-up/email',
]

export const Route = createFileRoute('/api/auth/$')({
  server: {
    handlers: {
      GET: ({ request }) => getAuth(env).handler(request),
      POST: async ({ request }) => {
        const { pathname } = new URL(request.url)
        // O link de entrada só nasce no servidor (e-mails da fila). Pedir um pela API pública
        // permitiria disparar e-mail para qualquer conta sem passar pelo texto nem pelo histórico.
        if (pathname.endsWith('/sign-in/magic-link')) {
          return new Response('Não encontrado.', { status: 404 })
        }
        // Perfil e e-mail só mudam por `conta-fns.ts` e pela Equipe (com registro de ações); o endpoint
        // genérico do Better Auth deixaria a pessoa gravar direto no usuário.
        if (
          pathname.endsWith('/update-user') ||
          pathname.endsWith('/change-email')
        ) {
          return new Response('Não encontrado.', { status: 404 })
        }
        if (
          RATE_LIMITED_SUFFIXES.some((s) => pathname.endsWith(s)) &&
          (await isRateLimited('auth', { headers: request.headers }))
        ) {
          return tooManyRequests()
        }
        // Pedido de código: além do IP, o limite vale por e-mail.
        if (pathname.endsWith('/email-otp/send-verification-otp')) {
          const corpo = (await request
            .clone()
            .json()
            .catch(() => null)) as { email?: unknown } | null
          if (
            typeof corpo?.email === 'string' &&
            (await isRateLimited('codigo-email', {
              headers: request.headers,
              key: chaveDeLimitePorEmail(corpo.email),
            }))
          ) {
            return tooManyRequests()
          }
        }
        // Verificação do código: escopo próprio (IP e e-mail), sem gastar o limite de envio.
        if (pathname.endsWith('/sign-in/email-otp')) {
          if (await isRateLimited('verificar', { headers: request.headers })) {
            return tooManyRequests()
          }
          const corpo = (await request
            .clone()
            .json()
            .catch(() => null)) as { email?: unknown } | null
          if (
            typeof corpo?.email === 'string' &&
            (await isRateLimited('verificar-email', {
              headers: request.headers,
              key: chaveDeLimiteDeVerificacao(corpo.email),
            }))
          ) {
            return tooManyRequests()
          }
        }
        return getAuth(env).handler(request)
      },
    },
  },
})
