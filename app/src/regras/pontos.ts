// Pontos e ranking (#54). Cada lançamento fica ligado a uma origem; a origem que some estorna o
// lançamento e repetir a ação não pontua de novo.
//
// Valores: aula 50, comentário 25 (uma vez por aula), avaliação 25 (a primeira), quiz o valor dele
// (padrão 100) na primeira aprovação, melhor resposta 50. Avulsos: a Equipe dá ou tira, com motivo
// obrigatório, de um curso ou gerais.
//
// Como as outras fatias ligam: os `Ganchos` de progresso, comentários, avaliação e quiz recebem as
// constantes `ganchosDe...` abaixo (nada de registro global).
//
// MELHOR RESPOSTA (comunidades, #59): quem marca o comentário como melhor resposta chama
// `pontuarMelhorResposta` (e, se a marcação for desfeita ou o comentário excluído,
// `estornarMelhorResposta`), sempre com o autor do COMENTÁRIO (não da publicação) e o id do
// comentário da comunidade. Os pontos são gerais (sem curso). Chamar de novo para o mesmo
// comentário não pontua duas vezes. Decidir se o autor da publicação pode premiar a si mesmo é
// regra da fatia das comunidades.

import {
  and,
  count,
  desc,
  eq,
  inArray,
  isNotNull,
  isNull,
  type SQL,
  sql,
} from 'drizzle-orm'
import {
  aula,
  curso,
  lancamentoDePontos,
  matricula,
  quiz,
  turma,
  user,
} from '#/db/schema'
import type { Ganchos as GanchosDaAvaliacao } from '#/regras/avaliacoes'
import type { Ganchos as GanchosDosComentarios } from '#/regras/comentarios'
import { emLotes } from '#/regras/lotes'
import { situacaoDaMatricula } from '#/regras/matricula'
import { deslocamento, montarPagina, POR_PAGINA } from '#/regras/paginacao'
import type { Ganchos as GanchosDoProgresso } from '#/regras/progresso'
import { cursoDaAula } from '#/regras/progresso'
import type { Ganchos as GanchosDasPublicacoes } from '#/regras/publicacoes'
import type { GanchosDoQuiz } from '#/regras/quiz'
import { prepararRegistro } from '#/regras/registro-de-acoes'
import { type Banco, comoLibsql, type Relogio } from '#/regras/tipos'

export class ErroDePontos extends Error {
  constructor(mensagem: string) {
    super(mensagem)
    this.name = 'ErroDePontos'
  }
}

export const PONTOS_DA_AULA = 50
export const PONTOS_DO_COMENTARIO = 25
export const PONTOS_DA_AVALIACAO = 25
export const PONTOS_DA_MELHOR_RESPOSTA = 50
/** Quantos alunos o ranking mostra, além da posição de quem olha. */
export const TAMANHO_DO_RANKING = 10
export const LIMITE_DO_AVULSO = 100_000
export const LIMITE_DO_MOTIVO = 300

export type TipoDeOrigem =
  | 'aula'
  | 'comentario'
  | 'avaliacao'
  | 'quiz'
  | 'melhor-resposta'

interface Lancamento {
  db: Banco
  agora: Relogio
  userId: string
  /** Nulo = pontos gerais. */
  cursoId: string | null
  tipo: TipoDeOrigem
  origemId: string
  pontos: number
}

// Lança os pontos da origem. Se a origem já tem lançamento vigente, não faz nada; se o lançamento
// foi estornado, a mesma linha volta a valer. Diz se pontuou agora.
async function lancar({
  db,
  agora,
  userId,
  cursoId,
  tipo,
  origemId,
  pontos,
}: Lancamento): Promise<boolean> {
  const instante = agora()
  const linhas = await comoLibsql(db)
    .insert(lancamentoDePontos)
    .values({
      id: crypto.randomUUID(),
      userId,
      cursoId,
      origemTipo: tipo,
      origemId,
      pontos,
      criadoEm: instante,
    })
    .onConflictDoUpdate({
      target: [
        lancamentoDePontos.userId,
        lancamentoDePontos.origemTipo,
        lancamentoDePontos.origemId,
      ],
      set: { estornadoEm: null, pontos, cursoId, criadoEm: instante },
      setWhere: isNotNull(lancamentoDePontos.estornadoEm),
    })
    .returning({ id: lancamentoDePontos.id })
  return linhas.length > 0
}

