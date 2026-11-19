// Quiz (#51 e #52): a equipe monta as perguntas (escolha única, múltipla exata, texto livre e
// envio de arquivo); o aluno envia uma Tentativa. Só de escolha, ele sabe na hora se foi aprovado.
// Com pergunta aberta a tentativa fica "Aguardando correção" até a Equipe marcar cada resposta
// como certa ou errada (`quiz-correcao.ts`); o aluno não refaz nesse estado. O quiz "sem correção"
// aceita as respostas abertas ao enviar.
//
// - Mínimo de acertos em %; de 1 a 15 tentativas ou ilimitado (`maximoDeTentativas` nulo).
// - A tentativa guarda uma cópia das perguntas (com as corretas e os comentários): editar o quiz
//   depois não estraga o histórico.
// - Pergunta de escolha SEM alternativa correta é aberta: a aluna marca (e pode escrever em "Outro")
//   e a Equipe corrige na fila, como o texto livre.
// - Pergunta opcional (`obrigatoria` falso) pode ficar sem resposta e não conta na nota; as de um
//   mesmo `grupoUmDe` exigem pelo menos uma respondida.
// - A alternativa correta só aparece com aprovação ou quando as tentativas acabam.
// - A aula com quiz obrigatório só conclui com aprovação; a aula do tipo quiz sempre exige.
//
// Pontos de extensão:
// - `tipo` da pergunta é aberto: um corretor em `CORRETORES` para os que se corrigem sozinhos; os
//   `TIPOS_ABERTOS` passam pela Equipe;
// - `aoAprovarPelaPrimeiraVez`: os pontos (#54) entram aqui (passado por quem chama).

import {
  and,
  asc,
  desc,
  eq,
  inArray,
  isNull,
  type SQLWrapper,
} from 'drizzle-orm'
import {
  alternativaDaPergunta,
  arquivoDaResposta,
  aula,
  liberacaoDeTentativa,
  perguntaDoQuiz,
  quiz,
  respostaAbertaDoQuiz,
  tentativaDoQuiz,
} from '#/db/schema'
import {
  type ArquivoEntregue,
  arquivoAceito,
  chaveDeEntregaDoAluno,
  ehAberta,
  ehTipoAceito,
  erroDeTipoDeArquivo,
  ID_DO_OUTRO,
  LIMITE_DO_TEXTO_LIVRE,
  MAXIMO_DE_ARQUIVOS,
  passaPelaEquipe,
  perguntasSemResposta,
  TEXTO_DO_GRUPO,
  TIPOS_ABERTOS,
  validarArquivoDeEntrega,
} from '#/regras/entregas'
import type { ContextoDaAula } from '#/regras/progresso'
import { type Banco, comoLibsql, type Relogio } from '#/regras/tipos'

export class ErroDeQuiz extends Error {
  constructor(mensagem: string) {
    super(mensagem)
    this.name = 'ErroDeQuiz'
  }
}

const novoId = () => crypto.randomUUID()

export const MAXIMO_DE_TENTATIVAS_LIMITE = 15
export const PONTOS_PADRAO = 100

// ---------- Tipos ----------

export const FORMATOS_DO_QUIZ = ['lista', 'conversa'] as const
export type FormatoDoQuiz = (typeof FORMATOS_DO_QUIZ)[number]

export type EstadoDaTentativa = 'aprovada' | 'reprovada' | 'aguardando_correcao'

export interface AlternativaDefinida {
  texto: string
  correta: boolean
  comentario?: string | null
  /** Chave da imagem no R2 (vinda dos Google Forms); nula = só texto. */
  imagem?: string | null
}

export interface PerguntaDefinida {
  tipo: string
  enunciado: string
  /** Só em pergunta de arquivo: o tipo aceito (`TIPOS_ACEITOS`). Ausente = qualquer. */
  aceita?: string
  imagem?: string | null
  /** Ausente = obrigatória. */
  obrigatoria?: boolean
  /** Perguntas do mesmo quiz com o mesmo valor: responder pelo menos uma. */
  grupoUmDe?: string | null
  /** Só em escolha sem gabarito: oferece "Outro:" com campo de texto. */
  outro?: boolean
  alternativas: AlternativaDefinida[]
}

export interface DefinicaoDoQuiz {
  soQuiz: boolean
  obrigatorio: boolean
  obrigatorioParaCertificado: boolean
  /** 0 a 100. */
  minimoDeAcertos: number
  /** 1 a 15; nulo = ilimitado. */
  maximoDeTentativas: number | null
  pontos: number
  /** "Sem correção": as respostas abertas são aceitas ao enviar, sem passar pela fila. */
  semCorrecao?: boolean
  /** Id publicado do Google Form de origem (#53). Indefinido = não mexe no que já está gravado. */
  origemGoogleForms?: string | null
  /** Ausente = `lista`. Em `conversa` a aluna responde uma pergunta por vez, como num chat. */
  formato?: FormatoDoQuiz
  /** Só em conversa: mensagens antes da 1ª pergunta, uma por linha. */
  abertura?: string | null
  /** Só em conversa: mensagem depois de enviar. */
  fecho?: string | null
  perguntas: PerguntaDefinida[]
}

/** Pergunta como o aluno a viu, guardada na tentativa. */
export interface PerguntaCopiada {
  id: string
  tipo: string
  enunciado: string
  imagem: string | null
  /** Só em pergunta de arquivo; tentativas antigas não têm o campo (= qualquer). */
  aceita?: string
  /** Tentativas antigas não têm o campo (= obrigatória). */
  obrigatoria?: boolean
  grupoUmDe?: string | null
  outro?: boolean
  alternativas: {
    id: string
    texto: string
    correta: boolean
    comentario: string | null
    imagem?: string | null
  }[]
}

