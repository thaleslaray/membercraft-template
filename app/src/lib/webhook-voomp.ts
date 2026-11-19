// Cola do webhook da Voomp: confere o token, GRAVA o aviso e só então responde 200 e manda o
// processamento para a fila. As dependências entram por parâmetro para o teste não precisar de
// D1 nem de fila.

import type { Banco, Relogio } from '#/regras/tipos'
import { gravarAviso } from '#/regras/vendas'
import { tokenConfere } from '#/regras/voomp'

// Um aviso da Voomp tem poucos KB; o limite só barra abuso.
export const LIMITE_DO_CORPO = 256 * 1024

export interface MensagemDaFilaVoomp {
  /** Quando a mensagem cai na fila de mortos, o alerta ao técnico lê isto (src/server.ts). */
  origem: 'webhook'
  avisoId: string
}

export interface DependenciasDoWebhook {
  banco: Banco
  agora: Relogio
  /** Segredo esperado (`VOOMP_WEBHOOK_TOKEN`); vazio recusa tudo. */
  token: string | undefined
  enfileirar: (mensagem: MensagemDaFilaVoomp) => Promise<unknown>
}

const resposta = (status: number, corpo: string) =>
  new Response(corpo, {
    status,
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  })

export async function tratarWebhookDaVoomp(
  request: Request,
  deps: DependenciasDoWebhook,
): Promise<Response> {
  if (request.method !== 'POST') return resposta(405, 'Método não permitido.')
  if (!tokenConfere(request.headers.get('x-webhook-token'), deps.token)) {
    return resposta(401, 'Token inválido.')
  }
  // Recusa antes de ler o corpo quando o cabeçalho já declara tamanho acima do teto.
  const declarado = Number(request.headers.get('content-length'))
  if (Number.isFinite(declarado) && declarado > LIMITE_DO_CORPO) {
    return resposta(413, 'Corpo grande demais.')
  }
  const corpo = await request.text()
  if (corpo.length > LIMITE_DO_CORPO)
    return resposta(413, 'Corpo grande demais.')

  // 1) Gravar. Se falhar, o erro sobe e a resposta é 500: melhor a Voomp saber que não gravamos.
  const gravado = await gravarAviso(deps.banco, deps.agora, corpo)
  if (gravado.invalido) return resposta(400, 'Corpo inválido.')

  // 2) Enfileirar. Se a fila falhar o aviso já está gravado ("Na fila" na tela, com reprocessar).
  if (gravado.enfileirar) {
    try {
      await deps.enfileirar({ origem: 'webhook', avisoId: gravado.id })
    } catch (erro) {
      console.error('[voomp] aviso gravado, mas a fila falhou', erro)
    }
  }
  return resposta(200, 'ok')
}
