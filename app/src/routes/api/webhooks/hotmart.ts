import { env } from 'cloudflare:workers'
import { createFileRoute } from '@tanstack/react-router'
import { getDb } from '#/db/index'
import { avisarTecnico } from '#/lib/alerta'
import { tratarWebhookDaHotmart } from '#/lib/webhook-hotmart'
import { lerHottok } from '#/regras/credenciais-hotmart'

// Webhook da Hotmart. Não usa sessão: a autenticação é o cabeçalho `X-HOTMART-HOTTOK`, comparado com o
// hottok das credenciais salvas no painel. A mesma fila da Voomp processa (o aviso carrega o gateway).
export const Route = createFileRoute('/api/webhooks/hotmart')({
  server: {
    handlers: {
      POST: ({ request }) => {
        const banco = getDb(env.DB)
        return tratarWebhookDaHotmart(request, {
          banco,
          agora: () => new Date(),
          hottok: () => lerHottok(banco, env.HOTMART_CHAVE_DE_CIFRA),
          enfileirar: (mensagem) => env.FILA_VOOMP.send(mensagem),
          alertar: avisarTecnico,
        })
      },
    },
  },
})