/** O que o aluno marcou: id da pergunta -> ids das alternativas. */
export type Respostas = Record<string, string[]>

// ---------- Obrigatoriedade (pura) ----------

// ---------- Correção (pura) ----------

type Corretor = (pergunta: PerguntaCopiada, marcadas: string[]) => boolean

const idsDasCorretas = (p: PerguntaCopiada) =>
  p.alternativas.filter((a) => a.correta).map((a) => a.id)

// Um corretor por tipo de pergunta de escolha. Pergunta aberta (`TIPOS_ABERTOS`) não se corrige
// sozinha: a Equipe marca certa ou errada.
const CORRETORES: Record<string, Corretor> = {
  unica: (p, marcadas) =>
    marcadas.length === 1 && idsDasCorretas(p).includes(marcadas[0] as string),
  // Múltipla exata: tem que marcar todas as corretas e nenhuma errada.
  multipla: (p, marcadas) => {
    const corretas = idsDasCorretas(p)
    const marcou = new Set(marcadas)
    return (
      marcou.size === corretas.length && corretas.every((id) => marcou.has(id))
    )
  },
}

export { ehAberta, passaPelaEquipe, TIPOS_ABERTOS }

export const TIPOS_DE_PERGUNTA = [...Object.keys(CORRETORES), ...TIPOS_ABERTOS]

export type SituacaoDaResposta = 'pendente' | 'certa' | 'errada'

export function corrigirPergunta(
  pergunta: PerguntaCopiada,
  marcadas: string[],
): boolean {
  const corretor = CORRETORES[pergunta.tipo]
  if (!corretor) {
    throw new ErroDeQuiz('Este tipo de pergunta não tem correção automática.')
  }
  return corretor(pergunta, marcadas)
}

export interface ResultadoDaCorrecao {
  acertos: number
  total: number
  /** 0 a 100, arredondado para baixo. */
  percentual: number
  aprovada: boolean
  /** Respostas abertas que a Equipe ainda não marcou. */
  pendentes: number
  /** Ids das perguntas acertadas. */
  acertou: Set<string>
}

/**
 * Nota da tentativa. Aprova com acertos/total >= mínimo (conta exata, sem arredondar). Pergunta
 * aberta vale o que a Equipe decidiu (`abertas`); sem decisão está pendente, e com pendente não há
 * aprovação ainda.
 */
export function corrigirTentativa(
  perguntas: PerguntaCopiada[],
  respostas: Respostas,
  minimoDeAcertos: number,
  abertas: Record<string, SituacaoDaResposta> = {},
  puladas: ReadonlySet<string> = new Set(),
): ResultadoDaCorrecao {
  const acertou = new Set<string>()
  let pendentes = 0
  for (const p of perguntas) {
    if (puladas.has(p.id)) continue
    if (passaPelaEquipe(p)) {
      const situacao = abertas[p.id] ?? 'pendente'
      if (situacao === 'certa') acertou.add(p.id)
      if (situacao === 'pendente') pendentes++
    } else if (corrigirPergunta(p, respostas[p.id] ?? [])) {
      acertou.add(p.id)
    }
  }
  const total = perguntas.filter((p) => !puladas.has(p.id)).length
  const acertos = acertou.size
  return {
    acertos,
    total,
    percentual: total === 0 ? 0 : Math.floor((acertos * 100) / total),
    aprovada:
      pendentes === 0 && total > 0 && acertos * 100 >= minimoDeAcertos * total,
    pendentes,
    acertou,
  }
}

/**
 * Perguntas opcionais (ou de grupo "um destes") que a aluna deixou sem resposta: ficam fora da
 * nota. `comLinha` são os ids das respostas abertas gravadas (texto livre e arquivo só têm resposta
 * se ela escreveu ou enviou algo). Pergunta obrigatória nunca é pulada.
 */
export function puladasDaTentativa(
  copia: PerguntaCopiada[],
  respostas: Respostas,
  comLinha: ReadonlySet<string>,
): Set<string> {
  const puladas = new Set<string>()
  for (const p of copia) {
    if (p.obrigatoria !== false && !p.grupoUmDe) continue
    const respondeu = ehAberta(p.tipo)
      ? comLinha.has(p.id)
      : (respostas[p.id] ?? []).length > 0
    if (!respondeu) puladas.add(p.id)
  }
  return puladas
}

/** Tentativas restantes: nulo = ilimitado. */
export function tentativasRestantes(
  maximo: number | null,
  usadas: number,
): number | null {
  return maximo === null ? null : Math.max(0, maximo - usadas)
}

// ---------- Validação da definição ----------

