// Aviso das filas no sininho da equipe: quando uma fila de `FILAS` (`src/regras/filas.ts`, o registro
// único) ganha item novo, a equipe recebe UM aviso ("N novos itens: ..."), com o link da tela da fila.
//
// A rotina de 15 minutos (`avisarFilasDaEquipe`) compara a contagem com a última que viu: se subiu,
// avisa; se desceu, só atualiza. O aviso e o marco novo gravam juntos (`db.batch`): ou os dois, ou nenhum.

import {
  lerEstadoDeAviso,
  prepararEstadoDeAviso,
} from '#/regras/estado-de-aviso'
import type { FilaDoPainel } from '#/regras/filas'
import { idsDaEquipe, prepararNotificacoes } from '#/regras/notificacoes'
import { type Banco, comoLibsql, type Relogio } from '#/regras/tipos'

const chaveDe = (id: string) => `fila:${id}`

/** Devolve, por fila, quantos itens novos avisou. Uma fila que falha ao contar fica de fora e vai ao log. */
export async function avisarFilasDaEquipe(
  banco: Banco,
  agora: Relogio,
  filas: readonly FilaDoPainel[],
): Promise<Record<string, number>> {
  const avisados: Record<string, number> = {}
  if (filas.length === 0) return avisados
  const equipe = await idsDaEquipe(banco)
  for (const fila of filas) {
    try {
      const atual = await fila.contar(banco)
      const chave = chaveDe(fila.id)
      // Na primeira vez só aprende a contagem: o que já estava na fila não vira aviso.
      const antes = (await lerEstadoDeAviso(banco, chave)) ?? atual
      const novos = atual - antes
      const avisos =
        novos > 0
          ? prepararNotificacoes(banco, agora, equipe, {
              tipo: 'fila-da-equipe',
              texto: `${novos} ${novos === 1 ? 'novo item' : 'novos itens'}: ${fila.aviso}`,
              link: fila.para,
            })
          : []
      await comoLibsql(banco).batch([
        ...avisos,
        prepararEstadoDeAviso(banco, agora, chave, atual),
      ] as [ReturnType<typeof prepararEstadoDeAviso>])
      if (novos > 0) avisados[fila.id] = novos
    } catch (erro) {
      console.error(`[filas] não avisei a fila "${fila.id}"`, erro)
    }
  }
  return avisados
}
