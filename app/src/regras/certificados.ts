// Certificados (#55). Exigências por curso (todas as aulas, os quizzes obrigatórios para o
// certificado e o mínimo de pontos no curso), emissão automática e retroativa, nome confirmado
// antes da 1ª emissão, código e validação pública, revogação (só o Proprietário) e reemissão.
//
// A data de conclusão é a do cumprimento da última exigência: a maior entre a última aula concluída,
// a aprovação do último quiz obrigatório e o lançamento em que os pontos chegaram ao mínimo.
//
// Pontos de extensão (`GanchosDoCertificado`, passados por quem chama; nada de registro global):
// `aoEmitirCertificado` roda uma vez por certificado novo (o Pedido do MEC, #56, entra aqui).
// O PDF não é gerado aqui: quem emite enfileira (`FILA_PDF`) e o consumidor chama
// `dadosParaOPdf` / `marcarPdfPronto` / `marcarPdfFalhou`.

import {
  and,
  asc,
  desc,
  eq,
  inArray,
  isNotNull,
  isNull,
  lt,
  sql,
} from 'drizzle-orm'
import {
  aula,
  certificado,
  curso,
  lancamentoDePontos,
  matricula,
  modeloDeCertificado,
  modulo,
  progressoDaAula,
  quiz,
  tentativaDoQuiz,
  turma,
  user,
} from '#/db/schema'
import { chaveDeImagemValida } from '#/regras/arquivos-de-conteudo'
import { type PedidoDaAluna, pedidosDaAluna } from '#/regras/pedido-do-mec'
import { exigirPermissao, type Perfil } from '#/regras/permissoes'
import { prepararRegistro } from '#/regras/registro-de-acoes'
import { type Banco, comoLibsql, type Relogio } from '#/regras/tipos'

export class ErroDeCertificado extends Error {
  constructor(mensagem: string) {
    super(mensagem)
    this.name = 'ErroDeCertificado'
  }
}

import {
  CAMPOS_PADRAO,
  type CampoDoModelo,
  type Faltam,
  LIMITE_DO_MOTIVO,
  LIMITE_DO_NOME,
  normalizarCampos,
  normalizarCodigo,
  type SituacaoDasExigencias,
  textoDoQueFalta,
} from '#/regras/certificado-modelo'

export * from '#/regras/certificado-modelo'

const TAMANHO_DO_LOTE = 50

// ---------- Exigências ----------

function lotes<T>(itens: T[]): T[][] {
  const resultado: T[][] = []
  for (let i = 0; i < itens.length; i += TAMANHO_DO_LOTE) {
    resultado.push(itens.slice(i, i + TAMANHO_DO_LOTE))
  }
  return resultado
}

/**
 * Avalia as exigências do curso para os alunos dados (poucas consultas por curso, não por aluno).
 * Quem não aparece no resultado não foi pedido.
 */