function validarDefinicao(d: DefinicaoDoQuiz): DefinicaoDoQuiz {
  if (d.formato !== undefined && !FORMATOS_DO_QUIZ.includes(d.formato)) {
    throw new ErroDeQuiz('Formato inválido: use lista ou conversa.')
  }
  if (
    !Number.isInteger(d.minimoDeAcertos) ||
    d.minimoDeAcertos < 0 ||
    d.minimoDeAcertos > 100
  ) {
    throw new ErroDeQuiz('O mínimo de acertos vai de 0 a 100%.')
  }
  if (
    d.maximoDeTentativas !== null &&
    (!Number.isInteger(d.maximoDeTentativas) ||
      d.maximoDeTentativas < 1 ||
      d.maximoDeTentativas > MAXIMO_DE_TENTATIVAS_LIMITE)
  ) {
    throw new ErroDeQuiz(
      `As tentativas vão de 1 a ${MAXIMO_DE_TENTATIVAS_LIMITE}, ou ilimitadas.`,
    )
  }
  if (!Number.isInteger(d.pontos) || d.pontos < 0 || d.pontos > 100_000) {
    throw new ErroDeQuiz('Informe os pontos do exercício (zero ou mais).')
  }
  if (d.perguntas.length === 0) {
    throw new ErroDeQuiz('O quiz precisa de pelo menos uma pergunta.')
  }
  const perguntas = d.perguntas.map((p, i) => {
    const n = i + 1
    if (!TIPOS_DE_PERGUNTA.includes(p.tipo)) {
      throw new ErroDeQuiz(`Pergunta ${n}: tipo inválido.`)
    }
    const enunciado = p.enunciado.trim()
    if (!enunciado) throw new ErroDeQuiz(`Pergunta ${n}: escreva o enunciado.`)
    if (ehAberta(p.tipo)) {
      // Pergunta aberta não tem alternativas.
      const aceita = p.aceita ?? 'qualquer'
      if (!ehTipoAceito(aceita)) {
        throw new ErroDeQuiz(`Pergunta ${n}: tipo de arquivo inválido.`)
      }
      return {
        ...p,
        enunciado,
        imagem: p.imagem || null,
        aceita: p.tipo === 'arquivo' ? aceita : 'qualquer',
        obrigatoria: p.obrigatoria ?? true,
        grupoUmDe: p.grupoUmDe?.trim() || null,
        outro: false,
        alternativas: [],
      }
    }
    const alternativas = p.alternativas.map((a) => ({
      texto: a.texto.trim(),
      correta: a.correta,
      comentario: a.comentario?.trim() || null,
      imagem: a.imagem || null,
    }))
    const outro = p.outro ?? false
    if (alternativas.length + (outro ? 1 : 0) < 2) {
      throw new ErroDeQuiz(`Pergunta ${n}: coloque pelo menos 2 alternativas.`)
    }
    if (alternativas.some((a) => !a.texto)) {
      throw new ErroDeQuiz(`Pergunta ${n}: há alternativa sem texto.`)
    }
    const corretas = alternativas.filter((a) => a.correta).length
    // Nenhuma correta = escolha aberta, corrigida pela Equipe.
    if (p.tipo === 'unica' && corretas > 1) {
      throw new ErroDeQuiz(
        `Pergunta ${n}: marque no máximo uma alternativa correta.`,
      )
    }
    if (outro && corretas > 0) {
      throw new ErroDeQuiz(
        `Pergunta ${n}: "Outro" só vale em pergunta sem alternativa correta.`,
      )
    }
    return {
      ...p,
      enunciado,
      imagem: p.imagem || null,
      obrigatoria: p.obrigatoria ?? true,
      grupoUmDe: p.grupoUmDe?.trim() || null,
      outro,
      alternativas,
    }
  })
  return { ...d, perguntas }
}

// ---------- Leitura ----------

async function aulaAtiva(db: Banco, aulaId: string) {
  const [encontrada] = await comoLibsql(db)
    .select({ id: aula.id })
    .from(aula)
    .where(and(eq(aula.id, aulaId), isNull(aula.excluidoEm)))
  if (!encontrada) throw new ErroDeQuiz('Aula não encontrada.')
}

async function quizDaAula(db: Banco, aulaId: string) {
  const [linha] = await comoLibsql(db)
    .select()
    .from(quiz)
    .where(and(eq(quiz.aulaId, aulaId), isNull(quiz.excluidoEm)))
  return linha ?? null
}

// As duas consultas das perguntas (perguntas e alternativas), prontas para irem juntas num `batch`.
// `quizIds` é o id do quiz ou uma subconsulta que o devolve (quem chama ainda não sabe qual é).
function consultasDasPerguntas(
  d: ReturnType<typeof comoLibsql>,
  quizIds: string[] | SQLWrapper,
) {
  return {
    perguntas: d
      .select()
      .from(perguntaDoQuiz)
      .where(inArray(perguntaDoQuiz.quizId, quizIds))
      .orderBy(asc(perguntaDoQuiz.ordem)),
    alternativas: d
      .select({ a: alternativaDaPergunta })
      .from(alternativaDaPergunta)
      .innerJoin(
        perguntaDoQuiz,
        eq(perguntaDoQuiz.id, alternativaDaPergunta.perguntaId),
      )
      .where(inArray(perguntaDoQuiz.quizId, quizIds))
      .orderBy(asc(alternativaDaPergunta.ordem)),
  }
}

function montarPerguntas(
  perguntas: (typeof perguntaDoQuiz.$inferSelect)[],
  alternativas: { a: typeof alternativaDaPergunta.$inferSelect }[],
): PerguntaCopiada[] {
  return perguntas.map((p) => ({
    id: p.id,
    tipo: p.tipo,
    enunciado: p.enunciado,
    imagem: p.imagem,
    aceita: p.aceita,
    obrigatoria: p.obrigatoria,
    grupoUmDe: p.grupoUmDe,
    outro: p.outro,
    alternativas: alternativas
      .filter(({ a }) => a.perguntaId === p.id)
      .map(({ a }) => ({
        id: a.id,
        texto: a.texto,
        correta: a.correta,
        comentario: a.comentario,
        imagem: a.imagem,
      })),
  }))
}

async function perguntasDoQuiz(
  db: Banco,
  quizId: string,
): Promise<PerguntaCopiada[]> {
  const d = comoLibsql(db)
  const q = consultasDasPerguntas(d, [quizId])
  const [perguntas, alternativas] = await d.batch([q.perguntas, q.alternativas])
  return montarPerguntas(perguntas, alternativas)
}

const formatoDoQuiz = (valor: string): FormatoDoQuiz =>
  valor === 'conversa' ? 'conversa' : 'lista'

