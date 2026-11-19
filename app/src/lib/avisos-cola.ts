// Cola dos avisos agendados com o runtime (chamada pelos jobs de src/lib/jobs.ts).
import { getDb } from '#/db/index'
import { baseDoApp, pedirEmail } from '#/lib/email-cola'
import { agora } from '#/lib/relogio'
import { AGRUPADORES } from '#/regras/agrupadores'
import { enviarAgrupamentosProntos } from '#/regras/agrupamento-envio'
import { rodarAvisosAgendados } from '#/regras/avisos-agendados'
import { avisarFilasDaEquipe } from '#/regras/contadores-de-fila'
import { FILAS } from '#/regras/filas'

/** Cron diário: conteúdo liberado, acesso expirando, acesso pronto e sentimos sua falta. */
export async function rodarAvisosDoDia(env: Env) {
  return rodarAvisosAgendados(getDb(env.DB), agora, {
    pedirEmail: (pedido) => pedirEmail(env, pedido),
  })
}

/** Cron de 15 em 15 minutos: agrupamento de e-mails e sininho da equipe para as filas. */
export async function rodarAvisosDoQuartoDeHora(env: Env) {
  const db = getDb(env.DB)
  const agrupados = await enviarAgrupamentosProntos(
    db,
    agora,
    {
      pedirEmail: (pedido) => pedirEmail(env, pedido),
      baseDoApp: baseDoApp(env),
    },
    AGRUPADORES,
  )
  const filas = await avisarFilasDaEquipe(db, agora, FILAS)
  return { agrupados, filas }
}