export async function avaliarExigencias(
  banco: Banco,
  cursoId: string,
  userIds: string[],
): Promise<Map<string, SituacaoDasExigencias>> {
  const db = comoLibsql(banco)
  const resultado = new Map<string, SituacaoDasExigencias>()
  if (userIds.length === 0) return resultado
  const [cursoDele] = await db
    .select({
      todasAsAulas: curso.certificadoTodasAsAulas,
      pontosMinimos: curso.certificadoPontosMinimos,
    })
    .from(curso)
    .where(and(eq(curso.id, cursoId), isNull(curso.excluidoEm)))
  if (!cursoDele) return resultado

  const aulasAtivas = db
    .select({ id: aula.id })
    .from(aula)
    .innerJoin(modulo, eq(modulo.id, aula.moduloId))
    .where(
      and(
        eq(modulo.cursoId, cursoId),
        isNull(aula.excluidoEm),
        isNull(modulo.excluidoEm),
      ),
    )
  const [{ totalDeAulas }] = await db
    .select({ totalDeAulas: sql<number>`count(*)` })
    .from(aula)
    .innerJoin(modulo, eq(modulo.id, aula.moduloId))
    .where(
      and(
        eq(modulo.cursoId, cursoId),
        isNull(aula.excluidoEm),
        isNull(modulo.excluidoEm),
      ),
    )
  const exigeAulas = cursoDele.todasAsAulas && Number(totalDeAulas) > 0

  const filtroDosObrigatorios = and(
    eq(modulo.cursoId, cursoId),
    eq(quiz.obrigatorioParaCertificado, true),
    isNull(quiz.excluidoEm),
    isNull(aula.excluidoEm),
    isNull(modulo.excluidoEm),
  )
  const obrigatorios = await db
    .select({ quizId: quiz.id, titulo: aula.titulo })
    .from(quiz)
    .innerJoin(aula, eq(aula.id, quiz.aulaId))
    .innerJoin(modulo, eq(modulo.id, aula.moduloId))
    .where(filtroDosObrigatorios)
    .orderBy(asc(modulo.ordem), asc(aula.ordem))
  const quizzesObrigatorios = db
    .select({ id: quiz.id })
    .from(quiz)
    .innerJoin(aula, eq(aula.id, quiz.aulaId))
    .innerJoin(modulo, eq(modulo.id, aula.moduloId))
    .where(filtroDosObrigatorios)
  const exigePontos = cursoDele.pontosMinimos > 0
  const temExigencia = exigeAulas || obrigatorios.length > 0 || exigePontos

  for (const grupo of lotes(userIds)) {
    const concluidas = new Map<string, { total: number; ultima: number }>()
    if (exigeAulas) {
      const linhas = await db
        .select({
          userId: progressoDaAula.userId,
          total: sql<number>`count(*)`,
          ultima: sql<number>`max(${progressoDaAula.concluidaEm})`,
        })
        .from(progressoDaAula)
        .where(
          and(
            inArray(progressoDaAula.userId, grupo),
            isNotNull(progressoDaAula.concluidaEm),
            inArray(progressoDaAula.aulaId, aulasAtivas),
          ),
        )
        .groupBy(progressoDaAula.userId)
      for (const l of linhas) {
        concluidas.set(l.userId, {
          total: Number(l.total),
          ultima: Number(l.ultima),
        })
      }
    }

    // Quiz aprovado: a data é a da correção (quando houve fila) ou a do envio.
    const aprovados = new Map<string, Map<string, number>>()
    if (obrigatorios.length > 0) {
      const linhas = await db
        .select({
          userId: tentativaDoQuiz.userId,
          quizId: tentativaDoQuiz.quizId,
          enviadaEm: tentativaDoQuiz.enviadaEm,
          corrigidaEm: tentativaDoQuiz.corrigidaEm,
        })
        .from(tentativaDoQuiz)
        .where(
          and(
            inArray(tentativaDoQuiz.userId, grupo),
            // Subconsulta: o curso pode ter mais quizzes obrigatórios que o D1 aceita como parâmetros.
            inArray(tentativaDoQuiz.quizId, quizzesObrigatorios),
            eq(tentativaDoQuiz.estado, 'aprovada'),
          ),
        )
      for (const l of linhas) {
        const quando = (l.corrigidaEm ?? l.enviadaEm).getTime()
        const doAluno = aprovados.get(l.userId) ?? new Map<string, number>()
        const anterior = doAluno.get(l.quizId)
        doAluno.set(
          l.quizId,
          anterior === undefined ? quando : Math.min(anterior, quando),
        )
        aprovados.set(l.userId, doAluno)
      }
    }

    // Pontos: o saldo vigente no curso e o lançamento em que passou do mínimo.
    const saldos = new Map<string, { saldo: number; chegouEm: number | null }>()
    if (exigePontos) {
      const linhas = await db
        .select({
          userId: lancamentoDePontos.userId,
          pontos: lancamentoDePontos.pontos,
          criadoEm: lancamentoDePontos.criadoEm,
        })
        .from(lancamentoDePontos)
        .where(
          and(
            inArray(lancamentoDePontos.userId, grupo),
            eq(lancamentoDePontos.cursoId, cursoId),
            isNull(lancamentoDePontos.estornadoEm),
          ),
        )
        .orderBy(asc(lancamentoDePontos.criadoEm))
      for (const l of linhas) {
        const atual = saldos.get(l.userId) ?? { saldo: 0, chegouEm: null }
        atual.saldo += l.pontos
        if (atual.chegouEm === null && atual.saldo >= cursoDele.pontosMinimos) {
          atual.chegouEm = l.criadoEm.getTime()
        }
        saldos.set(l.userId, atual)
      }
    }

    for (const userId of grupo) {
      const faltam: Faltam = { aulas: 0, quizzes: [], pontos: 0 }
      const datas: number[] = []
      if (exigeAulas) {
        const c = concluidas.get(userId)
        faltam.aulas = Math.max(0, Number(totalDeAulas) - (c?.total ?? 0))
        if (faltam.aulas === 0 && c) datas.push(c.ultima)
      }
      for (const o of obrigatorios) {
        const quando = aprovados.get(userId)?.get(o.quizId)
        if (quando === undefined) faltam.quizzes.push(o.titulo)
        else datas.push(quando)
      }
      if (exigePontos) {
        const s = saldos.get(userId)
        faltam.pontos = Math.max(0, cursoDele.pontosMinimos - (s?.saldo ?? 0))
        if (faltam.pontos === 0 && s?.chegouEm != null) datas.push(s.chegouEm)
      }
      const cumpre =
        temExigencia &&
        faltam.aulas === 0 &&
        faltam.quizzes.length === 0 &&
        faltam.pontos === 0
      resultado.set(userId, {
        cumpre,
        faltam,
        concluidoEm:
          cumpre && datas.length > 0 ? new Date(Math.max(...datas)) : null,
      })
    }
  }
  return resultado
}

// ---------- Emissão ----------

export interface CertificadoEmitido {
  id: string
  userId: string
  cursoId: string
  codigo: string
  nome: string
  cursoNome: string
  concluidoEm: Date
}

export interface GanchosDoCertificado {
  /** Roda uma vez por certificado novo (o Pedido do MEC da Formação, #56, entra aqui). */
  aoEmitirCertificado?: (certificado: CertificadoEmitido) => Promise<void>
}

const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

/** Código de validação, no formato XXXX-XXXX (sem letras e números que se confundem). */
export function gerarCodigo(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8))
  const letras = Array.from(bytes, (b) => ALFABETO[b % ALFABETO.length])
  return `${letras.slice(0, 4).join('')}-${letras.slice(4).join('')}`
}

async function modeloAtivo(banco: Banco, cursoId: string) {
  const [linha] = await comoLibsql(banco)
    .select({ frente: modeloDeCertificado.frente })
    .from(modeloDeCertificado)
    .where(
      and(
        eq(modeloDeCertificado.cursoId, cursoId),
        eq(modeloDeCertificado.ativo, true),
      ),
    )
  return linha?.frente ? linha : null
}