// Estorna o lançamento vigente da origem; diz se havia algo a estornar.
function prepararEstorno(
  db: Banco,
  agora: Relogio,
  userId: string,
  tipo: TipoDeOrigem,
  origemId: string,
) {
  return comoLibsql(db)
    .update(lancamentoDePontos)
    .set({ estornadoEm: agora() })
    .where(
      and(
        eq(lancamentoDePontos.userId, userId),
        eq(lancamentoDePontos.origemTipo, tipo),
        eq(lancamentoDePontos.origemId, origemId),
        isNull(lancamentoDePontos.estornadoEm),
      ),
    )
}

async function estornar(
  db: Banco,
  agora: Relogio,
  userId: string,
  tipo: TipoDeOrigem,
  origemId: string,
): Promise<boolean> {
  const linhas = await prepararEstorno(
    db,
    agora,
    userId,
    tipo,
    origemId,
  ).returning({ id: lancamentoDePontos.id })
  return linhas.length > 0
}

// ---------- Origens ----------

interface ContextoDaAula {
  db: Banco
  agora: Relogio
  userId: string
  aulaId: string
}

/** Aula concluída: 50 pontos no curso da aula. */
export async function pontuarAula(c: ContextoDaAula): Promise<boolean> {
  const cursoId = await cursoDaAula(c.db, c.aulaId)
  if (!cursoId) return false
  return lancar({
    ...c,
    cursoId,
    tipo: 'aula',
    origemId: c.aulaId,
    pontos: PONTOS_DA_AULA,
  })
}

/** Aula desmarcada: os 50 pontos saem. */
export const estornarAula = ({ db, agora, userId, aulaId }: ContextoDaAula) =>
  estornar(db, agora, userId, 'aula', aulaId)

/** Primeiro comentário do aluno na aula: 25 pontos (a origem é a aula, então só uma vez por aula). */
export async function pontuarComentario(c: ContextoDaAula): Promise<boolean> {
  const cursoId = await cursoDaAula(c.db, c.aulaId)
  if (!cursoId) return false
  return lancar({
    ...c,
    cursoId,
    tipo: 'comentario',
    origemId: c.aulaId,
    pontos: PONTOS_DO_COMENTARIO,
  })
}

/** O último comentário do aluno na aula sumiu: os 25 pontos saem. */
export const estornarComentario = ({
  db,
  agora,
  userId,
  aulaId,
}: ContextoDaAula) => estornar(db, agora, userId, 'comentario', aulaId)

/** Primeira avaliação da aula: 25 pontos. Mudar a nota depois não pontua de novo. */
export async function pontuarAvaliacao(c: ContextoDaAula): Promise<boolean> {
  const cursoId = await cursoDaAula(c.db, c.aulaId)
  if (!cursoId) return false
  return lancar({
    ...c,
    cursoId,
    tipo: 'avaliacao',
    origemId: c.aulaId,
    pontos: PONTOS_DA_AVALIACAO,
  })
}

/** Aprovação num quiz: o valor dele, uma vez por quiz. */
export async function pontuarQuiz(
  c: ContextoDaAula & { quizId: string; pontos: number },
): Promise<boolean> {
  const cursoId = await cursoDaAula(c.db, c.aulaId)
  if (!cursoId || c.pontos <= 0) return false
  return lancar({
    ...c,
    cursoId,
    tipo: 'quiz',
    origemId: c.quizId,
    pontos: c.pontos,
  })
}

/**
 * Melhor resposta das comunidades (#59): 50 pontos gerais para o autor do comentário.
 * `userId` é o autor do comentário escolhido e `comentarioId` o id do comentário da comunidade.
 * Repetir a marcação não pontua de novo.
 */
