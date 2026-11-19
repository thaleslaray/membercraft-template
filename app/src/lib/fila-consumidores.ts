// Consumidores das filas do Worker: um mapa por nome de fila (sem o prefixo `escola-` / `escola-teste-`),
// em vez de um `if/else` por fila no `queue()` do `src/server.ts`. Fila nova = uma linha em
// `CONSUMIDORES` (e, se a fila de mortos precisa marcar algo, uma em `AO_DESISTIR`).
//
// Falha de um consumidor: `retry()` (10 s depois, até 3 vezes); esgotadas as tentativas, a mensagem
// vai para a fila de mortos (`escola-mortos`), tratada por `tratarMensagemDeMortos`.
import { avisarTecnico } from '#/lib/alerta'
import {
  processarPdfDaFila,
  registrarFalhaDoPdf,
} from '#/lib/certificados-cola'
import { processarEmailDaFila, registrarFalhaDeEmail } from '#/lib/email-cola'
import { consumirMensagemDaVoomp } from '#/lib/fila-voomp'
import type { OrigemDaFalha } from '#/regras/alerta-tecnico'

type Corpo = { origem?: string; envioId?: string; certificadoId?: string }
const corpoDe = (corpo: unknown) => (corpo ?? {}) as Corpo

type Consumidor = (corpo: unknown, env: Env) => Promise<void>

export const CONSUMIDORES: Readonly<Record<string, Consumidor>> = {
  // Avisos de venda da Voomp (#43).
  voomp: (corpo, env) => consumirMensagemDaVoomp(corpo, env),
  // E-mails de verdade (#45).
  email: async (corpo, env) => {
    const { envioId } = corpoDe(corpo)
    if (!envioId) throw new Error('mensagem sem envioId')
    await processarEmailDaFila(env, envioId)
  },
  // PDFs dos certificados (#55).
  pdf: async (corpo, env) => {
    const { certificadoId } = corpoDe(corpo)
    if (!certificadoId) throw new Error('mensagem sem certificadoId')
    await processarPdfDaFila(env, certificadoId)
  },
}

interface AoDesistir {
  /** O que marcar quando a fila desiste da mensagem (nunca lança: o erro vai ao log). */
  marcar: (corpo: Corpo, env: Env) => Promise<void>
  /** Origem do alerta ao técnico; `false` quando a própria marcação já avisa. */
  alertar: OrigemDaFalha | false
}

// Pelo `origem` que a mensagem declara. Sem `origem` conhecida, sai como falha de fila.
const AO_DESISTIR: Readonly<Record<string, AoDesistir>> = {
  webhook: { marcar: async () => {}, alertar: 'webhook' },
  email: {
    marcar: async (corpo, env) => {
      if (!corpo.envioId) return
      await registrarFalhaDeEmail(
        env,
        corpo.envioId,
        'A fila desistiu depois de todas as tentativas.',
      ).catch((erro) =>
        console.error('[fila-mortos] não marquei a falha do e-mail', erro),
      )
    },
    alertar: 'email',
  },
  // O PDF do certificado desistiu: o painel diz "falhou" e a própria marcação avisa o técnico.
  pdf: {
    marcar: async (corpo, env) => {
      if (corpo.certificadoId)
        await registrarFalhaDoPdf(env, corpo.certificadoId)
    },
    alertar: false,
  },
}

export async function tratarMensagemDeMortos(
  message: Message<unknown>,
  env: Env,
): Promise<void> {
  const texto = JSON.stringify(message.body)
  console.error(`[fila-mortos] mensagem desistida de ${message.id}: ${texto}`)
  const corpo = corpoDe(message.body)
  const tratamento = corpo.origem ? AO_DESISTIR[corpo.origem] : undefined
  await tratamento?.marcar(corpo, env)
  if (tratamento?.alertar !== false) {
    await avisarTecnico({
      origem: tratamento?.alertar ?? 'fila',
      detalhe: `mensagem ${message.id}: ${texto.slice(0, 500)}`,
    })
  }
  message.ack()
}

/** O `queue()` do Worker: cada mensagem vai ao consumidor da fila; falha pede nova tentativa. */
export async function consumirLote(
  batch: MessageBatch<unknown>,
  env: Env,
): Promise<void> {
  const fila = batch.queue.replace(/^escola-(teste-)?/, '')
  for (const message of batch.messages) {
    if (fila === 'mortos') {
      await tratarMensagemDeMortos(message, env)
      continue
    }
    const consumidor = CONSUMIDORES[fila]
    if (!consumidor) {
      console.log(`[fila:${fila}] mensagem ${message.id} recebida`)
      message.ack()
      continue
    }
    try {
      await consumidor(message.body, env)
      message.ack()
    } catch (erro) {
      console.error(`[fila:${fila}] mensagem ${message.id} falhou`, erro)
      message.retry()
    }
  }
}