export type ResultadoDaVerificacao =
  | { situacao: 'emitido'; certificado: CertificadoEmitido }
  | {
      situacao:
        | 'ja-emitido'
        | 'nao-cumpre'
        | 'sem-modelo'
        | 'aguardando-nome'
        | 'nao-e-aluno'
    }

async function emitir(
  banco: Banco,
  agora: Relogio,
  dados: {
    userId: string
    cursoId: string
    nome: string
    cursoNome: string
    concluidoEm: Date
  },
  ganchos: GanchosDoCertificado,
): Promise<CertificadoEmitido | null> {
  const db = comoLibsql(banco)
  for (let tentativa = 0; tentativa < 5; tentativa++) {
    const id = crypto.randomUUID()
    const codigo = gerarCodigo()
    try {
      const linhas = await db
        .insert(certificado)
        .values({ id, ...dados, codigo, emitidoEm: agora() })
        .onConflictDoNothing({
          target: [certificado.userId, certificado.cursoId],
        })
        .returning({ id: certificado.id })
      if (linhas.length === 0) return null
      const emitido = { id, codigo, ...dados }
      await ganchos.aoEmitirCertificado?.(emitido)
      return emitido
    } catch (erro) {
      // Código repetido (quase impossível): sorteia outro.
      if (!String(erro).includes('certificado_codigo_idx')) throw erro
    }
  }
  throw new ErroDeCertificado('Não consegui gerar um código único.')
}

async function dadosDoAluno(banco: Banco, userId: string) {
  const [linha] = await comoLibsql(banco)
    .select({
      perfil: user.perfil,
      nome: user.nomeNoCertificado,
      confirmadoEm: user.nomeConfirmadoEm,
    })
    .from(user)
    .where(eq(user.id, userId))
  return linha ?? null
}

/**
 * Emite o certificado do aluno naquele curso se o modelo está ativo, as exigências estão cumpridas,
 * o nome foi confirmado e ainda não há certificado. Chamada a cada conclusão de aula, aprovação de
 * quiz e lançamento de pontos; é idempotente.
 */
export async function verificarEEmitir(
  banco: Banco,
  agora: Relogio,
  userId: string,
  cursoId: string,
  ganchos: GanchosDoCertificado = {},
): Promise<ResultadoDaVerificacao> {
  const db = comoLibsql(banco)
  if (!(await modeloAtivo(banco, cursoId))) return { situacao: 'sem-modelo' }
  const aluno = await dadosDoAluno(banco, userId)
  if (aluno?.perfil !== 'aluno') return { situacao: 'nao-e-aluno' }
  const [existente] = await db
    .select({ id: certificado.id })
    .from(certificado)
    .where(
      and(eq(certificado.userId, userId), eq(certificado.cursoId, cursoId)),
    )
  if (existente) return { situacao: 'ja-emitido' }
  const situacao = (await avaliarExigencias(banco, cursoId, [userId])).get(
    userId,
  )
  if (!situacao?.cumpre) return { situacao: 'nao-cumpre' }
  if (!aluno.confirmadoEm || !aluno.nome) {
    return { situacao: 'aguardando-nome' }
  }
  const [cursoDele] = await db
    .select({ nome: curso.nome })
    .from(curso)
    .where(eq(curso.id, cursoId))
  const emitido = await emitir(
    banco,
    agora,
    {
      userId,
      cursoId,
      nome: aluno.nome,
      cursoNome: cursoDele.nome,
      concluidoEm: situacao.concluidoEm ?? agora(),
    },
    ganchos,
  )
  return emitido
    ? { situacao: 'emitido', certificado: emitido }
    : { situacao: 'ja-emitido' }
}

/** Alunos que têm ou tiveram matrícula numa turma do curso (a equipe não recebe certificado). */
async function candidatosDoCurso(banco: Banco, cursoId: string) {
  const linhas = await comoLibsql(banco)
    .selectDistinct({ userId: matricula.userId })
    .from(matricula)
    .innerJoin(turma, eq(turma.id, matricula.turmaId))
    .innerJoin(user, eq(user.id, matricula.userId))
    .where(and(eq(turma.cursoId, cursoId), eq(user.perfil, 'aluno')))
  return linhas.map((l) => l.userId)
}

export interface ResultadoRetroativo {
  emitidos: CertificadoEmitido[]
  /** Quem cumpre as exigências mas ainda não confirmou o nome. */
  aguardandoNome: string[]
}

/**
 * Emissão retroativa: ao ativar o modelo ou facilitar as exigências, quem já as cumpre recebe o
 * certificado. Quem ainda não confirmou o nome fica esperando a confirmação.
 */
export async function emitirRetroativo(
  banco: Banco,
  agora: Relogio,
  cursoId: string,
  ganchos: GanchosDoCertificado = {},
): Promise<ResultadoRetroativo> {
  const db = comoLibsql(banco)
  const vazio: ResultadoRetroativo = { emitidos: [], aguardandoNome: [] }
  if (!(await modeloAtivo(banco, cursoId))) return vazio
  const [cursoDele] = await db
    .select({ nome: curso.nome })
    .from(curso)
    .where(and(eq(curso.id, cursoId), isNull(curso.excluidoEm)))
  if (!cursoDele) return vazio
  const candidatos = await candidatosDoCurso(banco, cursoId)
  const situacoes = await avaliarExigencias(banco, cursoId, candidatos)
  const resultado: ResultadoRetroativo = { emitidos: [], aguardandoNome: [] }
  for (const userId of candidatos) {
    const situacao = situacoes.get(userId)
    if (!situacao?.cumpre) continue
    const r = await verificarEEmitir(banco, agora, userId, cursoId, ganchos)
    if (r.situacao === 'emitido') resultado.emitidos.push(r.certificado)
    else if (r.situacao === 'aguardando-nome') {
      resultado.aguardandoNome.push(userId)
    }
  }
  return resultado
}