export function pontuarMelhorResposta(
  db: Banco,
  agora: Relogio,
  entrada: { userId: string; comentarioId: string },
): Promise<boolean> {
  return lancar({
    db,
    agora,
    userId: entrada.userId,
    cursoId: null,
    tipo: 'melhor-resposta',
    origemId: entrada.comentarioId,
    pontos: PONTOS_DA_MELHOR_RESPOSTA,
  })
}

/** A marcação de melhor resposta foi desfeita (ou o comentário sumiu): os 50 pontos saem. */
export function estornarMelhorResposta(
  db: Banco,
  agora: Relogio,
  entrada: { userId: string; comentarioId: string },
): Promise<boolean> {
  return estornar(
    db,
    agora,
    entrada.userId,
    'melhor-resposta',
    entrada.comentarioId,
  )
}

/** O comando que estorna os pontos da melhor resposta, para entrar no `db.batch` de quem a desfaz. */
export function prepararEstornoDaMelhorResposta(
  db: Banco,
  agora: Relogio,
  entrada: { userId: string; comentarioId: string },
) {
  return prepararEstorno(
    db,
    agora,
    entrada.userId,
    'melhor-resposta',
    entrada.comentarioId,
  )
}

// ---------- Ganchos das outras fatias ----------

export const ganchosDeProgresso: Pick<
  GanchosDoProgresso,
  'aoConcluirAula' | 'aoDesmarcarAula'
> = {
  aoConcluirAula: async (c) => {
    await pontuarAula(c)
  },
  aoDesmarcarAula: async (c) => {
    await estornarAula(c)
  },
}

export const ganchosDosComentarios: GanchosDosComentarios = {
  aoComentarPelaPrimeiraVezNaAula: async (c) => {
    await pontuarComentario(c)
  },
  aoExcluirComentario: async (c) => {
    // Só sai quando o autor ficou sem nenhum comentário vivo na aula.
    if (c.restantesDoAutorNaAula === 0) await estornarComentario(c)
  },
}

// Melhor resposta das comunidades (#59): os 50 pontos vão para o autor do comentário. Quem marca a
// própria resposta não ganha nada.
export const ganchosDaMelhorResposta: GanchosDasPublicacoes = {
  aoEscolherMelhorResposta: async (c) => {
    if (c.autorDaResposta === c.autorDaPublicacao) return
    await pontuarMelhorResposta(c.db, c.agora, {
      userId: c.autorDaResposta,
      comentarioId: c.comentarioId,
    })
  },
  aoDesfazerMelhorResposta: async (c) => {
    await estornarMelhorResposta(c.db, c.agora, {
      userId: c.autorDaResposta,
      comentarioId: c.comentarioId,
    })
  },
  comandosParaDesfazerMelhorResposta: (c) => [
    prepararEstornoDaMelhorResposta(c.db, c.agora, {
      userId: c.autorDaResposta,
      comentarioId: c.comentarioId,
    }),
  ],
}

export const ganchosDaAvaliacao: GanchosDaAvaliacao = {
  aoAvaliarPelaPrimeiraVez: async (c) => {
    await pontuarAvaliacao(c)
  },
}

export const ganchosDoQuizComPontos: Pick<
  GanchosDoQuiz,
  'aoAprovarPelaPrimeiraVez'
> = {
  aoAprovarPelaPrimeiraVez: async (c) => {
    await pontuarQuiz(c)
  },
}

// ---------- Avulsos ----------

export interface EntradaDeAvulso {
  autorId: string
  alunoId: string
  /** Nulo = pontos gerais. */
  cursoId: string | null
  /** Positivo dá, negativo tira. */
  pontos: number
  motivo: string
}