/** O quiz da aula como a equipe o edita (com as corretas). Nulo se a aula não tem quiz. */
export async function obterQuizDoPainel(
  db: Banco,
  aulaId: string,
): Promise<(DefinicaoDoQuiz & { id: string }) | null> {
  // O quiz, as perguntas e as alternativas saem numa ida só: as duas últimas pedem "o quiz desta aula"
  // por subconsulta, em vez de esperar o id do quiz chegar.
  const d = comoLibsql(db)
  const quizDaAulaAtiva = d
    .select({ id: quiz.id })
    .from(quiz)
    .where(and(eq(quiz.aulaId, aulaId), isNull(quiz.excluidoEm)))
  const q = consultasDasPerguntas(d, quizDaAulaAtiva)
  const [[linha], listaDePerguntas, alternativas] = await d.batch([
    d
      .select()
      .from(quiz)
      .where(and(eq(quiz.aulaId, aulaId), isNull(quiz.excluidoEm))),
    q.perguntas,
    q.alternativas,
  ])
  if (!linha) return null
  const perguntas = montarPerguntas(listaDePerguntas, alternativas)
  return {
    id: linha.id,
    soQuiz: linha.soQuiz,
    obrigatorio: linha.obrigatorio,
    obrigatorioParaCertificado: linha.obrigatorioParaCertificado,
    minimoDeAcertos: linha.minimoDeAcertos,
    maximoDeTentativas: linha.maximoDeTentativas,
    pontos: linha.pontos,
    semCorrecao: linha.semCorrecao,
    formato: formatoDoQuiz(linha.formato),
    abertura: linha.abertura,
    fecho: linha.fecho,
    perguntas: perguntas.map((p) => ({
      tipo: p.tipo,
      enunciado: p.enunciado,
      imagem: p.imagem,
      aceita: p.aceita,
      obrigatoria: p.obrigatoria ?? true,
      grupoUmDe: p.grupoUmDe ?? null,
      outro: p.outro ?? false,
      alternativas: p.alternativas.map((a) => ({
        texto: a.texto,
        correta: a.correta,
        comentario: a.comentario,
        imagem: a.imagem,
      })),
    })),
  }
}

// ---------- Escrita (equipe) ----------

/**
 * Cria ou substitui o quiz da aula. Perguntas e alternativas são regravadas por inteiro; as
 * tentativas antigas não sofrem porque guardam a própria cópia.
 */
export async function salvarQuiz(
  db: Banco,
  aulaId: string,
  entrada: DefinicaoDoQuiz,
): Promise<string> {
  await aulaAtiva(db, aulaId)
  const d = validarDefinicao(entrada)
  const existente = await quizDaAula(db, aulaId)
  const quizId = existente?.id ?? novoId()
  const dados = {
    soQuiz: d.soQuiz,
    obrigatorio: d.obrigatorio,
    obrigatorioParaCertificado: d.obrigatorioParaCertificado,
    minimoDeAcertos: d.minimoDeAcertos,
    maximoDeTentativas: d.maximoDeTentativas,
    pontos: d.pontos,
    semCorrecao: d.semCorrecao ?? false,
    formato: d.formato ?? 'lista',
    // Abertura e fecho só existem em conversa.
    abertura:
      (d.formato ?? 'lista') === 'conversa' ? d.abertura?.trim() || null : null,
    fecho:
      (d.formato ?? 'lista') === 'conversa' ? d.fecho?.trim() || null : null,
    ...(d.origemGoogleForms !== undefined && {
      origemGoogleForms: d.origemGoogleForms,
    }),
  }
  const c = comoLibsql(db)
  const antigas = c
    .select({ id: perguntaDoQuiz.id })
    .from(perguntaDoQuiz)
    .where(eq(perguntaDoQuiz.quizId, quizId))
  const novasPerguntas = d.perguntas.map((p, i) => ({
    id: novoId(),
    quizId,
    tipo: p.tipo,
    enunciado: p.enunciado,
    imagem: p.imagem ?? null,
    aceita: p.aceita ?? 'qualquer',
    obrigatoria: p.obrigatoria ?? true,
    grupoUmDe: p.grupoUmDe ?? null,
    outro: p.outro ?? false,
    ordem: i + 1,
    alternativas: p.alternativas,
  }))
  const novasAlternativas = novasPerguntas.flatMap((p) =>
    p.alternativas.map((a, i) => ({
      id: novoId(),
      perguntaId: p.id,
      texto: a.texto,
      correta: a.correta,
      comentario: a.comentario ?? null,
      imagem: a.imagem ?? null,
      ordem: i + 1,
    })),
  )
  const comandos = [
    existente
      ? c.update(quiz).set(dados).where(eq(quiz.id, quizId))
      : c.insert(quiz).values({ id: quizId, aulaId, ...dados }),
    c
      .delete(alternativaDaPergunta)
      .where(inArray(alternativaDaPergunta.perguntaId, antigas)),
    c.delete(perguntaDoQuiz).where(eq(perguntaDoQuiz.quizId, quizId)),
    ...novasPerguntas.map(({ alternativas: _, ...p }) =>
      c.insert(perguntaDoQuiz).values(p),
    ),
    ...novasAlternativas.map((a) => c.insert(alternativaDaPergunta).values(a)),
  ]
  await db.batch(comandos as [(typeof comandos)[number], ...typeof comandos])
  return quizId
}

/**
 * Tira o quiz da aula (só sem tentativas). É exclusão protegida: a linha ganha `excluidoEm`, some das
 * telas, e a limpeza diária apaga de vez (com perguntas e alternativas, em cascata) depois de 30 dias.
 */