// ---------- Nome ----------

/** O nome que o aluno vai confirmar: o já confirmado ou, por padrão, o da conta. */
export async function nomeParaConfirmar(banco: Banco, userId: string) {
  const [linha] = await comoLibsql(banco)
    .select({
      conta: user.name,
      certificado: user.nomeNoCertificado,
      confirmadoEm: user.nomeConfirmadoEm,
    })
    .from(user)
    .where(eq(user.id, userId))
  if (!linha) throw new ErroDeCertificado('Pessoa não encontrada.')
  return {
    nome: linha.certificado ?? linha.conta,
    confirmado: linha.confirmadoEm !== null,
  }
}

function nomeValido(texto: string): string {
  const nome = texto.trim().replace(/\s+/g, ' ')
  if (nome.length < 3) throw new ErroDeCertificado('Informe o nome completo.')
  if (nome.length > LIMITE_DO_NOME) {
    throw new ErroDeCertificado(`O nome passa de ${LIMITE_DO_NOME} letras.`)
  }
  return nome
}

/**
 * O aluno confirma como o nome sai no certificado e, em seguida, os certificados que já estavam
 * esperando são emitidos. Devolve os emitidos agora.
 */
export async function confirmarNome(
  banco: Banco,
  agora: Relogio,
  userId: string,
  nomeDigitado: string,
  ganchos: GanchosDoCertificado = {},
): Promise<CertificadoEmitido[]> {
  const nome = nomeValido(nomeDigitado)
  await comoLibsql(banco)
    .update(user)
    .set({ nomeNoCertificado: nome, nomeConfirmadoEm: agora() })
    .where(eq(user.id, userId))
  const pendentes = await pendentesDoAluno(banco, userId)
  const emitidos: CertificadoEmitido[] = []
  for (const p of pendentes) {
    const r = await verificarEEmitir(banco, agora, userId, p.cursoId, ganchos)
    if (r.situacao === 'emitido') emitidos.push(r.certificado)
  }
  return emitidos
}

/** Cursos com modelo ativo cujas exigências o aluno cumpriu e que ainda não têm certificado. */
export async function pendentesDoAluno(banco: Banco, userId: string) {
  const db = comoLibsql(banco)
  const modelos = await db
    .select({ cursoId: curso.id, cursoNome: curso.nome })
    .from(modeloDeCertificado)
    .innerJoin(curso, eq(curso.id, modeloDeCertificado.cursoId))
    .where(and(eq(modeloDeCertificado.ativo, true), isNull(curso.excluidoEm)))
  const tem = new Set(
    (
      await db
        .select({ cursoId: certificado.cursoId })
        .from(certificado)
        .where(eq(certificado.userId, userId))
    ).map((c) => c.cursoId),
  )
  const pendentes: { cursoId: string; cursoNome: string }[] = []
  for (const m of modelos) {
    if (tem.has(m.cursoId)) continue
    const s = (await avaliarExigencias(banco, m.cursoId, [userId])).get(userId)
    if (s?.cumpre) pendentes.push(m)
  }
  return pendentes
}

// ---------- Situação para o aluno ----------

/** Frente do modelo e os campos dela, o que a prévia precisa para desenhar o certificado no navegador. */
export interface ModeloParaPrevia {
  frente: string
  campos: CampoDoModelo[]
}

export type CertificadoDoCurso = (
  | { tipo: 'sem-certificado' }
  | {
      tipo: 'emitido'
      certificado: CertificadoDoAluno
      /** Nulo se o modelo foi desativado ou ficou sem imagem depois da emissão: sem prévia. */
      modelo: ModeloParaPrevia | null
    }
  | { tipo: 'aguardando-nome' }
  | { tipo: 'faltam'; faltam: Faltam; texto: string }
) & {
  /** O curso é a Formação: o certificado do MEC vem depois, pela Voomp. */
  geraMec: boolean
}

/** O que a página do curso e a tela de conclusão mostram sobre o certificado. */
export async function certificadoDoCurso(
  banco: Banco,
  userId: string,
  cursoId: string,
): Promise<CertificadoDoCurso> {
  const db = comoLibsql(banco)
  const [dele] = await db
    .select({ gera: curso.geraPedidoDoMec })
    .from(curso)
    .where(eq(curso.id, cursoId))
  const geraMec = dele?.gera ?? false
  const [emitido] = await certificadosDoAluno(banco, userId, cursoId)
  if (emitido) {
    return {
      tipo: 'emitido',
      certificado: emitido,
      modelo: emitido.modelo,
      geraMec,
    }
  }
  if (!(await modeloAtivo(banco, cursoId))) {
    return { tipo: 'sem-certificado', geraMec }
  }
  const s = (await avaliarExigencias(banco, cursoId, [userId])).get(userId)
  if (!s) return { tipo: 'sem-certificado', geraMec }
  if (s.cumpre) return { tipo: 'aguardando-nome', geraMec }
  const texto = textoDoQueFalta(s.faltam)
  return texto
    ? { tipo: 'faltam', faltam: s.faltam, texto, geraMec }
    : { tipo: 'sem-certificado', geraMec }
}