/** A Equipe dá ou tira pontos de um aluno, com motivo obrigatório. Entra no registro de ações. */
export async function darPontosAvulsos(
  banco: Banco,
  agora: Relogio,
  entrada: EntradaDeAvulso,
): Promise<{ id: string; texto: string }> {
  const db = comoLibsql(banco)
  const motivo = entrada.motivo.trim()
  if (motivo === '') throw new ErroDePontos('Diga o motivo dos pontos.')
  if (motivo.length > LIMITE_DO_MOTIVO) {
    throw new ErroDePontos(`O motivo tem até ${LIMITE_DO_MOTIVO} caracteres.`)
  }
  if (
    !Number.isInteger(entrada.pontos) ||
    entrada.pontos === 0 ||
    Math.abs(entrada.pontos) > LIMITE_DO_AVULSO
  ) {
    throw new ErroDePontos(
      `Informe uma quantidade inteira de pontos, diferente de zero, até ${LIMITE_DO_AVULSO}.`,
    )
  }
  const [aluno] = await db
    .select({ id: user.id, perfil: user.perfil })
    .from(user)
    .where(eq(user.id, entrada.alunoId))
  if (aluno?.perfil !== 'aluno') {
    throw new ErroDePontos('Aluno não encontrado.')
  }
  let cursoNome: string | null = null
  if (entrada.cursoId) {
    const [encontrado] = await db
      .select({ nome: curso.nome })
      .from(curso)
      .where(and(eq(curso.id, entrada.cursoId), isNull(curso.excluidoEm)))
    if (!encontrado) throw new ErroDePontos('Curso não encontrado.')
    cursoNome = encontrado.nome
  }
  const id = crypto.randomUUID()
  await db.batch([
    db.insert(lancamentoDePontos).values({
      id,
      userId: entrada.alunoId,
      cursoId: entrada.cursoId,
      origemTipo: 'avulso',
      origemId: null,
      pontos: entrada.pontos,
      motivo,
      autorId: entrada.autorId,
      criadoEm: agora(),
    }),
    prepararRegistro(banco, agora, {
      autorId: entrada.autorId,
      acao: 'pontos-avulsos',
      detalhe: {
        alunoId: entrada.alunoId,
        cursoId: entrada.cursoId,
        pontos: entrada.pontos,
        motivo,
      },
    }),
  ])
  return { id, texto: textoDoAvisoDePontos(entrada.pontos, motivo, cursoNome) }
}

/** O texto do sininho quando a Equipe dá ou tira pontos. */
export function textoDoAvisoDePontos(
  pontos: number,
  motivo: string,
  cursoNome: string | null,
): string {
  const quantos = Math.abs(pontos)
  const unidade = quantos === 1 ? 'ponto' : 'pontos'
  const onde = cursoNome ? ` no curso ${cursoNome}` : ''
  const verbo = pontos > 0 ? 'ganhou' : 'perdeu'
  return `Você ${verbo} ${quantos} ${unidade}${onde}: ${motivo}`
}

// ---------- Saldos ----------

const vigente = isNull(lancamentoDePontos.estornadoEm)

/** Soma dos pontos vigentes do aluno em todos os cursos mais os gerais. */
export async function saldoGeral(db: Banco, userId: string): Promise<number> {
  const [linha] = await comoLibsql(db)
    .select({
      total: sql<number>`coalesce(sum(${lancamentoDePontos.pontos}), 0)`,
    })
    .from(lancamentoDePontos)
    .where(and(eq(lancamentoDePontos.userId, userId), vigente))
  return Number(linha?.total ?? 0)
}

/** Pontos do aluno só naquele curso (alimenta a regra de pontuação mínima). */
export async function saldoDoCurso(
  db: Banco,
  userId: string,
  cursoId: string,
): Promise<number> {
  const [linha] = await comoLibsql(db)
    .select({
      total: sql<number>`coalesce(sum(${lancamentoDePontos.pontos}), 0)`,
    })
    .from(lancamentoDePontos)
    .where(
      and(
        eq(lancamentoDePontos.userId, userId),
        eq(lancamentoDePontos.cursoId, cursoId),
        vigente,
      ),
    )
  return Number(linha?.total ?? 0)
}

