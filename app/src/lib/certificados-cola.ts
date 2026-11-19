// Cola dos certificados com o runtime (#55): liga as regras (`src/regras/certificados.ts`) à
// FILA_PDF, ao R2, ao sininho e aos e-mails. Os gatilhos (conclusão de aula, aprovação de quiz,
// lançamento de pontos, confirmação do nome, ativação do modelo) usam as funções daqui, que NUNCA
// lançam: o certificado é consequência de algo mais importante e não pode desfazê-lo.
//
// O Pedido do MEC (#56) é aberto aqui, em `ganchos()`, para TODO certificado novo (inclusive os dos
// gatilhos e do retroativo): só nasce se o curso estiver marcado "gera Pedido do MEC". O parâmetro
// `extras.aoEmitirCertificado` continua disponível a quem chama, e roda por último.
import { env } from 'cloudflare:workers'
import { getDb } from '#/db/index'
import { avisarTecnico } from '#/lib/alerta'
import { baseDoApp, pedirEmail } from '#/lib/email-cola'
import { avisarNoSininho } from '#/lib/notificacoes-cola'
import { abrirPedidoDoMecNaEmissao } from '#/lib/pedido-do-mec-cola'
import { agora } from '#/lib/relogio'
import type { Ganchos as GanchosDaAvaliacao } from '#/regras/avaliacoes'
import {
  type CertificadoEmitido,
  chaveDoPdf,
  confirmarNome,
  dadosParaAvisarEmissao,
  dadosParaOPdf,
  emitirRetroativo,
  type GanchosDoCertificado,
  marcarPdfFalhou,
  marcarPdfPronto,
  pendentesDoAluno,
  type ResultadoRetroativo,
  verificarEEmitir,
} from '#/regras/certificados'
import type { Ganchos as GanchosDosComentarios } from '#/regras/comentarios'
import { primeiroNome } from '#/regras/email-modelos'
import {
  ganchosDaAvaliacao,
  ganchosDaMelhorResposta,
  ganchosDeProgresso,
  ganchosDoQuizComPontos,
  ganchosDosComentarios,
} from '#/regras/pontos'
import {
  cursoDaAula,
  type Ganchos as GanchosDoProgresso,
} from '#/regras/progresso'
import type { Ganchos as GanchosDasPublicacoes } from '#/regras/publicacoes'
import type { GanchosDoQuiz } from '#/regras/quiz'

/** O corpo da mensagem da FILA_PDF. `origem` deixa a fila de mortos dizer de onde veio. */
export interface MensagemDoPdf {
  certificadoId: string
  origem: 'pdf'
}

export async function enfileirarPdf(env: Env, certificadoId: string) {
  const mensagem: MensagemDoPdf = { certificadoId, origem: 'pdf' }
  await env.FILA_PDF.send(mensagem)
}

/** Ganchos de verdade: abre o Pedido do MEC, enfileira o PDF e depois roda o gancho de quem chamou. */
function ganchos(
  env: Env,
  extras: GanchosDoCertificado = {},
): GanchosDoCertificado {
  return {
    aoEmitirCertificado: async (certificado: CertificadoEmitido) => {
      // Primeiro o pedido (nunca lança): uma falha da fila do PDF não pode fazê-lo se perder.
      await abrirPedidoDoMecNaEmissao(env, certificado)
      await enfileirarPdf(env, certificado.id)
      await extras.aoEmitirCertificado?.(certificado)
    },
  }
}

async function silencioso<T>(
  o: string,
  fazer: () => Promise<T>,
): Promise<T | null> {
  try {
    return await fazer()
  } catch (erro) {
    console.error(`[certificados] ${o} falhou`, erro)
    return null
  }
}

/**
 * Confere as exigências e emite o que estiver cumprido. Sem `cursoId`, olha todos os cursos com
 * modelo ativo (gancho dos pontos, que nem sempre sabem o curso).
 */
export async function verificarCertificados(
  env: Env,
  userId: string,
  cursoId?: string | null,
  extras: GanchosDoCertificado = {},
): Promise<void> {
  await silencioso('verificar', async () => {
    const db = getDb(env.DB)
    const g = ganchos(env, extras)
    if (cursoId) {
      await verificarEEmitir(db, agora, userId, cursoId, g)
      return
    }
    for (const p of await pendentesDoAluno(db, userId)) {
      await verificarEEmitir(db, agora, userId, p.cursoId, g)
    }
  })
}

/** Ativou o modelo ou facilitou as exigências: quem já cumpre recebe o certificado. */
export async function emitirRetroativoDoCurso(
  env: Env,
  cursoId: string,
  extras: GanchosDoCertificado = {},
): Promise<ResultadoRetroativo> {
  return (
    (await silencioso('retroativo', () =>
      emitirRetroativo(getDb(env.DB), agora, cursoId, ganchos(env, extras)),
    )) ?? { emitidos: [], aguardandoNome: [] }
  )
}

/** O aluno confirmou o nome: o que esperava por isso é emitido. Erros de validação sobem. */
export async function confirmarNomeEEmitir(
  env: Env,
  userId: string,
  nome: string,
  extras: GanchosDoCertificado = {},
): Promise<number> {
  const emitidos = await confirmarNome(
    getDb(env.DB),
    agora,
    userId,
    nome,
    ganchos(env, extras),
  )
  return emitidos.length
}