/** Um exercício (quiz) do curso no caminho do certificado. */
export interface ExercicioDoCaminho {
  aulaId: string
  titulo: string
  /** Nome do módulo da aula: abre o grupo na lista. */
  modulo: string
  pontos: number
  obrigatorio: boolean
  aprovado: boolean
}

/** O que a aluna precisa para o certificado do curso, com o próprio progresso. */
export interface CaminhoDoCertificado {
  pontosMinimos: number
  pontos: number
  exigeTodasAsAulas: boolean
  exercicios: ExercicioDoCaminho[]
}

/**
 * O caminho do certificado de um curso para uma aluna: o mínimo de pontos e o saldo dela no curso,
 * e cada exercício (quiz) do curso com os pontos, se é obrigatório e se ela já foi aprovada. Nulo
 * quando o curso não tem certificado com exigência.
 */
export async function caminhoDoCertificado(
  banco: Banco,
  userId: string,
  cursoId: string,
): Promise<CaminhoDoCertificado | null> {
  const db = comoLibsql(banco)
  const [cursoDele] = await db
    .select({
      todasAsAulas: curso.certificadoTodasAsAulas,
      pontosMinimos: curso.certificadoPontosMinimos,
    })
    .from(curso)
    .where(and(eq(curso.id, cursoId), isNull(curso.excluidoEm)))
  if (!cursoDele) return null
  const [quizzes, aprovadas, [saldo]] = await Promise.all([
    db
      .select({
        quizId: quiz.id,
        aulaId: aula.id,
        titulo: aula.titulo,
        modulo: modulo.nome,
        pontos: quiz.pontos,
        obrigatorio: quiz.obrigatorioParaCertificado,
      })
      .from(quiz)
      .innerJoin(aula, eq(aula.id, quiz.aulaId))
      .innerJoin(modulo, eq(modulo.id, aula.moduloId))
      .where(
        and(
          eq(modulo.cursoId, cursoId),
          isNull(quiz.excluidoEm),
          isNull(aula.excluidoEm),
          isNull(modulo.excluidoEm),
        ),
      )
      .orderBy(asc(modulo.ordem), asc(aula.ordem)),
    db
      .selectDistinct({ quizId: tentativaDoQuiz.quizId })
      .from(tentativaDoQuiz)
      .where(
        and(
          eq(tentativaDoQuiz.userId, userId),
          eq(tentativaDoQuiz.estado, 'aprovada'),
        ),
      ),
    db
      .select({
        pontos: sql<number>`coalesce(sum(${lancamentoDePontos.pontos}), 0)`,
      })
      .from(lancamentoDePontos)
      .where(
        and(
          eq(lancamentoDePontos.userId, userId),
          eq(lancamentoDePontos.cursoId, cursoId),
          isNull(lancamentoDePontos.estornadoEm),
        ),
      ),
  ])
  const exercicios = quizzes.map((q) => ({
    aulaId: q.aulaId,
    titulo: q.titulo,
    modulo: q.modulo,
    pontos: q.pontos,
    obrigatorio: q.obrigatorio,
    aprovado: aprovadas.some((a) => a.quizId === q.quizId),
  }))
  const temExigencia =
    cursoDele.todasAsAulas ||
    cursoDele.pontosMinimos > 0 ||
    exercicios.some((e) => e.obrigatorio)
  if (!temExigencia) return null
  return {
    pontosMinimos: cursoDele.pontosMinimos,
    pontos: Math.max(0, Number(saldo?.pontos ?? 0)),
    exigeTodasAsAulas: cursoDele.todasAsAulas,
    exercicios,
  }
}

export async function modeloParaPrevia(
  banco: Banco,
  cursoId: string,
): Promise<ModeloParaPrevia | null> {
  return (await modelosParaPrevia(banco, [cursoId])).get(cursoId) ?? null
}

/** Os modelos de vários cursos numa consulta só (curso sem modelo ou sem imagem fica de fora). */
async function modelosParaPrevia(
  banco: Banco,
  cursoIds: string[],
): Promise<Map<string, ModeloParaPrevia>> {
  const mapa = new Map<string, ModeloParaPrevia>()
  if (cursoIds.length === 0) return mapa
  const linhas = await comoLibsql(banco)
    .select({
      cursoId: modeloDeCertificado.cursoId,
      frente: modeloDeCertificado.frente,
      campos: modeloDeCertificado.campos,
    })
    .from(modeloDeCertificado)
    .where(inArray(modeloDeCertificado.cursoId, cursoIds))
  for (const m of linhas) {
    if (!m.frente) continue
    mapa.set(m.cursoId, {
      frente: m.frente,
      campos: normalizarCampos(safeJson(m.campos)).filter(
        (c) => c.lado === 'frente',
      ),
    })
  }
  return mapa
}

/** A situação única do certificado: revogado vence tudo; senão vale o estado do PDF. */
export type SituacaoDoCertificado = 'gerando' | 'pronto' | 'falhou' | 'revogado'

export function situacaoDoCertificado(c: {
  revogadoEm: Date | null
  pdfEstado: 'gerando' | 'pronto' | 'falhou'
}): SituacaoDoCertificado {
  return c.revogadoEm ? 'revogado' : c.pdfEstado
}

