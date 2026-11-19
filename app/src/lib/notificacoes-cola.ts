// Cola do sininho com o runtime. Gatilhos de outras fatias chamam `avisarNoSininho(env, ...)`:
// nunca lança, porque o aviso é consequência de algo mais importante e não pode desfazê-lo.
import { getDb } from '#/db/index'
import { type EntradaDeNotificacao, notificar } from '#/regras/notificacoes'

export async function avisarNoSininho(env: Env, entrada: EntradaDeNotificacao) {
  try {
    return await notificar(getDb(env.DB), () => new Date(), entrada)
  } catch (erro) {
    console.error(`[sininho] não criei o aviso ${entrada.tipo}`, erro)
    return null
  }
}
