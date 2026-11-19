// Progresso do aluno: onde parou no vídeo, o maior ponto, o tempo de vídeo tocando e a conclusão da
// aula; o percentual de cada curso, o "Continuar assistindo" e a aula que o botão do curso abre.
//
// Conclusão: automática ao chegar a 90% do vídeo ou no fim (`terminou`), ou pelo botão em qualquer
// momento; aula sem vídeo só pelo botão; o aluno pode desmarcar. Posições e tempos em segundos.
//
// Pontos de extensão (`Ganchos`, passados por quem chama; nada de registro global):
// - `podeConcluir`: o quiz obrigatório (#51) trava a conclusão até a aprovação;
// - `aoConcluirAula` / `aoDesmarcarAula`: os pontos (#54) entram e saem aqui.

import { and, eq, inArray, isNull, not } from 'drizzle-orm'
import { aula, modulo, progressoDaAula } from '#/db/schema'
import { emLotes } from '#/regras/lotes'
import { type Banco, comoLibsql, type Relogio } from '#/regras/tipos'

export class ErroDeProgresso extends Error {
  constructor(mensagem: string) {
    super(mensagem)
    this.name = 'ErroDeProgresso'
  }
}

/** Fração do vídeo que conclui a aula sozinha. */
export const LIMITE_DE_CONCLUSAO = 0.9
/** Gravações do player mais próximas que isso são ignoradas (exceto o fim do vídeo). */
export const INTERVALO_MINIMO_S = 5
/** Teto do tempo tocando aceito por gravação, contra valores absurdos. */
const TETO_DE_TEMPO_POR_GRAVACAO_S = 120

export interface ContextoDaAula {
  db: Banco
  agora: Relogio
  userId: string
  aulaId: string
}

export interface Ganchos {
  /** Padrão: sempre pode. Falso trava o botão e a conclusão automática. */
  podeConcluir?: (contexto: ContextoDaAula) => Promise<boolean>
  /** Roda uma vez, depois de a aula passar a concluída. */
  aoConcluirAula?: (contexto: ContextoDaAula) => Promise<void>
  /** Roda uma vez, depois de a conclusão ser desmarcada. */
  aoDesmarcarAula?: (contexto: ContextoDaAula) => Promise<void>
}

export interface ProgressoDaAula {
  ultimaPosicao: number
  maiorPonto: number
  tempoTocando: number
  concluida: boolean
  concluidaEm: Date | null
}

const SEM_PROGRESSO: ProgressoDaAula = {
  ultimaPosicao: 0,
  maiorPonto: 0,
  tempoTocando: 0,
  concluida: false,
  concluidaEm: null,
}

function inteiro(valor: number, minimo = 0, maximo = Number.MAX_SAFE_INTEGER) {
  if (!Number.isFinite(valor)) return minimo
  return Math.min(maximo, Math.max(minimo, Math.floor(valor)))
}

async function aulaDoAluno(db: Banco, aulaId: string) {
  const [encontrada] = await comoLibsql(db)
    .select({ id: aula.id, vimeoId: aula.vimeoId })
    .from(aula)
    .innerJoin(modulo, eq(modulo.id, aula.moduloId))
    .where(
      and(
        eq(aula.id, aulaId),
        isNull(aula.excluidoEm),
        isNull(modulo.excluidoEm),
      ),
    )
  if (!encontrada) throw new ErroDeProgresso('Aula não encontrada.')
  return encontrada
}

async function linhaDe(db: Banco, userId: string, aulaId: string) {
  const [linha] = await comoLibsql(db)
    .select()
    .from(progressoDaAula)
    .where(
      and(
        eq(progressoDaAula.userId, userId),
        eq(progressoDaAula.aulaId, aulaId),
      ),
    )
  return linha ?? null
}

/** O que o aluno já fez na aula (para o player voltar ao segundo certo e o botão mostrar o estado). */
export async function lerProgressoDaAula(
  db: Banco,
  userId: string,
  aulaId: string,
): Promise<ProgressoDaAula> {
  const linha = await linhaDe(db, userId, aulaId)
  if (!linha) return SEM_PROGRESSO
  return {
    ultimaPosicao: linha.ultimaPosicao,
    maiorPonto: linha.maiorPonto,
    tempoTocando: linha.tempoTocando,
    concluida: linha.concluidaEm !== null,
    concluidaEm: linha.concluidaEm,
  }
}