export async function removerQuiz(
  db: Banco,
  agora: Relogio,
  aulaId: string,
): Promise<void> {
  const linha = await quizDaAula(db, aulaId)
  if (!linha) return
  const c = comoLibsql(db)
  const tentativas = await c
    .select({ id: tentativaDoQuiz.id })
    .from(tentativaDoQuiz)
    .where(eq(tentativaDoQuiz.quizId, linha.id))
  if (tentativas.length > 0) {
    throw new ErroDeQuiz(
      'Este quiz já tem tentativas de alunos e não pode ser removido.',
    )
  }
  await c.update(quiz).set({ excluidoEm: agora() }).where(eq(quiz.id, linha.id))
}

// ---------- Aluno ----------

export interface TentativaResumida {
  numero: number
  estado: EstadoDaTentativa
  acertos: number
  total: number
  percentual: number
  enviadaEm: Date
}

export interface ArquivoDaEntrega {
  id: string
  nome: string
  tipo: string
  tamanho: number
}

/** Resposta de texto livre ou de envio de arquivo, com o que a Equipe decidiu. */
export interface RespostaAberta {
  id: string
  texto: string | null
  situacao: SituacaoDaResposta
  comentario: string | null
  arquivos: ArquivoDaEntrega[]
}

export interface PerguntaDaTentativa {
  id: string
  tipo: string
  enunciado: string
  imagem: string | null
  /** Nulo na pergunta aberta que a Equipe ainda não corrigiu. */
  acertou: boolean | null
  /** Nas perguntas de texto livre, de arquivo e de escolha sem gabarito (a Equipe corrige). */
  aberta: RespostaAberta | null
  /** Opcional que ela deixou sem resposta: não entra na nota. */
  pulada: boolean
  /** Escolha com "Outro:": o texto que ela escreveu (vem em `aberta.texto`). */
  outro: boolean
  alternativas: {
    id: string
    texto: string
    marcada: boolean
    /** Comentário só das alternativas que o aluno marcou. */
    comentario: string | null
    /** Só vem preenchido quando a correta pode aparecer (`revelar`); senão nulo. */
    correta: boolean | null
  }[]
}

export interface DetalheDaTentativa extends TentativaResumida {
  perguntas: PerguntaDaTentativa[]
}

export interface QuizParaOAluno {
  id: string
  soQuiz: boolean
  obrigatorio: boolean
  obrigatorioParaCertificado: boolean
  semCorrecao: boolean
  formato: FormatoDoQuiz
  /** Mensagens antes da 1ª pergunta (uma por linha); só em conversa. */
  abertura: string | null
  /** Mensagem depois de enviar; só em conversa. */
  fecho: string | null
  minimoDeAcertos: number
  /** Já somadas as tentativas que a Equipe liberou. Nulo = ilimitado. */
  maximoDeTentativas: number | null
  /** Nulo = ilimitado. */
  restantes: number | null
  aprovado: boolean
  aguardandoCorrecao: boolean
  /** Dá para enviar uma nova tentativa agora. */
  podeEnviar: boolean
  /** A alternativa correta pode aparecer: aprovado ou tentativas esgotadas. */
  revelar: boolean
  /** Perguntas para responder, sem as corretas nem os comentários. */
  perguntas: {
    id: string
    tipo: string
    enunciado: string
    imagem: string | null
    aceita?: string
    obrigatoria: boolean
    grupoUmDe: string | null
    outro: boolean
    /** A Equipe corrige: texto livre, arquivo ou escolha sem gabarito. */
    corrigidaPelaEquipe: boolean
    alternativas: { id: string; texto: string; imagem: string | null }[]
  }[]
  tentativas: TentativaResumida[]
  ultimaTentativa: DetalheDaTentativa | null
}

const resumir = (
  t: typeof tentativaDoQuiz.$inferSelect,
): TentativaResumida => ({
  numero: t.numero,
  estado: t.estado,
  acertos: t.acertos,
  total: t.total,
  percentual: t.percentual,
  enviadaEm: t.enviadaEm,
})

/** As respostas abertas de uma tentativa (com os arquivos), por id da pergunta. */
export async function abertasDaTentativa(
  db: Banco,
  tentativaId: string,
): Promise<Map<string, RespostaAberta>> {
  const c = comoLibsql(db)
  const [respostas, arquivos] = await Promise.all([
    c
      .select()
      .from(respostaAbertaDoQuiz)
      .where(eq(respostaAbertaDoQuiz.tentativaId, tentativaId)),
    c
      .select()
      .from(arquivoDaResposta)
      .where(eq(arquivoDaResposta.tentativaId, tentativaId))
      .orderBy(asc(arquivoDaResposta.enviadoEm), asc(arquivoDaResposta.nome)),
  ])
  return new Map(
    respostas.map((r) => [
      r.perguntaId,
      {
        id: r.id,
        texto: r.texto,
        situacao: r.situacao,
        comentario: r.comentario,
        arquivos: arquivos
          .filter((a) => a.perguntaId === r.perguntaId)
          .map((a) => ({
            id: a.id,
            nome: a.nome,
            tipo: a.tipo,
            tamanho: a.tamanho,
          })),
      },
    ]),
  )
}

const acertouAberta = (situacao: SituacaoDaResposta | undefined) =>
  situacao === 'certa' ? true : situacao === 'errada' ? false : null

