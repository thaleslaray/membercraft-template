// Alerta por e-mail ao técnico quando algo falha de vez: webhook, envio de e-mail ou tarefa agendada.
import { appConfig } from '#/config/app'
import { escapeHtml, layout } from '#/lib/email-templates'
import type { Relogio } from '#/regras/tipos'

export type OrigemDaFalha = 'webhook' | 'email' | 'tarefa' | 'fila' | 'pdf'

export interface Falha {
  origem: OrigemDaFalha
  /** O que quebrou, em texto curto (nome da tarefa, id da mensagem, erro). */
  detalhe: string
}

export interface EmailDeAlerta {
  to: string
  subject: string
  html: string
  text: string
}

const TITULOS: Record<OrigemDaFalha, string> = {
  webhook: 'Falha no webhook da Voomp',
  email: 'Falha no envio de e-mail',
  tarefa: 'Falha em tarefa agendada',
  fila: 'Mensagem desistida na fila de mortos',
  pdf: 'Falha ao gerar o PDF de um certificado',
}

export function montarAlerta(
  falha: Falha,
  agora: Relogio,
): Omit<EmailDeAlerta, 'to'> {
  const titulo = TITULOS[falha.origem]
  const quando = agora().toISOString()
  const text = `${titulo}\n\nQuando: ${quando}\nDetalhe: ${falha.detalhe}\n`
  return {
    subject: `[${appConfig.name}] ${titulo}`,
    text,
    html: layout({
      title: titulo,
      bodyHtml: `<p>Quando: ${escapeHtml(quando)}</p><p>Detalhe: ${escapeHtml(falha.detalhe)}</p>`,
    }),
  }
}

/** Avisa o técnico. Nunca lança: o alerta não pode derrubar a rotina que já está falhando. */
export async function alertarTecnico(
  falha: Falha,
  agora: Relogio,
  enviar: (email: EmailDeAlerta) => Promise<unknown>,
): Promise<void> {
  try {
    await enviar({ to: appConfig.supportEmail, ...montarAlerta(falha, agora) })
  } catch (erro) {
    console.error('[alerta] não consegui avisar o técnico', erro)
  }
}
