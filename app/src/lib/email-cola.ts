import { appConfig } from '#/config/app'
import { getDb } from '#/db/index'
import { getAuth } from '#/lib/auth'
import { sendEmail } from '#/lib/email'
import { avisarNoSininho } from '#/lib/notificacoes-cola'
import { agora } from '#/lib/relogio'
import { assuntoComCodigo } from '#/regras/atendimento'
import { linkDeDescadastro } from '#/regras/descadastro'
import {
  listaDeCursos,
  modeloDe,
  montarEmail,
  primeiroNome,
  tipoDoEmailDeLiberacao,
} from '#/regras/email-modelos'
import {
  cursosDaLiberacao,
  enfileirarEmail,
  type FilaDeEmail,
  marcarFalha,
  nomesDaLiberacao,
  type PedidoDeEmail,
  processarEnvio,
  textoVigente,
} from '#/regras/envio-de-email'
import type { EventoDeLiberacao } from '#/regras/matricula'

function filaDeEmail(env: Env): FilaDeEmail {
  return {
    send: async (mensagem) => {
      await env.FILA_EMAIL.send(mensagem)
    },
  }
}

/** Endereço público do app (sem barra no fim). */
export function baseDoApp(env: Env): string {
  return (env.BETTER_AUTH_URL || appConfig.url).replace(/\/$/, '')
}

/**
 * Pede um e-mail: grava no histórico e põe na fila. Nunca lança: o e-mail é consequência de algo
 * mais importante (matrícula, troca de e-mail) e não pode desfazê-lo. Devolve o status do pedido.
 */
export async function pedirEmail(env: Env, pedido: PedidoDeEmail) {
  try {
    return await enfileirarEmail(getDb(env.DB), agora, filaDeEmail(env), pedido)
  } catch (erro) {
    console.error(`[email] não consegui pedir o e-mail ${pedido.tipo}`, erro)
    return null
  }
}

/** Link de entrada de uso único, válido por 24 horas. Só para e-mail de conta que já existe. */
export async function gerarLinkDeEntrada(
  env: Env,
  email: string,
): Promise<string> {
  let url: string | undefined
  const auth = getAuth(env, {
    capturarLinkDeEntrada: (dados) => {
      url = dados.url
    },
  })
  await auth.api.signInMagicLink({
    body: { email, callbackURL: '/', errorCallbackURL: '/login' },
    headers: new Headers(),
  })
  if (!url) throw new Error('O Better Auth não devolveu o link de entrada.')
  return url
}

/** Consumidor da FILA_EMAIL: monta e envia o e-mail de uma linha do histórico. Lança para a fila tentar de novo. */
export async function processarEmailDaFila(env: Env, envioId: string) {
  const db = getDb(env.DB)
  const base = baseDoApp(env)
  return processarEnvio(db, agora, envioId, {
    montar: async (envio) => {
      const modelo = modeloDe(envio.tipo)
      const valores: Record<string, string> = {
        ...(modelo.variaveis.link ? { link: `${base}/` } : {}),
        ...(JSON.parse(envio.variaveis) as Record<string, string>),
      }
      if (modelo.linkDeEntrada) {
        valores.link = await gerarLinkDeEntrada(env, envio.para)
      }
      const descadastro =
        modelo.descadastro && envio.userId
          ? await linkDeDescadastro(
              base,
              env.BETTER_AUTH_SECRET,
              envio.userId,
              modelo.tipo,
            )
          : undefined
      const montado = montarEmail(
        modelo,
        await textoVigente(db, modelo.tipo),
        valores,
        { linkDeDescadastro: descadastro },
      )
      // Atendimento: o código da conversa vai no assunto, para responder o e-mail continuar a conversa.
      return modelo.tipo === 'resposta-do-atendimento' && valores.codigo
        ? {
            ...montado,
            subject: assuntoComCodigo(montado.subject, valores.codigo),
          }
        : montado
    },
    enviar: sendEmail,
  })
}

/** A fila de mortos desistiu de um e-mail: o histórico passa a dizer "falhou". */
export async function registrarFalhaDeEmail(
  env: Env,
  envioId: string,
  motivo: string,
) {
  await marcarFalha(getDb(env.DB), envioId, motivo)
}

/** Gatilho da matrícula (manual ou venda paga): sininho e e-mail "Curso liberado" com link de entrada. */
export async function avisarCursoLiberado(env: Env, evento: EventoDeLiberacao) {
  const nomes = await nomesDaLiberacao(getDb(env.DB), evento)
  // O sininho e o e-mail são independentes: um falhar não impede o outro (nenhum lança).
  await avisarNoSininho(env, {
    userId: evento.userId,
    tipo: 'curso-liberado',
    texto: `${nomes.curso ?? 'Um curso'} foi liberado para você.`,
    link: `/cursos/${evento.cursoId}`,
  })
  await pedirEmail(env, {
    tipo: 'curso-liberado',
    para: evento.email,
    userId: evento.userId,
    variaveis: {
      nome: primeiroNome(nomes.aluno),
      curso: nomes.curso ?? 'seu curso',
    },
  })
}

/**
 * Gatilho da venda paga: sininho por curso, mas UM e-mail por compra. Com 1 curso vale o modelo "Curso liberado";
 * com 2 ou mais, "Cursos liberados" com a lista. Os eventos são da mesma pessoa.
 */
export async function avisarCursosLiberados(
  env: Env,
  eventos: EventoDeLiberacao[],
) {
  const primeiro = eventos[0]
  if (!primeiro) return
  if (eventos.length === 1) return avisarCursoLiberado(env, primeiro)
  const db = getDb(env.DB)
  const [{ aluno }, cursos] = await Promise.all([
    nomesDaLiberacao(db, primeiro),
    cursosDaLiberacao(
      db,
      eventos.map((e) => e.cursoId),
    ),
  ])
  for (const c of cursos) {
    await avisarNoSininho(env, {
      userId: primeiro.userId,
      tipo: 'curso-liberado',
      texto: `${c.nome} foi liberado para você.`,
      link: `/cursos/${c.id}`,
    })
  }
  await pedirEmail(env, {
    tipo: tipoDoEmailDeLiberacao(eventos.length),
    para: primeiro.email,
    userId: primeiro.userId,
    variaveis: {
      nome: primeiroNome(aluno),
      cursos: listaDeCursos(
        cursos.length > 0 ? cursos.map((c) => c.nome) : ['Seus cursos'],
      ),
    },
  })
}

/** Gatilho da troca de e-mail: o aviso vai ao endereço antigo e ao novo. */
export async function avisarTrocaDeEmail(
  env: Env,
  troca: { userId: string; antigo: string; novo: string; nome: string },
) {
  const variaveis = {
    nome: primeiroNome(troca.nome),
    emailAntigo: troca.antigo,
    emailNovo: troca.novo,
  }
  for (const para of [troca.antigo, troca.novo]) {
    await pedirEmail(env, {
      tipo: 'troca-de-email',
      para,
      userId: troca.userId,
      variaveis,
    })
  }
}