/** O aluno abriu a aula: ela passa a ser a última aberta do curso (alimenta o "Continuar assistindo"). */
export async function registrarAbertura(
  db: Banco,
  agora: Relogio,
  userId: string,
  aulaId: string,
): Promise<void> {
  await aulaDoAluno(db, aulaId)
  const instante = agora()
  await comoLibsql(db)
    .insert(progressoDaAula)
    .values({ id: crypto.randomUUID(), userId, aulaId, abertaEm: instante })
    .onConflictDoUpdate({
      target: [progressoDaAula.userId, progressoDaAula.aulaId],
      set: { abertaEm: instante },
    })
}

export interface GravacaoDoPlayer {
  /** Posição atual do vídeo. */
  posicao: number
  /** Duração do vídeo. */
  duracao: number
  /** Segundos de vídeo tocando desde a última gravação aceita. */
  tempoTocando: number
  /** O player avisou `ended`. */
  terminou?: boolean
}

export interface ResultadoDaGravacao {
  gravou: boolean
  concluiuAgora: boolean
}

/**
 * Grava o que o Player SDK do Vimeo mediu. Com intervalo mínimo: gravação perto demais da anterior
 * volta `gravou: false` e quem chamou guarda o tempo tocando para mandar na próxima.
 * A conclusão automática vale quando a gravação cruza os 90% ou o vídeo termina; quem desmarcou
 * a aula e continua depois dos 90% não a vê concluída de novo.
 */
export async function gravarProgresso(
  db: Banco,
  agora: Relogio,
  userId: string,
  aulaId: string,
  gravacao: GravacaoDoPlayer,
  ganchos: Ganchos = {},
): Promise<ResultadoDaGravacao> {
  const { vimeoId } = await aulaDoAluno(db, aulaId)
  if (!vimeoId) {
    throw new ErroDeProgresso('Esta aula não tem vídeo: conclua pelo botão.')
  }
  const instante = agora()
  const anterior = await linhaDe(db, userId, aulaId)
  const terminou = gravacao.terminou === true
  if (
    !terminou &&
    anterior?.gravadaEm &&
    instante.getTime() - anterior.gravadaEm.getTime() <
      INTERVALO_MINIMO_S * 1000
  ) {
    return { gravou: false, concluiuAgora: false }
  }

  const duracao = inteiro(gravacao.duracao)
  const limite = duracao > 0 ? duracao : Number.MAX_SAFE_INTEGER
  const posicao = inteiro(
    terminou && duracao > 0 ? duracao : gravacao.posicao,
    0,
    limite,
  )
  const maiorAntes = anterior?.maiorPonto ?? 0
  const maiorPonto = Math.max(maiorAntes, posicao)
  const tempoTocando =
    (anterior?.tempoTocando ?? 0) +
    inteiro(gravacao.tempoTocando, 0, TETO_DE_TEMPO_POR_GRAVACAO_S)

  const cruzouOsNoventa =
    duracao > 0 &&
    maiorPonto >= duracao * LIMITE_DE_CONCLUSAO &&
    maiorAntes < duracao * LIMITE_DE_CONCLUSAO
  const querConcluir =
    (terminou || cruzouOsNoventa) && anterior?.concluidaEm == null

  const valores = {
    ultimaPosicao: posicao,
    maiorPonto,
    duracao: duracao > 0 ? duracao : (anterior?.duracao ?? 0),
    tempoTocando,
    gravadaEm: instante,
  }
  await comoLibsql(db)
    .insert(progressoDaAula)
    .values({
      id: crypto.randomUUID(),
      userId,
      aulaId,
      abertaEm: instante,
      ...valores,
    })
    .onConflictDoUpdate({
      target: [progressoDaAula.userId, progressoDaAula.aulaId],
      set: valores,
    })

  if (!querConcluir) return { gravou: true, concluiuAgora: false }
  const contexto = { db, agora, userId, aulaId }
  if (ganchos.podeConcluir && !(await ganchos.podeConcluir(contexto))) {
    return { gravou: true, concluiuAgora: false }
  }
  const concluiu = await marcarConcluida(contexto)
  if (concluiu) await ganchos.aoConcluirAula?.(contexto)
  return { gravou: true, concluiuAgora: concluiu }
}

