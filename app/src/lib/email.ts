// Camada de e-mail (somente servidor). Tenta os provedores nesta ordem:
//   1. Cloudflare Email Service (binding EMAIL), se existir e EMAIL_FROM estiver preenchido;
//   2. Resend (REST via fetch), se RESEND_API_KEY estiver preenchida: plano B quando o primeiro
//      falha, ou único provedor quando não há o binding;
//   3. console (desenvolvimento): o e-mail aparece no terminal do `npm run dev`.
// Remetente "Helena Duarte" de @minhaescola.example (EMAIL_FROM troca), respostas para suporte@minhaescola.example.
// No ambiente de testes (AMBIENTE=teste) só sai para a lista liberada (EMAIL_LISTA_LIBERADA).
import { env } from 'cloudflare:workers'

import { appConfig } from '#/config/app'
import { emProducaoDeVerdade } from '#/lib/producao'
import { destinatarioLiberado } from '#/regras/lista-liberada'

export type SendEmailParams = {
  to: string
  subject: string
  html: string
  text: string
}

export type SendEmailResult = {
  sent: boolean
  provider: 'resend' | 'cloudflare' | 'console' | 'bloqueado'
  id?: string
}

// Trata string vazia (ou só espaços) como ausente.
function optional(value: string | undefined): string | undefined {
  const trimmed = value?.trim()
  return trimmed ? trimmed : undefined
}

async function enviarPeloResend(
  chave: string,
  from: string,
  { to, subject, html, text }: SendEmailParams,
): Promise<SendEmailResult> {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${chave}`,
    },
    body: JSON.stringify({
      from,
      to,
      subject,
      html,
      text,
      reply_to: appConfig.email.respostasPara,
    }),
  })
  if (!response.ok) {
    const body = (await response.text()).slice(0, 500)
    throw new Error(
      `Falha ao enviar e-mail pelo Resend (${response.status}): ${body}`,
    )
  }
  const data = (await response.json().catch(() => null)) as {
    id?: string
  } | null
  return { sent: true, provider: 'resend', id: data?.id }
}

async function enviarPeloCloudflare(
  binding: SendEmail,
  from: string,
  { to, subject, html, text }: SendEmailParams,
): Promise<SendEmailResult> {
  try {
    const result = await binding.send({
      to,
      from,
      replyTo: appConfig.email.respostasPara,
      subject,
      html,
      text,
    })
    return { sent: true, provider: 'cloudflare', id: result?.messageId }
  } catch (error) {
    const code = (error as { code?: string }).code
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(
      `Falha ao enviar e-mail pelo Cloudflare Email Service${code ? ` (${code})` : ''}: ${message}`,
    )
  }
}

export async function sendEmail(
  params: SendEmailParams,
): Promise<SendEmailResult> {
  // `env` só é lido aqui dentro, nunca em escopo de módulo.
  const vars = env as {
    AMBIENTE?: string
    EMAIL_LISTA_LIBERADA?: string
    EMAIL?: SendEmail
  }
  if (
    !destinatarioLiberado(vars.AMBIENTE, vars.EMAIL_LISTA_LIBERADA, params.to)
  ) {
    console.log(
      `[email] ambiente de testes: ${params.to} não está na lista liberada, não enviei.`,
    )
    return { sent: false, provider: 'bloqueado' }
  }

  const resendKey = optional(env.RESEND_API_KEY)
  const fromConfigurado = optional(env.EMAIL_FROM)
  const from = fromConfigurado ?? appConfig.email.remetente
  // O binding EMAIL fica declarado em wrangler.jsonc. Sem EMAIL_FROM (desenvolvimento local) ele
  // não é usado: o e-mail aparece no terminal.
  const binding = fromConfigurado ? vars.EMAIL : undefined

  let falha: unknown
  if (binding) {
    try {
      return await enviarPeloCloudflare(binding, from, params)
    } catch (error) {
      if (!resendKey) throw error
      falha = error
      console.error('[email] Email Service falhou, tentando o Resend', error)
    }
  }
  if (resendKey) {
    try {
      return await enviarPeloResend(resendKey, from, params)
    } catch (error) {
      if (!falha) throw error
      throw new Error(
        `${(falha as Error).message} | ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }

  // Em produção o texto do e-mail (pode ter código ou link de entrada) não vai para o log.
  if (emProducaoDeVerdade(vars.AMBIENTE, import.meta.env.DEV)) {
    throw new Error('Nenhum provedor de e-mail configurado.')
  }
  console.log(
    `[email] (nenhum provedor configurado) para: ${params.to} | assunto: ${params.subject}\n${params.text}`,
  )
  return { sent: false, provider: 'console' }
}

// Para e-mails que são efeito colateral de algo mais importante (cadastro, pagamento):
// uma falha de envio nunca deve derrubar a ação principal.
export async function sendEmailSafely(params: SendEmailParams): Promise<void> {
  try {
    await sendEmail(params)
  } catch (err) {
    console.error('[email] falha ao enviar', err)
  }
}