export interface CertificadoDoAluno {
  id: string
  cursoId: string
  cursoNome: string
  codigo: string
  nome: string
  concluidoEm: Date
  emitidoEm: Date
  /** O aluno só baixa com o PDF pronto e o certificado não revogado. */
  situacao: SituacaoDoCertificado
  /** Frente e campos do modelo do curso, para a prévia. Nulo se o modelo ficou sem imagem. */
  modelo: ModeloParaPrevia | null
  /** Certificado do MEC (#56), só nos cursos que geram Pedido do MEC: "em liberação" ou "liberado em dd/mm" com o link. */
  mec: PedidoDaAluna | null
}

/** Os certificados do aluno (baixa mesmo com o acesso expirado). */
export async function certificadosDoAluno(
  banco: Banco,
  userId: string,
  cursoId?: string,
): Promise<CertificadoDoAluno[]> {
  const linhas = await comoLibsql(banco)
    .select()
    .from(certificado)
    .where(
      cursoId
        ? and(eq(certificado.userId, userId), eq(certificado.cursoId, cursoId))
        : eq(certificado.userId, userId),
    )
    .orderBy(desc(certificado.emitidoEm))
  const pedidos = await pedidosDaAluna(banco, userId)
  const modelos = await modelosParaPrevia(banco, [
    ...new Set(linhas.map((l) => l.cursoId)),
  ])
  return linhas.map((l) => ({
    id: l.id,
    cursoId: l.cursoId,
    cursoNome: l.cursoNome,
    codigo: l.codigo,
    nome: l.nome,
    concluidoEm: l.concluidoEm,
    emitidoEm: l.emitidoEm,
    mec: pedidos.get(l.id) ?? null,
    modelo: modelos.get(l.cursoId) ?? null,
    situacao: situacaoDoCertificado(l),
  }))
}

/** Para a tela do aluno no painel: estado completo, inclusive falha do PDF e motivo da revogação. */
export async function certificadosParaAEquipe(banco: Banco, userId: string) {
  const linhas = await comoLibsql(banco)
    .select()
    .from(certificado)
    .where(eq(certificado.userId, userId))
    .orderBy(desc(certificado.emitidoEm))
  return linhas.map((l) => ({
    id: l.id,
    cursoNome: l.cursoNome,
    codigo: l.codigo,
    nome: l.nome,
    concluidoEm: l.concluidoEm,
    pdfEstado: l.pdfEstado,
    situacao: situacaoDoCertificado(l),
    revogado: l.revogadoEm !== null,
    revogadoEm: l.revogadoEm,
    revogadoMotivo: l.revogadoMotivo,
  }))
}

// ---------- Download ----------

/** O PDF do certificado para o dono (ou null se não é dele, não está pronto ou foi revogado). */
export async function pdfParaBaixar(
  banco: Banco,
  userId: string,
  certificadoId: string,
): Promise<{ chave: string; nomeDoArquivo: string } | null> {
  const [l] = await comoLibsql(banco)
    .select()
    .from(certificado)
    .where(
      and(eq(certificado.id, certificadoId), eq(certificado.userId, userId)),
    )
  if (!l || l.revogadoEm || l.pdfEstado !== 'pronto' || !l.pdfChave) return null
  return { chave: l.pdfChave, nomeDoArquivo: `Certificado ${l.cursoNome}.pdf` }
}

// ---------- Validação pública ----------

export interface ResultadoDaValidacao {
  estado: 'valido' | 'revogado'
  nome: string
  cursoNome: string
  concluidoEm: Date
  codigo: string
}

/** Página pública: nome, curso, data de conclusão e se vale. Nulo se o código não existe. */
export async function validarCodigo(
  banco: Banco,
  codigoDigitado: string,
): Promise<ResultadoDaValidacao | null> {
  const codigo = normalizarCodigo(codigoDigitado)
  if (!codigo) return null
  const [l] = await comoLibsql(banco)
    .select()
    .from(certificado)
    .where(eq(certificado.codigo, codigo))
  if (!l) return null
  return {
    estado: situacaoDoCertificado(l) === 'revogado' ? 'revogado' : 'valido',
    nome: l.nome,
    cursoNome: l.cursoNome,
    concluidoEm: l.concluidoEm,
    codigo: l.codigo,
  }
}

// ---------- Equipe: revogar, corrigir o nome, regenerar ----------

async function certificadoPorId(banco: Banco, id: string) {
  const [l] = await comoLibsql(banco)
    .select()
    .from(certificado)
    .where(eq(certificado.id, id))
  if (!l) throw new ErroDeCertificado('Certificado não encontrado.')
  return l
}

/** Só o Proprietário revoga, com motivo; a página pública passa a mostrar "Revogado". */
export async function revogarCertificado(
  banco: Banco,
  agora: Relogio,
  entrada: {
    perfil: Perfil
    autorId: string
    certificadoId: string
    motivo: string
  },
): Promise<void> {
  exigirPermissao(entrada.perfil, 'revogar-certificado')
  const motivo = entrada.motivo.trim()
  if (motivo.length < 3) throw new ErroDeCertificado('Informe o motivo.')
  if (motivo.length > LIMITE_DO_MOTIVO) {
    throw new ErroDeCertificado(`O motivo passa de ${LIMITE_DO_MOTIVO} letras.`)
  }
  const atual = await certificadoPorId(banco, entrada.certificadoId)
  if (atual.revogadoEm) throw new ErroDeCertificado('Já está revogado.')
  const db = comoLibsql(banco)
  await db.batch([
    db
      .update(certificado)
      .set({
        revogadoEm: agora(),
        revogadoMotivo: motivo,
        revogadoPorId: entrada.autorId,
      })
      .where(eq(certificado.id, atual.id)),
    prepararRegistro(banco, agora, {
      autorId: entrada.autorId,
      acao: 'certificado-revogado',
      detalhe: { codigo: atual.codigo, curso: atual.cursoNome, motivo },
    }),
  ])
}

