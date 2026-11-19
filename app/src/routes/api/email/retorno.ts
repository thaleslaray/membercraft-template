import { env } from 'cloudflare:workers'
import { createFileRoute } from '@tanstack/react-router'
import { getDb } from '#/db/index'
import { interpretarRetorno, registrarRetorno } from '#/regras/envio-de-email'

// Aviso de retorno do provedor (bounce e reclamação, formato do Resend): marca o envio no histórico
// do aluno. Autenticado por um segredo no cabeçalho `x-webhook-token` (EMAIL_WEBHOOK_TOKEN).
// TODO(#45): com o Resend como provedor, cadastrar este endereço como webhook no painel dele; o
// Email Service da Cloudflare ainda não tem aviso de retorno documentado.
function mesmoSegredo(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diferenca = 0
  for (let i = 0; i < a.length; i++)
    diferenca |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diferenca === 0
}

export const Route = createFileRoute('/api/email/retorno')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const segredo = (
          env as { EMAIL_WEBHOOK_TOKEN?: string }
        ).EMAIL_WEBHOOK_TOKEN?.trim()
        const enviado = request.headers.get('x-webhook-token') ?? ''
        if (!segredo || !mesmoSegredo(segredo, enviado)) {
          return new Response('Não autorizado.', { status: 401 })
        }
        const retorno = interpretarRetorno(
          await request.json().catch(() => null),
        )
        if (retorno) {
          await registrarRetorno(getDb(env.DB), () => new Date(), retorno)
        }
        // 200 também para aviso que não interessa: o provedor não precisa tentar de novo.
        return new Response('ok')
      },
    },
  },
})