/** Pontos de vários alunos de uma vez (geral, ou só de um curso); quem não tem lançamento fica com 0. */
export async function pontosDosAlunos(
  db: Banco,
  userIds: string[],
  cursoId?: string | null,
): Promise<Map<string, number>> {
  const mapa = new Map(userIds.map((id) => [id, 0]))
  if (userIds.length === 0) return mapa
  // Cada aluno cai num lote só, então a soma por aluno não se divide.
  const linhas = await emLotes(userIds, (ids) => {
    const filtros: SQL[] = [inArray(lancamentoDePontos.userId, ids), vigente]
    if (cursoId) filtros.push(eq(lancamentoDePontos.cursoId, cursoId))
    return comoLibsql(db)
      .select({
        userId: lancamentoDePontos.userId,
        total: sql<number>`sum(${lancamentoDePontos.pontos})`,
      })
      .from(lancamentoDePontos)
      .where(and(...filtros))
      .groupBy(lancamentoDePontos.userId)
  })
  for (const l of linhas) mapa.set(l.userId, Number(l.total))
  return mapa
}

/**
 * Pontos de todos os alunos que pontuaram naquele curso (aluno -> total), numa consulta só e sem
 * precisar da lista de alunos. Quem não tem lançamento no curso não aparece (quem lê usa 0).
 */
export async function pontosDoCurso(
  db: Banco,
  cursoId: string,
): Promise<Map<string, number>> {
  const linhas = await comoLibsql(db)
    .select({
      userId: lancamentoDePontos.userId,
      total: sql<number>`sum(${lancamentoDePontos.pontos})`,
    })
    .from(lancamentoDePontos)
    .where(and(eq(lancamentoDePontos.cursoId, cursoId), vigente))
    .groupBy(lancamentoDePontos.userId)
  return new Map(linhas.map((l) => [l.userId, Number(l.total)]))
}

// ---------- Extrato ----------

export interface LinhaDoExtrato {
  id: string
  criadoEm: Date
  tipo: TipoDeOrigem | 'avulso'
  /** A origem ("Aula concluída: Raiz") ou o motivo do avulso. */
  descricao: string
  cursoNome: string | null
  pontos: number
}

export interface ExtratoDoAluno {
  /** O saldo de todos os lançamentos vigentes (não só os da página). */
  total: number
  linhas: LinhaDoExtrato[]
  pagina: number
  porPagina: number
  totalDeLancamentos: number
  totalDePaginas: number
}

/** "Meus pontos": os lançamentos vigentes, do mais recente ao mais antigo (20 por página), e o total. */
export async function extratoDoAluno(
  banco: Banco,
  userId: string,
  pagina = 1,
): Promise<ExtratoDoAluno> {
  const db = comoLibsql(banco)
  // Contagem, saldo e página saem numa ida só (`batch`).
  const [[{ quantos, saldo }], lancamentos] = await db.batch([
    db
      .select({
        quantos: count(),
        saldo: sql<number>`coalesce(sum(${lancamentoDePontos.pontos}), 0)`,
      })
      .from(lancamentoDePontos)
      .where(and(eq(lancamentoDePontos.userId, userId), vigente)),
    consultaDoExtrato(banco, userId, POR_PAGINA, deslocamento(pagina)),
  ])
  const linhas = lancamentos.map(linhaDoExtrato)
  const { totalDePaginas } = montarPagina(linhas, quantos, pagina)
  return {
    total: Number(saldo ?? 0),
    linhas,
    pagina,
    porPagina: POR_PAGINA,
    totalDeLancamentos: quantos,
    totalDePaginas,
  }
}

/** Os lançamentos mais recentes (3 por padrão), para o resumo "Seus últimos pontos" do Ranking. */
export async function ultimosLancamentos(
  banco: Banco,
  userId: string,
  quantos = 3,
): Promise<LinhaDoExtrato[]> {
  return (await consultaDoExtrato(banco, userId, quantos, 0)).map(
    linhaDoExtrato,
  )
}