/**
 * A Equipe corrige o nome e reemite: o certificado mantém o código (o QR impresso continua valendo)
 * e o PDF volta a "gerando". O nome também passa a valer para os próximos certificados do aluno.
 * Quem chama enfileira o PDF de novo.
 */
export async function corrigirNomeEReemitir(
  banco: Banco,
  agora: Relogio,
  entrada: {
    perfil: Perfil
    autorId: string
    certificadoId: string
    nome: string
  },
): Promise<void> {
  exigirPermissao(entrada.perfil, 'usar-estudio')
  const nome = nomeValido(entrada.nome)
  const atual = await certificadoPorId(banco, entrada.certificadoId)
  if (atual.revogadoEm) {
    throw new ErroDeCertificado('Este certificado foi revogado.')
  }
  const db = comoLibsql(banco)
  await db.batch([
    db
      .update(certificado)
      .set({ nome, pdfEstado: 'gerando' })
      .where(eq(certificado.id, atual.id)),
    db
      .update(user)
      .set({ nomeNoCertificado: nome, nomeConfirmadoEm: agora() })
      .where(eq(user.id, atual.userId)),
    prepararRegistro(banco, agora, {
      autorId: entrada.autorId,
      acao: 'certificado-reemitido',
      detalhe: {
        codigo: atual.codigo,
        curso: atual.cursoNome,
        de: atual.nome,
        para: nome,
      },
    }),
  ])
}

/** Regenerar o PDF (mesmos dados): volta a "gerando"; quem chama enfileira. */
export async function pedirNovoPdf(
  banco: Banco,
  perfil: Perfil,
  certificadoId: string,
): Promise<void> {
  exigirPermissao(perfil, 'usar-estudio')
  const atual = await certificadoPorId(banco, certificadoId)
  if (atual.revogadoEm) {
    throw new ErroDeCertificado('Este certificado foi revogado.')
  }
  await comoLibsql(banco)
    .update(certificado)
    .set({ pdfEstado: 'gerando' })
    .where(eq(certificado.id, atual.id))
}

// ---------- PDF (consumidor da fila) ----------

export interface DadosDoPdf {
  id: string
  codigo: string
  nome: string
  cursoNome: string
  concluidoEm: Date
  frente: string
  verso: string | null
  campos: CampoDoModelo[]
}

/** Tudo o que o PDF precisa. Nulo se o certificado ou o modelo sumiu. */
export async function dadosParaOPdf(
  banco: Banco,
  certificadoId: string,
): Promise<DadosDoPdf | null> {
  const m = modeloDeCertificado
  const [l] = await comoLibsql(banco)
    .select({
      id: certificado.id,
      codigo: certificado.codigo,
      nome: certificado.nome,
      cursoNome: certificado.cursoNome,
      concluidoEm: certificado.concluidoEm,
      frente: m.frente,
      verso: m.verso,
      campos: m.campos,
    })
    .from(certificado)
    .innerJoin(m, eq(m.cursoId, certificado.cursoId))
    .where(eq(certificado.id, certificadoId))
  if (!l?.frente) return null
  return {
    ...l,
    frente: l.frente,
    campos: normalizarCampos(safeJson(l.campos)),
  }
}

function safeJson(texto: string): unknown {
  try {
    return JSON.parse(texto)
  } catch {
    return []
  }
}

export const chaveDoPdf = (certificadoId: string) =>
  `certificados/${certificadoId}.pdf`

/** O PDF ficou pronto. Diz se é a primeira vez (é quando o aluno é avisado). Revogado nunca vira pronto. */
export async function marcarPdfPronto(
  banco: Banco,
  agora: Relogio,
  certificadoId: string,
  chave: string,
): Promise<{ primeiraVez: boolean }> {
  const db = comoLibsql(banco)
  const instante = agora()
  // O PDF pronto e a marca de "avisado" gravam juntos; a segunda só pega na primeira vez.
  const [, avisados] = await db.batch([
    db
      .update(certificado)
      .set({ pdfEstado: 'pronto', pdfChave: chave, pdfGeradoEm: instante })
      .where(
        and(eq(certificado.id, certificadoId), isNull(certificado.revogadoEm)),
      ),
    db
      .update(certificado)
      .set({ avisadoEm: instante })
      .where(
        and(
          eq(certificado.id, certificadoId),
          isNull(certificado.avisadoEm),
          isNull(certificado.revogadoEm),
        ),
      )
      .returning({ id: certificado.id }),
  ])
  return { primeiraVez: avisados.length > 0 }
}

/** A fila desistiu: a Equipe e o aluno veem "falhou"; a Equipe pode regenerar. */
export async function marcarPdfFalhou(
  banco: Banco,
  certificadoId: string,
): Promise<void> {
  await comoLibsql(banco)
    .update(certificado)
    .set({ pdfEstado: 'falhou' })
    .where(eq(certificado.id, certificadoId))
}

// ---------- Editor do modelo (painel) ----------

export interface ModeloDoPainel {
  cursoId: string
  cursoNome: string
  ativo: boolean
  frente: string | null
  verso: string | null
  campos: CampoDoModelo[]
  todasAsAulas: boolean
  pontosMinimos: number
  /** Títulos das aulas dos quizzes obrigatórios (marcados no editor do quiz). */
  quizzesObrigatorios: string[]
}

