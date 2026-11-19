// Cola do webhook da Hotmart (eventos de pedido 2.0.0): confere o hottok, GRAVA o aviso e só então
// responde 200 e manda o processamento para a fila. Mesmo desenho da Voomp (`webhook-voomp.ts`).

import { LIMITE_DO_CORPO } from '#/lib/webhook-voomp'
import type { Falha } from '#/regras/alerta-tecnico'
import { ErroDeCifra } from '#/regras/cifra'
import type { Banco, Relogio } from '#/regras/tipos'
import { gravarAviso } from '#/regras/vendas'
import { tokenConfere } from '#/regras/voomp'

export interface MensagemDaFilaHotmart {
  /** Quando a mensagem cai na fila de mortos, o alerta ao técnico lê isto (src/server.ts). */
  origem: 'webhook'
  gateway: 'hotmart'
  avisoId: string
}

export interface DependenciasDoWebhookHotmart {
  banco: Banco
  agora: Relogio
  /** Hottok das credenciais salvas no painel; `undefined` quando não há credencial (recusa tudo). */
  hottok: () => Promise<string | undefined>
  enfileirar: (mensagem: MensagemDaFilaHotmart) => Promise<unknown>
  /** Alerta ao técnico (`avisarTecnico`); nunca lança. */
  alertar: (falha: Falha) => Promise<unknown>
}

const resposta = (status: number, corpo: string) =>
  new Response(corpo, {
    status,
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  })

export async function tratarWebhookDaHotmart(
  request: Request,
  deps: DependenciasDoWebhookHotmart,
): Promise<Response> {
  if (request.method !== 'POST') return resposta(405, 'Método não permitido.')
  let salvo: string | undefined
  try {
    salvo = await deps.hottok()
  } catch (erro) {
    if (!(erro instanceof ErroDeCifra)) throw erro
    // A chave de cifra sumiu ou mudou: não dá para conferir o hottok. 503 faz a Hotmart tentar de novo
    // depois do conserto; o motivo vai só ao técnico, nunca na resposta.
    console.error('[hotmart] não consegui decifrar o hottok', erro)
    await deps.alertar({
      origem: 'webhook',
      detalhe: `Webhook da Hotmart recusado com 503: ${erro.message}`,
    })
    return resposta(503, 'Serviço indisponível.')
  }
  if (!tokenConfere(request.headers.get('x-hotmart-hottok'), salvo)) {
    return resposta(401, 'Hottok inválido.')
  }
  const declarado = Number(request.headers.get('content-length'))
  if (Number.isFinite(declarado) && declarado > LIMITE_DO_CORPO) {
    return resposta(413, 'Corpo grande demais.')
  }
  const corpo = await request.text()
  if (corpo.length > LIMITE_DO_CORPO)
    return resposta(413, 'Corpo grande demais.')

  // 1) Gravar. Se falhar, o erro sobe e a resposta é 500: a Hotmart tenta de novo.
  const gravado = await gravarAviso(deps.banco, deps.agora, corpo, 'hotmart')
  if (gravado.invalido) return resposta(400, 'Corpo inválido.')

  // 2) Enfileirar. Se a fila falhar o aviso já está gravado ("Na fila" na tela, com reprocessar).
  if (gravado.enfileirar) {
    try {
      await deps.enfileirar({
        origem: 'webhook',
        gateway: 'hotmart',
        avisoId: gravado.id,
      })
    } catch (erro) {
      console.error('[hotmart] aviso gravado, mas a fila falhou', erro)
    }
  }
  return resposta(200, 'ok')
}
