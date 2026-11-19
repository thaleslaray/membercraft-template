// Consumidor da fila `FILA_VOOMP`: processa o aviso que o webhook gravou.
import { getDb } from '#/db/index'
import { avisarTecnico } from '#/lib/alerta'
import { avisarCursosLiberados } from '#/lib/email-cola'
import { type AvisoComErro, processarAviso } from '#/regras/vendas'

// Aviso da Voomp que ficou com erro: o técnico recebe um e-mail (uma vez por aviso, a regra garante).
export function alertarAvisoComErro(aviso: AvisoComErro) {
  return avisarTecnico({
    origem: 'webhook',
    detalhe: `aviso ${aviso.id} (${aviso.gatilho}${aviso.vendaId ? `, venda ${aviso.vendaId}` : ''}): ${aviso.motivo}`,
  })
}

export async function consumirMensagemDaVoomp(
  corpo: unknown,
  env: Env,
): Promise<void> {
  const avisoId = (corpo as { avisoId?: unknown } | null)?.avisoId
  if (typeof avisoId !== 'string' || !avisoId) {
    throw new Error('Mensagem da fila da Voomp sem avisoId.')
  }
  await processarAviso(getDb(env.DB), () => new Date(), avisoId, {
    aoLiberarCursos: (eventos) => avisarCursosLiberados(env, eventos),
    aoComErro: (aviso) => alertarAvisoComErro(aviso),
  })
}