// A consulta das linhas do extrato, sem executar (quem chama decide se vai sozinha ou num `batch`).
// O título da aula citada vem no mesmo SELECT: a aula é a origem (aula, comentário, avaliação) ou é a
// aula em que mora o quiz.
function consultaDoExtrato(
  banco: Banco,
  userId: string,
  limite: number,
  inicio: number,
) {
  const db = comoLibsql(banco)
  const aulaCitada = sql<string | null>`case
    when ${lancamentoDePontos.origemTipo} = 'quiz' then ${quiz.aulaId}
    when ${lancamentoDePontos.origemTipo} in ('aula', 'comentario', 'avaliacao') then ${lancamentoDePontos.origemId}
  end`
  return db
    .select({
      id: lancamentoDePontos.id,
      criadoEm: lancamentoDePontos.criadoEm,
      tipo: lancamentoDePontos.origemTipo,
      origemId: lancamentoDePontos.origemId,
      motivo: lancamentoDePontos.motivo,
      pontos: lancamentoDePontos.pontos,
      cursoNome: curso.nome,
      aulaTitulo: aula.titulo,
    })
    .from(lancamentoDePontos)
    .leftJoin(curso, eq(curso.id, lancamentoDePontos.cursoId))
    .leftJoin(
      quiz,
      and(
        eq(lancamentoDePontos.origemTipo, 'quiz'),
        eq(quiz.id, lancamentoDePontos.origemId),
      ),
    )
    .leftJoin(aula, eq(aula.id, aulaCitada))
    .where(and(eq(lancamentoDePontos.userId, userId), vigente))
    .orderBy(desc(lancamentoDePontos.criadoEm), desc(lancamentoDePontos.id))
    .limit(limite)
    .offset(inicio)
}

const PREFIXO_DA_ORIGEM: Record<TipoDeOrigem, string> = {
  aula: 'Aula concluída',
  comentario: 'Comentário na aula',
  avaliacao: 'Avaliação da aula',
  quiz: 'Exercício aprovado',
  'melhor-resposta': 'Melhor resposta na comunidade',
}

function linhaDoExtrato(
  l: Awaited<ReturnType<typeof consultaDoExtrato>>[number],
): LinhaDoExtrato {
  let descricao: string
  if (l.tipo === 'avulso') descricao = l.motivo ?? 'Pontos avulsos'
  else {
    const prefixo = PREFIXO_DA_ORIGEM[l.tipo]
    descricao = l.aulaTitulo ? `${prefixo}: ${l.aulaTitulo}` : prefixo
  }
  return {
    id: l.id,
    criadoEm: l.criadoEm,
    tipo: l.tipo,
    descricao,
    cursoNome: l.cursoNome,
    pontos: l.pontos,
  }
}

// ---------- Ranking ----------

export interface PosicaoNoRanking {
  posicao: number
  userId: string
  nome: string
  /** Foto do aluno (caminho da imagem); nula = sem foto. */
  imagem: string | null
  /** O "Sobre você" do aluno; nulo = não escreveu. */
  bio: string | null
  pontos: number
}

/** Posição com e-mail: só para o CSV da Equipe (`rankingCompleto`), nunca para a tela do aluno. */
export interface PosicaoComEmail extends PosicaoNoRanking {
  email: string
}

export interface RankingDoCurso {
  /** Os 10 primeiros com pontos. */
  primeiros: PosicaoNoRanking[]
  /** A posição de quem olha; nula se ele não entra no ranking (matrícula não ativa, ou equipe). */
  eu: { posicao: number; pontos: number } | null
}