function detalhar(
  t: typeof tentativaDoQuiz.$inferSelect,
  revelar: boolean,
  abertas: Map<string, RespostaAberta>,
): DetalheDaTentativa {
  const copia = JSON.parse(t.perguntas) as PerguntaCopiada[]
  const respostas = JSON.parse(t.respostas) as Respostas
  return {
    ...resumir(t),
    perguntas: copia.map((p) => {
      const marcadas = respostas[p.id] ?? []
      const equipe = passaPelaEquipe(p)
      const aberta = equipe ? (abertas.get(p.id) ?? null) : null
      // Texto livre e arquivo só têm resposta gravada se ela escreveu ou enviou algo.
      const pulada = ehAberta(p.tipo) ? !aberta : marcadas.length === 0
      return {
        id: p.id,
        tipo: p.tipo,
        enunciado: p.enunciado,
        imagem: p.imagem,
        acertou: pulada
          ? null
          : equipe
            ? acertouAberta(aberta?.situacao)
            : corrigirPergunta(p, marcadas),
        aberta,
        pulada,
        outro: p.outro ?? false,
        alternativas: p.alternativas.map((a) => {
          const marcada = marcadas.includes(a.id)
          return {
            id: a.id,
            texto: a.texto,
            marcada,
            comentario: marcada ? a.comentario : null,
            correta: revelar ? a.correta : null,
          }
        }),
      }
    }),
  }
}

async function detalharComAbertas(
  db: Banco,
  t: typeof tentativaDoQuiz.$inferSelect,
  revelar: boolean,
) {
  return detalhar(t, revelar, await abertasDaTentativa(db, t.id))
}

async function tentativasDoAluno(db: Banco, quizId: string, userId: string) {
  return comoLibsql(db)
    .select()
    .from(tentativaDoQuiz)
    .where(
      and(
        eq(tentativaDoQuiz.quizId, quizId),
        eq(tentativaDoQuiz.userId, userId),
      ),
    )
    .orderBy(desc(tentativaDoQuiz.numero))
}

/** Tentativas que a Equipe liberou a mais para o aluno neste quiz. */
export async function liberacoesDoAluno(
  db: Banco,
  quizId: string,
  userId: string,
): Promise<number> {
  const linhas = await comoLibsql(db)
    .select({ id: liberacaoDeTentativa.id })
    .from(liberacaoDeTentativa)
    .where(
      and(
        eq(liberacaoDeTentativa.quizId, quizId),
        eq(liberacaoDeTentativa.userId, userId),
      ),
    )
  return linhas.length
}

/** Quantas tentativas o aluno tem ao todo: o máximo do quiz mais as liberadas. Nulo = ilimitado. */
export const limiteDoAluno = (maximo: number | null, liberadas: number) =>
  maximo === null ? null : maximo + liberadas

export function situacaoDoAluno(
  limite: number | null,
  tentativas: { estado: EstadoDaTentativa }[],
) {
  const aprovado = tentativas.some((t) => t.estado === 'aprovada')
  const aguardandoCorrecao = tentativas.some(
    (t) => t.estado === 'aguardando_correcao',
  )
  const restantes = tentativasRestantes(limite, tentativas.length)
  return {
    aprovado,
    aguardandoCorrecao,
    restantes,
    esgotado: restantes === 0,
    revelar: aprovado || restantes === 0,
    podeEnviar: !aprovado && !aguardandoCorrecao && restantes !== 0,
  }
}

/** O quiz da aula visto pelo aluno. Nulo se a aula não tem quiz. */
export async function obterQuizDoAluno(
  db: Banco,
  userId: string,
  aulaId: string,
): Promise<QuizParaOAluno | null> {
  await aulaAtiva(db, aulaId)
  const linha = await quizDaAula(db, aulaId)
  if (!linha) return null
  const [perguntas, tentativas, liberadas] = await Promise.all([
    perguntasDoQuiz(db, linha.id),
    tentativasDoAluno(db, linha.id, userId),
    liberacoesDoAluno(db, linha.id, userId),
  ])
  const limite = limiteDoAluno(linha.maximoDeTentativas, liberadas)
  const s = situacaoDoAluno(limite, tentativas)
  const ultima = tentativas[0]
  return {
    id: linha.id,
    soQuiz: linha.soQuiz,
    obrigatorio: linha.obrigatorio,
    obrigatorioParaCertificado: linha.obrigatorioParaCertificado,
    semCorrecao: linha.semCorrecao,
    formato: formatoDoQuiz(linha.formato),
    abertura: linha.abertura,
    fecho: linha.fecho,
    minimoDeAcertos: linha.minimoDeAcertos,
    maximoDeTentativas: limite,
    restantes: s.restantes,
    aprovado: s.aprovado,
    aguardandoCorrecao: s.aguardandoCorrecao,
    podeEnviar: s.podeEnviar,
    revelar: s.revelar,
    perguntas: perguntas.map((p) => ({
      id: p.id,
      tipo: p.tipo,
      enunciado: p.enunciado,
      imagem: p.imagem,
      aceita: p.aceita ?? 'qualquer',
      obrigatoria: p.obrigatoria ?? true,
      grupoUmDe: p.grupoUmDe ?? null,
      outro: p.outro ?? false,
      corrigidaPelaEquipe: passaPelaEquipe(p),
      alternativas: p.alternativas.map((a) => ({
        id: a.id,
        texto: a.texto,
        imagem: a.imagem ?? null,
      })),
    })),
    tentativas: tentativas.map(resumir).reverse(),
    ultimaTentativa: ultima
      ? await detalharComAbertas(db, ultima, s.revelar)
      : null,
  }
}

export interface GanchosDoQuiz {
  /** Roda uma vez, na primeira aprovação do aluno neste quiz (os pontos, #54). */
  aoAprovarPelaPrimeiraVez?: (
    contexto: ContextoDaAula & { quizId: string; pontos: number },
  ) => Promise<void>
}

/** O que o aluno entrega nas perguntas abertas, por id da pergunta. */
export interface EntregaDoAluno {
  textos?: Record<string, string>
  arquivos?: Record<string, ArquivoEntregue[]>
}

/** Onde os arquivos estão guardados (o R2): confere se o envio chegou e o tamanho real. */
export interface Armazenamento {
  tamanhoDoObjeto: (chave: string) => Promise<number | null>
}