async function lerImagem(env: Env, chave: string): Promise<Uint8Array> {
  const objeto = await env.BUCKET.get(chave)
  if (!objeto) throw new Error(`Imagem do modelo não encontrada: ${chave}`)
  return new Uint8Array(await objeto.arrayBuffer())
}

/** Consumidor da FILA_PDF: gera o PDF, guarda no R2 e avisa o aluno na primeira vez. Lança para a fila tentar de novo. */
export async function processarPdfDaFila(env: Env, certificadoId: string) {
  const db = getDb(env.DB)
  const dados = await dadosParaOPdf(db, certificadoId)
  // Certificado ou modelo apagado: não há o que gerar nem o que tentar de novo.
  if (!dados) return
  const [frente, verso] = await Promise.all([
    lerImagem(env, dados.frente),
    dados.verso ? lerImagem(env, dados.verso) : Promise.resolve(null),
  ])
  // Carregado só aqui: pdf-lib e fontkit pesam na partida do Worker e só servem para gerar certificado.
  const { enderecoDeValidacao, gerarPdfDoCertificado } = await import(
    '#/regras/certificado-pdf'
  )
  const pdf = await gerarPdfDoCertificado(
    dados,
    { frente, verso },
    enderecoDeValidacao(baseDoApp(env), dados.codigo),
  )
  const chave = chaveDoPdf(certificadoId)
  await env.BUCKET.put(chave, pdf, {
    httpMetadata: { contentType: 'application/pdf' },
  })
  const { primeiraVez } = await marcarPdfPronto(db, agora, certificadoId, chave)
  if (primeiraVez) await avisarEmissao(env, certificadoId)
}

async function avisarEmissao(env: Env, certificadoId: string) {
  const dono = await dadosParaAvisarEmissao(getDb(env.DB), certificadoId)
  if (!dono) return
  // O sininho e o e-mail são independentes: um falhar não impede o outro (nenhum lança).
  await avisarNoSininho(env, {
    userId: dono.id,
    tipo: 'certificado',
    texto: `Seu certificado de ${dono.curso} está pronto.`,
    link: '/certificados',
  })
  await pedirEmail(env, {
    tipo: 'certificado-emitido',
    para: dono.email,
    userId: dono.id,
    variaveis: {
      nome: primeiroNome(dono.nome),
      curso: dono.curso,
      link: `${baseDoApp(env)}/certificados`,
    },
  })
}

/** A fila de mortos desistiu do PDF: o painel passa a dizer "falhou" e o técnico é avisado. */
export async function registrarFalhaDoPdf(env: Env, certificadoId: string) {
  await silencioso('marcar falha', () =>
    marcarPdfFalhou(getDb(env.DB), certificadoId),
  )
  await avisarTecnico({
    origem: 'pdf',
    detalhe: `certificado ${certificadoId}: a fila desistiu depois de todas as tentativas.`,
  })
}

// ---------- Gatilhos: quem lança pontos ou conclui algo confere o certificado ----------

/** Aprovação em quiz: os pontos (#54) e depois o certificado (#55). */
export const ganchosDoQuizComPontosECertificado: Pick<
  GanchosDoQuiz,
  'aoAprovarPelaPrimeiraVez'
> = {
  aoAprovarPelaPrimeiraVez: async (c) => {
    await ganchosDoQuizComPontos.aoAprovarPelaPrimeiraVez?.(c)
    await verificarCertificados(env, c.userId)
  },
}

/** Conclusão de aula: os pontos e depois o certificado do curso da aula. */
export const ganchosDeProgressoComCertificado: Pick<
  GanchosDoProgresso,
  'aoConcluirAula' | 'aoDesmarcarAula'
> = {
  ...ganchosDeProgresso,
  aoConcluirAula: async (c) => {
    await ganchosDeProgresso.aoConcluirAula?.(c)
    await verificarCertificados(
      env,
      c.userId,
      await cursoDaAula(c.db, c.aulaId),
    )
  },
}

export const ganchosDosComentariosComCertificado: GanchosDosComentarios = {
  ...ganchosDosComentarios,
  aoComentarPelaPrimeiraVezNaAula: async (c) => {
    await ganchosDosComentarios.aoComentarPelaPrimeiraVezNaAula?.(c)
    await verificarCertificados(env, c.userId)
  },
}

export const ganchosDaAvaliacaoComCertificado: GanchosDaAvaliacao = {
  aoAvaliarPelaPrimeiraVez: async (c) => {
    await ganchosDaAvaliacao.aoAvaliarPelaPrimeiraVez?.(c)
    await verificarCertificados(env, c.userId)
  },
}

export const ganchosDaMelhorRespostaComCertificado: GanchosDasPublicacoes = {
  ...ganchosDaMelhorResposta,
  aoEscolherMelhorResposta: async (c) => {
    await ganchosDaMelhorResposta.aoEscolherMelhorResposta?.(c)
    await verificarCertificados(env, c.autorDaResposta)
  },
}
