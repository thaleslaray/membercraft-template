// Cola do Atendimento com o runtime: e-mails ao aluno e à equipe, entrada pelo Email Routing
// (suporte@ e help@) e a coleta dos avisos agrupados. As regras estão em `src/regras/atendimento.ts`.
import { appConfig } from '#/config/app'
import { getDb } from '#/db/index'
import { avisarTecnico } from '#/lib/alerta'
import { baseDoApp, pedirEmail } from '#/lib/email-cola'
import { avisarNoSininho } from '#/lib/notificacoes-cola'
import { agora } from '#/lib/relogio'
import {
  abrirConversaPelaEquipe,
  chaveDoAnexo,
  DONO_DO_EMAIL,
  type EntradaDaEquipe,
  ehRespostaAutomatica,
  htmlParaTexto,
  LIMITE_DE_ANEXOS,
  type RespostaDaEquipe,
  receberEmail,
  validarImagem,
} from '#/regras/atendimento'
import {
  primeiroAuthenticationResults,
  remetenteAutenticado,
} from '#/regras/autenticacao-de-email'
import { primeiroNome } from '#/regras/email-modelos'

/**
 * E-mail "Resposta do atendimento" a cada resposta da equipe. Para o Visitante (sem conta) o texto
 * da resposta vai no próprio e-mail, e é por ele que a conversa continua. O código da conversa entra
 * no assunto na hora do envio (`processarEmailDaFila`).
 */
export async function avisarRespostaDaEquipe(
  env: Env,
  resposta: RespostaDaEquipe,
) {
  const base = baseDoApp(env)
  await pedirEmail(env, {
    tipo: 'resposta-do-atendimento',
    para: resposta.para.email,
    userId: resposta.para.userId,
    variaveis: {
      nome: primeiroNome(resposta.para.nome),
      assuntoDaConversa: resposta.assunto,
      resposta: resposta.texto,
      codigo: resposta.codigo,
      link: resposta.para.visitante
        ? base
        : `${base}/atendimento/${resposta.conversaId}`,
    },
  })
  // Sininho do aluno (#46): só quem tem conta recebe (o Visitante não tem sininho).
  if (resposta.para.userId) {
    await avisarNoSininho(env, {
      userId: resposta.para.userId,
      tipo: 'resposta-do-atendimento',
      texto: `A equipe respondeu: ${resposta.assunto}`,
      link: `/atendimento/${resposta.conversaId}`,
    })
  }
}

/**
 * Para a #56 (Pedido do MEC com "Problema"): a equipe abre a conversa com a aluna e ela é avisada
 * por e-mail. Devolve o id da conversa.
 */
export async function abrirConversaPelaEquipeEAvisar(
  env: Env,
  entrada: EntradaDaEquipe,
): Promise<string> {
  const resposta = await abrirConversaPelaEquipe(
    getDb(env.DB),
    agora,
    entrada,
    {
      aoResponderPelaEquipe: (r) => avisarRespostaDaEquipe(env, r),
    },
  )
  return resposta.conversaId
}

// Os endereços do próprio suporte: e-mail vindo deles é eco ou laço, nunca um aluno.
function enderecoProprio(email: string): boolean {
  const e = email.toLowerCase()
  const dominio = appConfig.email.respostasPara.split('@')[1]
  return (
    e === appConfig.email.respostasPara.toLowerCase() ||
    e === `help@${dominio}` ||
    e === `escola@${dominio}`
  )
}

const LIMITE_DO_EMAIL_BRUTO = 25 * 1024 * 1024

/** Handler `email()` do Worker: o Email Routing entrega aqui o que chega em suporte@ e help@. */
export async function receberEmailDoSuporte(
  env: Env,
  message: ForwardableEmailMessage,
) {
  try {
    if (message.rawSize > LIMITE_DO_EMAIL_BRUTO) {
      message.setReject('Mensagem grande demais.')
      return
    }
    if (ehRespostaAutomatica((nome) => message.headers.get(nome))) {
      console.log(`[atendimento] resposta automática de ${message.from}`)
      return
    }
    // Só carrega o leitor de MIME quando um e-mail chega.
    const { default: PostalMime } = await import('postal-mime')
    const bruto = await new Response(message.raw).arrayBuffer()
    const email = await PostalMime.parse(bruto)
    const de = (email.from?.address || message.from).trim().toLowerCase()
    if (enderecoProprio(de)) {
      console.log(`[atendimento] e-mail de ${de} ignorado (endereço próprio)`)
      return
    }

    const anexos: string[] = []
    for (const anexo of email.attachments) {
      if (anexos.length >= LIMITE_DE_ANEXOS) break
      const conteudo =
        typeof anexo.content === 'string'
          ? new TextEncoder().encode(anexo.content)
          : anexo.content
      const tipo = anexo.mimeType.toLowerCase()
      if (validarImagem({ tipo, tamanho: conteudo.byteLength })) continue
      const chave = chaveDoAnexo(
        DONO_DO_EMAIL,
        crypto.randomUUID(),
        anexo.filename ?? 'imagem',
      )
      await env.BUCKET.put(chave, conteudo, {
        httpMetadata: { contentType: tipo },
      })
      anexos.push(chave)
    }

    const resultado = await receberEmail(getDb(env.DB), agora, {
      de,
      nome: email.from?.name,
      assunto: email.subject ?? '',
      texto: email.text ?? htmlParaTexto(email.html ?? ''),
      anexos,
      autenticado: remetenteAutenticado(
        primeiroAuthenticationResults(bruto),
        de,
      ),
    })
    console.log(`[atendimento] e-mail de ${de}: ${resultado.resultado}`)
    if (resultado.resultado === 'limitado') {
      message.setReject(
        'Você abriu muitas conversas na última hora. Tente de novo mais tarde.',
      )
    }
  } catch (erro) {
    console.error('[atendimento] não consegui receber o e-mail', erro)
    await avisarTecnico({
      origem: 'tarefa',
      detalhe: `e-mail de ${message.from} ao suporte: ${erro instanceof Error ? erro.message : String(erro)}`,
    })
    message.setReject(
      'Não consegui receber sua mensagem agora. Tente de novo em instantes.',
    )
  }
}