interface EntregaConferida {
  textos: Map<string, string>
  arquivos: Map<string, (ArquivoEntregue & { tamanho: number })[]>
}

// Confere as respostas abertas: texto preenchido, de 1 a 3 arquivos da pasta do aluno que de fato
// chegaram ao R2 (o tamanho vale o do R2, não o que o navegador disse).
async function conferirEntrega(
  perguntas: PerguntaCopiada[],
  marcadas: Respostas,
  entrega: EntregaDoAluno,
  userId: string,
  armazenamento: Armazenamento | undefined,
): Promise<EntregaConferida> {
  const conferida: EntregaConferida = {
    textos: new Map(),
    arquivos: new Map(),
  }
  for (const [i, p] of perguntas.entries()) {
    const n = i + 1
    if (p.tipo === 'texto_livre') {
      const texto = (entrega.textos?.[p.id] ?? '').trim()
      if (!texto) continue
      if (texto.length > LIMITE_DO_TEXTO_LIVRE) {
        throw new ErroDeQuiz(
          `A resposta da pergunta ${n} passa de ${LIMITE_DO_TEXTO_LIVRE} caracteres.`,
        )
      }
      conferida.textos.set(p.id, texto)
    } else if (p.tipo === 'arquivo') {
      const enviados = entrega.arquivos?.[p.id] ?? []
      if (enviados.length === 0) continue
      if (enviados.length > MAXIMO_DE_ARQUIVOS) {
        throw new ErroDeQuiz(
          `Envie até ${MAXIMO_DE_ARQUIVOS} arquivos na pergunta ${n}.`,
        )
      }
      if (new Set(enviados.map((a) => a.chave)).size !== enviados.length) {
        throw new ErroDeQuiz('Arquivo repetido.')
      }
      const conferidos: (ArquivoEntregue & { tamanho: number })[] = []
      for (const a of enviados) {
        if (!chaveDeEntregaDoAluno(a.chave, userId) || !a.nome.trim()) {
          throw new ErroDeQuiz('Arquivo inválido.')
        }
        const tamanho = await armazenamento?.tamanhoDoObjeto(a.chave)
        if (tamanho === null || tamanho === undefined) {
          throw new ErroDeQuiz(`O arquivo ${a.nome} não chegou. Envie de novo.`)
        }
        const erro = validarArquivoDeEntrega({ tamanho }, 'direto')
        if (erro) throw new ErroDeQuiz(erro)
        if (!arquivoAceito(p.aceita, a.tipo ?? '', a.nome)) {
          throw new ErroDeQuiz(
            `Pergunta ${n}: ${erroDeTipoDeArquivo(p.aceita)}`,
          )
        }
        conferidos.push({
          chave: a.chave,
          nome: a.nome.trim().slice(0, 200),
          tipo: (a.tipo || 'application/octet-stream').slice(0, 100),
          tamanho,
        })
      }
      conferida.arquivos.set(p.id, conferidos)
    } else if ((marcadas[p.id] ?? []).includes(ID_DO_OUTRO)) {
      const texto = (entrega.textos?.[p.id] ?? '').trim()
      if (!texto) {
        throw new ErroDeQuiz(`Pergunta ${n}: escreva o texto de "Outro".`)
      }
      if (texto.length > LIMITE_DO_TEXTO_LIVRE) {
        throw new ErroDeQuiz(
          `A resposta da pergunta ${n} passa de ${LIMITE_DO_TEXTO_LIVRE} caracteres.`,
        )
      }
      conferida.textos.set(p.id, texto)
    }
  }
  return conferida
}

/**
 * O aluno envia as respostas. A parte de escolha é corrigida na hora; as respostas abertas
 * (texto e arquivos) deixam a tentativa "Aguardando correção", ou são aceitas direto no quiz
 * "sem correção". A cópia das perguntas fica guardada na tentativa.
 */