export async function lerModelo(
  banco: Banco,
  cursoId: string,
): Promise<ModeloDoPainel> {
  const db = comoLibsql(banco)
  // Curso, modelo e quizzes obrigatórios não dependem um do outro: uma ida só.
  const [[c], [m], quizzes] = await db.batch([
    db
      .select()
      .from(curso)
      .where(and(eq(curso.id, cursoId), isNull(curso.excluidoEm))),
    db
      .select()
      .from(modeloDeCertificado)
      .where(eq(modeloDeCertificado.cursoId, cursoId)),
    db
      .select({ titulo: aula.titulo })
      .from(quiz)
      .innerJoin(aula, eq(aula.id, quiz.aulaId))
      .innerJoin(modulo, eq(modulo.id, aula.moduloId))
      .where(
        and(
          eq(modulo.cursoId, cursoId),
          eq(quiz.obrigatorioParaCertificado, true),
          isNull(quiz.excluidoEm),
          isNull(aula.excluidoEm),
          isNull(modulo.excluidoEm),
        ),
      )
      .orderBy(asc(modulo.ordem), asc(aula.ordem)),
  ])
  if (!c) throw new ErroDeCertificado('Curso não encontrado.')
  return {
    cursoId,
    cursoNome: c.nome,
    ativo: m?.ativo ?? false,
    frente: m?.frente ?? null,
    verso: m?.verso ?? null,
    campos: m ? normalizarCampos(safeJson(m.campos)) : CAMPOS_PADRAO,
    todasAsAulas: c.certificadoTodasAsAulas,
    pontosMinimos: c.certificadoPontosMinimos,
    quizzesObrigatorios: quizzes.map((q) => q.titulo),
  }
}

export interface EntradaDoModelo {
  ativo: boolean
  frente: string | null
  verso: string | null
  campos: unknown
  todasAsAulas: boolean
  pontosMinimos: number
}

/** Salva o modelo e as exigências do curso. Ativar exige a imagem da frente. */
export async function salvarModelo(
  banco: Banco,
  agora: Relogio,
  cursoId: string,
  entrada: EntradaDoModelo,
): Promise<void> {
  const db = comoLibsql(banco)
  const [c] = await db
    .select({ id: curso.id })
    .from(curso)
    .where(and(eq(curso.id, cursoId), isNull(curso.excluidoEm)))
  if (!c) throw new ErroDeCertificado('Curso não encontrado.')
  if (entrada.ativo && !entrada.frente) {
    throw new ErroDeCertificado(
      'Envie a imagem da frente para ativar o modelo.',
    )
  }
  for (const chave of [entrada.frente, entrada.verso]) {
    if (!chave) continue
    // O PDF só embute PNG e JPEG, e a imagem tem de estar na pasta de imagens do conteúdo.
    if (!chaveDeImagemValida(chave) || !/\.(png|jpe?g)$/i.test(chave)) {
      throw new ErroDeCertificado('A imagem do modelo precisa ser PNG ou JPEG.')
    }
  }
  if (!Number.isInteger(entrada.pontosMinimos) || entrada.pontosMinimos < 0) {
    throw new ErroDeCertificado(
      'Os pontos mínimos são um número inteiro, de 0 em diante.',
    )
  }
  const campos = JSON.stringify(normalizarCampos(entrada.campos))
  const valores = {
    ativo: entrada.ativo,
    frente: entrada.frente,
    verso: entrada.verso,
    campos,
    atualizadoEm: agora(),
  }
  await db.batch([
    db
      .insert(modeloDeCertificado)
      .values({ id: crypto.randomUUID(), cursoId, ...valores })
      .onConflictDoUpdate({
        target: modeloDeCertificado.cursoId,
        set: valores,
      }),
    db
      .update(curso)
      .set({
        certificadoTodasAsAulas: entrada.todasAsAulas,
        certificadoPontosMinimos: entrada.pontosMinimos,
      })
      .where(eq(curso.id, cursoId)),
  ])
}

/** Quem recebe o aviso de "certificado pronto" e o que citar nele. Nulo se o certificado sumiu. */
export async function dadosParaAvisarEmissao(
  banco: Banco,
  certificadoId: string,
): Promise<{ id: string; email: string; nome: string; curso: string } | null> {
  const [dono] = await comoLibsql(banco)
    .select({
      id: user.id,
      email: user.email,
      nome: certificado.nome,
      curso: certificado.cursoNome,
    })
    .from(certificado)
    .innerJoin(user, eq(user.id, certificado.userId))
    .where(eq(certificado.id, certificadoId))
  return dono ?? null
}

// ---------- Varredura dos PDFs que ficaram sem fila ----------

/** Quanto tempo um certificado "gerando" espera antes de a varredura reenfileirar. */
export const ESPERA_DA_VARREDURA_EM_MS = 30 * 60 * 1000

/** Certificados "gerando", não revogados, sem PDF e emitidos há mais de 30 min: a fila deve ter falhado. */
export async function certificadosParaReenfileirar(
  banco: Banco,
  agora: Relogio,
): Promise<string[]> {
  const limite = new Date(agora().getTime() - ESPERA_DA_VARREDURA_EM_MS)
  const linhas = await comoLibsql(banco)
    .select({ id: certificado.id })
    .from(certificado)
    .where(
      and(
        eq(certificado.pdfEstado, 'gerando'),
        isNull(certificado.revogadoEm),
        isNull(certificado.pdfGeradoEm),
        lt(certificado.emitidoEm, limite),
      ),
    )
  return linhas.map((l) => l.id)
}
