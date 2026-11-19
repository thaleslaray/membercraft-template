// Cola do Pedido do MEC (#56) com o runtime: abre o pedido na emissão do certificado, avisa a aluna
// quando a equipe libera (e-mail e sininho), abre o Atendimento do "Problema" e destaca no sininho
// da equipe o que passou de 5 dias úteis. As regras estão em `src/regras/pedido-do-mec.ts`.
import { getDb } from '#/db/index'
import { baseDoApp, pedirEmail } from '#/lib/email-cola'
import { avisarNoSininho } from '#/lib/notificacoes-cola'
import { agora } from '#/lib/relogio'
import type { CertificadoEmitido } from '#/regras/certificados'
import { primeiroNome } from '#/regras/email-modelos'
import { idsDaEquipe, notificarVarios } from '#/regras/notificacoes'
import {
  criarPedidoDoMec,
  destacarPedidosAtrasados,
  type GanchosDoPedidoDoMec,
  LIMITE_DE_DIAS_UTEIS,
} from '#/regras/pedido-do-mec'

/**
 * Gancho `aoEmitirCertificado`: se o curso gera Pedido do MEC, abre o pedido. Nunca lança: o pedido
 * é consequência da emissão e não pode desfazê-la (o erro vai ao log).
 */
export async function abrirPedidoDoMecNaEmissao(
  env: Env,
  certificado: CertificadoEmitido,
): Promise<void> {
  try {
    await criarPedidoDoMec(getDb(env.DB), agora, certificado)
  } catch (erro) {
    console.error(
      `[pedido-do-mec] não abri o pedido do certificado ${certificado.id}`,
      erro,
    )
  }
}

/** Liberado: o e-mail "Certificado do MEC liberado" e o sininho da aluna (nenhum dos dois lança). */
export function ganchosDoPedidoDoMec(env: Env): GanchosDoPedidoDoMec {
  return {
    aoLiberar: async (pedido) => {
      await avisarNoSininho(env, {
        userId: pedido.userId,
        tipo: 'certificado',
        texto: `Seu certificado do MEC de ${pedido.cursoNome} foi liberado.`,
        link: '/certificados',
      })
      await pedirEmail(env, {
        tipo: 'certificado-mec-liberado',
        para: pedido.email,
        userId: pedido.userId,
        variaveis: {
          nome: primeiroNome(pedido.nome),
          curso: pedido.cursoNome,
          link: `${baseDoApp(env)}/certificados`,
        },
      })
    },
  }
}

/** Job do cron: avisa a equipe, uma vez por espera, dos pedidos que passaram de 5 dias úteis. */
export async function destacarPedidosAtrasadosDoMec(env: Env): Promise<number> {
  const db = getDb(env.DB)
  return destacarPedidosAtrasados(db, agora, async (novos) => {
    const equipe = await idsDaEquipe(db)
    await notificarVarios(db, agora, equipe, {
      tipo: 'fila-da-equipe',
      texto: `${novos} ${novos === 1 ? 'pedido do MEC passou' : 'pedidos do MEC passaram'} de ${LIMITE_DE_DIAS_UTEIS} dias úteis na fila`,
      link: '/painel/certificado-do-mec',
    })
  })
}