// Marca a conclusão só se ainda não estava concluída; diz se mudou.
async function marcarConcluida({ db, agora, userId, aulaId }: ContextoDaAula) {
  const instante = agora()
  const linhas = await comoLibsql(db)
    .insert(progressoDaAula)
    .values({
      id: crypto.randomUUID(),
      userId,
      aulaId,
      abertaEm: instante,
      concluidaEm: instante,
    })
    .onConflictDoUpdate({
      target: [progressoDaAula.userId, progressoDaAula.aulaId],
      set: { concluidaEm: instante },
      setWhere: isNull(progressoDaAula.concluidaEm),
    })
    .returning({ id: progressoDaAula.id })
  return linhas.length > 0
}

/** O botão "Concluir aula". Vale com ou sem vídeo; concluir de novo não faz nada. */
export async function concluirAula(
  db: Banco,
  agora: Relogio,
  userId: string,
  aulaId: string,
  ganchos: Ganchos = {},
): Promise<{ concluiuAgora: boolean }> {
  await aulaDoAluno(db, aulaId)
  const contexto = { db, agora, userId, aulaId }
  if (ganchos.podeConcluir && !(await ganchos.podeConcluir(contexto))) {
    throw new ErroDeProgresso('Esta aula ainda não pode ser concluída.')
  }
  const concluiu = await marcarConcluida(contexto)
  if (concluiu) await ganchos.aoConcluirAula?.(contexto)
  return { concluiuAgora: concluiu }
}

/** O aluno desmarca a conclusão. A posição e o tempo tocando ficam. */
export async function desmarcarAula(
  db: Banco,
  agora: Relogio,
  userId: string,
  aulaId: string,
  ganchos: Ganchos = {},
): Promise<{ desmarcouAgora: boolean }> {
  await aulaDoAluno(db, aulaId)
  const linhas = await comoLibsql(db)
    .update(progressoDaAula)
    .set({ concluidaEm: null })
    .where(
      and(
        eq(progressoDaAula.userId, userId),
        eq(progressoDaAula.aulaId, aulaId),
        isNotNullConcluida(),
      ),
    )
    .returning({ id: progressoDaAula.id })
  const desmarcou = linhas.length > 0
  if (desmarcou) await ganchos.aoDesmarcarAula?.({ db, agora, userId, aulaId })
  return { desmarcouAgora: desmarcou }
}

function isNotNullConcluida() {
  return not(isNull(progressoDaAula.concluidaEm))
}

export interface ProgressoDoCurso {
  totalDeAulas: number
  aulasConcluidas: number
  /** 0 a 100, arredondado para baixo: só chega a 100 com tudo concluído. */
  percentual: number
}

// Aulas ativas (aula e módulo não excluídos) dos cursos, na ordem em que o aluno as segue.
async function aulasDosCursos(db: Banco, cursoIds: string[]) {
  if (cursoIds.length === 0) return []
  const linhas = await emLotes(cursoIds, (ids) =>
    comoLibsql(db)
      .select({
        cursoId: modulo.cursoId,
        moduloId: modulo.id,
        moduloNome: modulo.nome,
        moduloOrdem: modulo.ordem,
        aulaOrdem: aula.ordem,
        aulaId: aula.id,
        titulo: aula.titulo,
      })
      .from(aula)
      .innerJoin(modulo, eq(modulo.id, aula.moduloId))
      .where(
        and(
          inArray(modulo.cursoId, ids),
          isNull(aula.excluidoEm),
          isNull(modulo.excluidoEm),
        ),
      ),
  )
  return linhas.sort(
    (a, b) => a.moduloOrdem - b.moduloOrdem || a.aulaOrdem - b.aulaOrdem,
  )
}

async function linhasDoAluno(db: Banco, userId: string, aulaIds: string[]) {
  if (aulaIds.length === 0) return []
  return emLotes(aulaIds, (ids) =>
    comoLibsql(db)
      .select()
      .from(progressoDaAula)
      .where(
        and(
          eq(progressoDaAula.userId, userId),
          inArray(progressoDaAula.aulaId, ids),
        ),
      ),
  )
}

export interface PassoDoCurso extends ProgressoDoCurso {
  /** Ids das aulas concluídas, para marcar a lista do curso. */
  concluidas: string[]
  /**
   * Para onde o botão do curso leva: a última aula aberta, se pendente; senão a próxima pendente
   * depois dela; senão a primeira pendente. Nula se tudo está concluído (ou nada liberado).
   */
  proximaAulaId: string | null
  /** O aluno já abriu alguma aula (decide "Começar" ou "Continuar"). */
  jaComecou: boolean
}

