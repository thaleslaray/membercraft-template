import { env } from 'cloudflare:workers'
import { createFileRoute } from '@tanstack/react-router'
import { getDb } from '#/db/index'
import { tratarWebhookDaVoomp } from '#/lib/webhook-voomp'

// Webhook da Voomp. Não usa sessão: a autenticação é o cabeçalho `x-webhook-token`.
export const Route = createFileRoute('/api/webhooks/voomp')({
  server: {
    handlers: {
      POST: ({ request }) =>
        tratarWebhookDaVoomp(request, {
          banco: getDb(env.DB),
          agora: () => new Date(),
          token: env.VOOMP_WEBHOOK_TOKEN,
          enfileirar: (mensagem) => env.FILA_VOOMP.send(mensagem),
        }),
    },
  },
})