// Quem concorre: aluno (nunca a equipe) com matrícula ativa, em qualquer curso (geral) ou no curso.
async function concorrentes(
  banco: Banco,
  agora: Relogio,
  cursoId?: string | null,
) {
  const db = comoLibsql(banco)
  const hoje = agora()
  const filtros: SQL[] = [eq(user.perfil, 'aluno')]
  if (cursoId) filtros.push(eq(turma.cursoId, cursoId))
  const linhas = await db
    .select({
      userId: user.id,
      nome: user.name,
      email: user.email,
      imagem: user.image,
      bio: user.bio,
      situacao: matricula.situacao,
      expiraEm: matricula.expiraEm,
    })
    .from(matricula)
    .innerJoin(turma, eq(turma.id, matricula.turmaId))
    .innerJoin(user, eq(user.id, matricula.userId))
    .where(and(...filtros))
  const quem = new Map<
    string,
    { nome: string; email: string; imagem: string | null; bio: string | null }
  >()
  for (const l of linhas) {
    if (situacaoDaMatricula(l, hoje) === 'ativa') {
      quem.set(l.userId, {
        nome: l.nome,
        email: l.email,
        imagem: l.imagem,
        bio: l.bio,
      })
    }
  }
  return quem
}

// Todos os concorrentes ordenados (mais pontos primeiro; empate por nome), com a posição de
// competição: quem empata divide a posição e o próximo pula.
async function classificar(
  banco: Banco,
  agora: Relogio,
  cursoId?: string | null,
): Promise<PosicaoComEmail[]> {
  const quem = await concorrentes(banco, agora, cursoId)
  const pontos = await pontosDosAlunos(banco, [...quem.keys()], cursoId)
  const ordenados = [...quem].map(([userId, dados]) => ({
    userId,
    ...dados,
    pontos: pontos.get(userId) ?? 0,
  }))
  ordenados.sort(
    (a, b) => b.pontos - a.pontos || a.nome.localeCompare(b.nome, 'pt-BR'),
  )
  let posicaoAnterior = 0
  return ordenados.map((o, i) => {
    const posicao =
      i > 0 && ordenados[i - 1].pontos === o.pontos ? posicaoAnterior : i + 1
    posicaoAnterior = posicao
    return { ...o, posicao }
  })
}

/** O ranking geral (sem `cursoId`) ou de um curso: os 10 primeiros e a posição de `userId`. */
export async function ranking(
  banco: Banco,
  agora: Relogio,
  opcoes: { cursoId?: string | null; userId?: string } = {},
): Promise<RankingDoCurso> {
  const todos = await classificar(banco, agora, opcoes.cursoId)
  const dele = opcoes.userId
    ? todos.find((t) => t.userId === opcoes.userId)
    : undefined
  return {
    primeiros: todos
      .filter((t) => t.pontos > 0)
      .slice(0, TAMANHO_DO_RANKING)
      .map(({ email: _email, ...posicao }) => posicao),
    eu: dele ? { posicao: dele.posicao, pontos: dele.pontos } : null,
  }
}

/** O ranking inteiro (só quem tem pontos), para o CSV da Equipe. */
export async function rankingCompleto(
  banco: Banco,
  agora: Relogio,
  cursoId?: string | null,
): Promise<PosicaoComEmail[]> {
  return (await classificar(banco, agora, cursoId)).filter((t) => t.pontos > 0)
}

/** Os cursos que o aluno tem ativos, para escolher o ranking de cada um. */
export async function cursosDoRanking(
  banco: Banco,
  agora: Relogio,
  userId: string,
): Promise<{ id: string; nome: string }[]> {
  const db = comoLibsql(banco)
  const hoje = agora()
  const linhas = await db
    .select({
      id: curso.id,
      nome: curso.nome,
      situacao: matricula.situacao,
      expiraEm: matricula.expiraEm,
    })
    .from(matricula)
    .innerJoin(turma, eq(turma.id, matricula.turmaId))
    .innerJoin(curso, eq(curso.id, turma.cursoId))
    .where(and(eq(matricula.userId, userId), isNull(curso.excluidoEm)))
  const unicos = new Map<string, string>()
  for (const l of linhas) {
    if (situacaoDaMatricula(l, hoje) === 'ativa') unicos.set(l.id, l.nome)
  }
  return [...unicos]
    .map(([id, nome]) => ({ id, nome }))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
}
