// Cola da conferência da Hotmart (#134): liga a regra (`src/regras/conferencia-hotmart.ts`) ao cliente
// real da API e ao e-mail "Curso liberado". Usada pelo cron diário e pelo botão do Proprietário.
import { getDb } from '#/db/index'
import { avisarCursosLiberados } from '#/lib/email-cola'
import { alertarAvisoComErro } from '#/lib/fila-voomp'
import { clienteDaHotmart } from '#/lib/hotmart-cliente'
import {
  conferirHistoricoHotmart,
  type ResumoDaConferenciaHotmart,
} from '#/regras/conferencia-hotmart'

/** `null` quando não há credencial salva: nada a fazer, sem registro e sem alerta. */
export async function rodarConferenciaHotmart(
  env: Env,
  origem: 'cron' | 'manual',
): Promise<ResumoDaConferenciaHotmart | null> {
  const db = getDb(env.DB)
  const cliente = await clienteDaHotmart(db)
  if (!cliente) return null
  return conferirHistoricoHotmart(db, () => new Date(), cliente, {
    origem,
    aoLiberarCursos: (eventos) => avisarCursosLiberados(env, eventos),
    aoComErro: alertarAvisoComErro,
  })
}