export async function enviarTentativa(
  db: Banco,
  agora: Relogio,
  userId: string,
  aulaId: string,
  respostas: Respostas,
  ganchos: GanchosDoQuiz = {},
  entrega: EntregaDoAluno = {},
  armazenamento?: Armazenamento,
): Promise<DetalheDaTentativa> {
  await aulaAtiva(db, aulaId)
  const linha = await quizDaAula(db, aulaId)
  if (!linha) throw new ErroDeQuiz('Esta aula não tem quiz.')
  const [anteriores, liberadas] = await Promise.all([
    tentativasDoAluno(db, linha.id, userId),
    liberacoesDoAluno(db, linha.id, userId),
  ])
  const limite = limiteDoAluno(linha.maximoDeTentativas, liberadas)
  const s = situacaoDoAluno(limite, anteriores)
  if (s.aprovado) throw new ErroDeQuiz('Você já foi aprovado neste exercício.')
  if (s.aguardandoCorrecao) {
    throw new ErroDeQuiz('Sua tentativa está aguardando correção.')
  }
  if (s.esgotado) throw new ErroDeQuiz('Suas tentativas acabaram.')

  const perguntas = await perguntasDoQuiz(db, linha.id)
  if (perguntas.length === 0)
    throw new ErroDeQuiz('Este quiz não tem perguntas.')
  for (const p of perguntas) {
    if (ehAberta(p.tipo)) continue
    const marcadas = respostas[p.id] ?? []
    const validas = new Set(p.alternativas.map((a) => a.id))
    if (p.outro) validas.add(ID_DO_OUTRO)
    if (new Set(marcadas).size !== marcadas.length) {
      throw new ErroDeQuiz('Resposta inválida.')
    }
    if (marcadas.some((id) => !validas.has(id))) {
      throw new ErroDeQuiz('Resposta inválida.')
    }
    if (p.tipo === 'unica' && marcadas.length > 1) {
      throw new ErroDeQuiz('Marque só uma alternativa.')
    }
  }
  const respondida = (p: PerguntaCopiada) =>
    p.tipo === 'texto_livre'
      ? !!(entrega.textos?.[p.id] ?? '').trim()
      : p.tipo === 'arquivo'
        ? (entrega.arquivos?.[p.id] ?? []).length > 0
        : (respostas[p.id] ?? []).length > 0
  const faltando = perguntasSemResposta(perguntas, (id) =>
    respondida(perguntas.find((p) => p.id === id) as PerguntaCopiada),
  )
  const primeiraQueFalta = perguntas.findIndex((p) => p.id === faltando[0])
  if (primeiraQueFalta >= 0) {
    const falta = perguntas[primeiraQueFalta] as PerguntaCopiada
    const conta =
      faltando.length === 1
        ? 'Falta 1 pergunta'
        : `Faltam ${faltando.length} perguntas`
    throw new ErroDeQuiz(
      `${conta}. ` +
        (falta.grupoUmDe
          ? `Pergunta ${primeiraQueFalta + 1}: ${TEXTO_DO_GRUPO.toLowerCase()}.`
          : falta.tipo === 'arquivo'
            ? `Envie pelo menos um arquivo na pergunta ${primeiraQueFalta + 1}.`
            : `Responda a pergunta ${primeiraQueFalta + 1}.`),
    )
  }
  if (!perguntas.some(respondida)) {
    throw new ErroDeQuiz('Responda pelo menos uma pergunta.')
  }
  const conferida = await conferirEntrega(
    perguntas,
    respostas,
    entrega,
    userId,
    armazenamento,
  )
  const respostasLimpas: Respostas = Object.fromEntries(
    perguntas
      .filter((p) => !ehAberta(p.tipo))
      .map((p) => [p.id, respostas[p.id] ?? []]),
  )
  // Opcional sem resposta fica fora da nota (e da fila).
  const puladas = new Set(
    perguntas.filter((p) => !respondida(p)).map((p) => p.id),
  )
  const abertas = perguntas.filter(
    (p) => passaPelaEquipe(p) && !puladas.has(p.id),
  )
  // Sem correção: a resposta aberta vale na hora; senão espera a Equipe.
  const situacao: SituacaoDaResposta = linha.semCorrecao ? 'certa' : 'pendente'
  const nota = corrigirTentativa(
    perguntas,
    respostasLimpas,
    linha.minimoDeAcertos,
    Object.fromEntries(abertas.map((p) => [p.id, situacao])),
    puladas,
  )
  const estado: EstadoDaTentativa =
    nota.pendentes > 0
      ? 'aguardando_correcao'
      : nota.aprovada
        ? 'aprovada'
        : 'reprovada'
  const enviadaEm = agora()
  const tentativaId = novoId()
  const c = comoLibsql(db)
  const comandos = [
    c.insert(tentativaDoQuiz).values({
      id: tentativaId,
      quizId: linha.id,
      userId,
      numero: anteriores.length + 1,
      estado,
      perguntas: JSON.stringify(perguntas),
      respostas: JSON.stringify(respostasLimpas),
      acertos: nota.acertos,
      total: nota.total,
      percentual: nota.percentual,
      minimoDeAcertos: linha.minimoDeAcertos,
      enviadaEm,
    }),
    ...abertas.map((p) =>
      c.insert(respostaAbertaDoQuiz).values({
        id: novoId(),
        tentativaId,
        perguntaId: p.id,
        texto: conferida.textos.get(p.id) ?? null,
        situacao,
      }),
    ),
    ...abertas.flatMap((p) =>
      (conferida.arquivos.get(p.id) ?? []).map((a) =>
        c.insert(arquivoDaResposta).values({
          id: novoId(),
          tentativaId,
          perguntaId: p.id,
          chave: a.chave,
          nome: a.nome,
          tipo: a.tipo,
          tamanho: a.tamanho,
          enviadoEm: enviadaEm,
        }),
      ),
    ),
  ]
  await db.batch(comandos as [(typeof comandos)[number], ...typeof comandos])
  const [gravada] = await c
    .select()
    .from(tentativaDoQuiz)
    .where(eq(tentativaDoQuiz.id, tentativaId))
  if (!gravada) throw new ErroDeQuiz('Não foi possível guardar a tentativa.')
  if (estado === 'aprovada') {
    await ganchos.aoAprovarPelaPrimeiraVez?.({
      db,
      agora,
      userId,
      aulaId,
      quizId: linha.id,
      pontos: linha.pontos,
    })
  }
  const depois = situacaoDoAluno(limite, [gravada, ...anteriores])
  return detalharComAbertas(db, gravada, depois.revelar)
}

// ---------- Ligação com o progresso ----------

/**
 * Gancho `podeConcluir` do progresso (#41): a aula com quiz obrigatório só conclui com aprovação,
 * e a aula do tipo quiz sempre exige. Aula sem quiz, ou com quiz opcional embaixo, conclui livre.
 */
export async function podeConcluirComQuiz({
  db,
  userId,
  aulaId,
}: ContextoDaAula): Promise<boolean> {
  const linha = await quizDaAula(db, aulaId)
  if (!linha || !(linha.obrigatorio || linha.soQuiz)) return true
  const [aprovada] = await comoLibsql(db)
    .select({ id: tentativaDoQuiz.id })
    .from(tentativaDoQuiz)
    .where(
      and(
        eq(tentativaDoQuiz.quizId, linha.id),
        eq(tentativaDoQuiz.userId, userId),
        eq(tentativaDoQuiz.estado, 'aprovada'),
      ),
    )
  return aprovada !== undefined
}