/**
 * Tudo da página do curso: percentual, aulas concluídas e para onde o botão leva.
 * `liberadas` é o conjunto de aulas que o aluno pode abrir (regras de liberação, #42); sem ele,
 * todas as aulas do curso valem como liberadas. Pode vir como promessa: as consultas do progresso não
 * dependem dela, então rodam enquanto ela ainda é calculada.
 */
export async function progressoDoCurso(
  db: Banco,
  userId: string,
  cursoId: string,
  liberadasOuPromessa?: ReadonlySet<string> | Promise<ReadonlySet<string>>,
): Promise<PassoDoCurso> {
  // Sem este `catch`, uma falha da promessa antes de ela ser esperada viraria rejeição sem tratamento.
  Promise.resolve(liberadasOuPromessa).catch(() => {})
  const aulas = await aulasDosCursos(db, [cursoId])
  const linhas = await linhasDoAluno(
    db,
    userId,
    aulas.map((a) => a.aulaId),
  )
  const liberadas = await liberadasOuPromessa
  const concluidas = linhas
    .filter((l) => l.concluidaEm !== null)
    .map((l) => l.aulaId)
  const feitas = new Set(concluidas)
  const pendente = (aulaId: string) =>
    !feitas.has(aulaId) && (!liberadas || liberadas.has(aulaId))
  // Retoma de onde parou (o mesmo critério do "Continuar assistindo"): a última aula aberta,
  // se ainda está pendente; senão a próxima pendente depois dela; senão a primeira pendente.
  const ultimaAberta = linhas
    .filter((l) => l.abertaEm !== null)
    .sort(
      (x, y) => (y.abertaEm as Date).getTime() - (x.abertaEm as Date).getTime(),
    )[0]
  const posicao = ultimaAberta
    ? aulas.findIndex((a) => a.aulaId === ultimaAberta.aulaId)
    : -1
  const proxima =
    (posicao >= 0 && pendente(aulas[posicao].aulaId) ? aulas[posicao] : null) ??
    aulas.slice(posicao + 1).find((a) => pendente(a.aulaId)) ??
    aulas.find((a) => pendente(a.aulaId))
  return {
    totalDeAulas: aulas.length,
    aulasConcluidas: concluidas.length,
    percentual:
      aulas.length === 0
        ? 0
        : Math.floor((concluidas.length / aulas.length) * 100),
    concluidas,
    proximaAulaId: proxima?.aulaId ?? null,
    jaComecou: linhas.length > 0,
  }
}

/**
 * O que a página Meus cursos precisa para decidir situação, próxima aula e "faltam N no módulo": as
 * aulas dos cursos na ordem do curso, as concluídas e quando cada aula foi aberta (ms), numa leitura só.
 */
export async function dadosDeProgressoDosCursos(
  db: Banco,
  userId: string,
  cursoIds: string[],
) {
  const aulas = await aulasDosCursos(db, cursoIds)
  const linhas = await linhasDoAluno(
    db,
    userId,
    aulas.map((a) => a.aulaId),
  )
  return {
    aulas: aulas.map((a) => ({
      cursoId: a.cursoId,
      moduloId: a.moduloId,
      moduloNome: a.moduloNome,
      aulaId: a.aulaId,
      titulo: a.titulo,
    })),
    concluidas: new Set(
      linhas.filter((l) => l.concluidaEm !== null).map((l) => l.aulaId),
    ),
    abertas: new Map(
      linhas
        .filter((l) => l.abertaEm !== null)
        .map((l) => [l.aulaId, (l.abertaEm as Date).getTime()]),
    ),
  }
}

/** Curso da aula (para conferir o acesso antes de gravar o progresso). Nulo se a aula não existe. */
export async function cursoDaAula(
  db: Banco,
  aulaId: string,
): Promise<string | null> {
  const [encontrada] = await comoLibsql(db)
    .select({ cursoId: modulo.cursoId })
    .from(aula)
    .innerJoin(modulo, eq(modulo.id, aula.moduloId))
    .where(
      and(
        eq(aula.id, aulaId),
        isNull(aula.excluidoEm),
        isNull(modulo.excluidoEm),
      ),
    )
  return encontrada?.cursoId ?? null
}
