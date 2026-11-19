// Relatórios de leitura da equipe: período em horário de Brasília, Panorama e Progresso dos alunos.
// (Satisfação e Quizzes ficam em `relatorios-satisfacao.ts` e `relatorios-quizzes.ts`.)
//
// Definições (valem para a tela e para o CSV):
// - Último acesso do aluno: o mais recente entre a atividade da sessão, a última aula aberta e o
//   aceite dos termos (o primeiro acesso). Sem nenhum dos três, "nunca acessou".
// - Aluno ativo no período: abriu ou gravou o vídeo de alguma aula no período; no total geral
//   (sem filtro de curso) também conta quem só entrou na área.
// - Novos: alunos criados no período (no filtro de curso, com matrícula criada no período no curso).
// - Nunca acessaram: alunos sem nenhum acesso, hoje (não depende do período).
//
// Pontos de extensão (`Ganchos`, passados por quem chama):
// - `contarComentarios`: os comentários (#47) entram aqui; sem o gancho, mostra 0;
// - `pontosDosAlunos`: os pontos (#54) entram aqui; sem o gancho, a coluna fica vazia.

import {
  type AnyColumn,
  and,
  asc,
  eq,
  gte,
  inArray,
  isNotNull,
  isNull,
  lte,
  or,
  sql,
} from 'drizzle-orm'
import {
  aula,
  avaliacaoDaAula,
  curso,
  matricula,
  modulo,
  progressoDaAula,
  session,
  turma,
  user,
} from '#/db/schema'
import { fimDoDiaEmBrasilia, inicioDoDiaEmBrasilia } from '#/lib/datas'
import { situacaoDaMatricula } from '#/regras/matricula'
import { type Banco, comoLibsql, type Relogio } from '#/regras/tipos'

export class ErroDeRelatorio extends Error {
  constructor(mensagem: string) {
    super(mensagem)
    this.name = 'ErroDeRelatorio'
  }
}

const DIA_MS = 86_400_000
export const DIAS_DO_PERIODO_PADRAO = 30

// ---------- Período ----------

export interface Periodo {
  de: Date
  ate: Date
}

const diaEmBrasilia = (instante: Date) =>
  new Date(instante.getTime() - 3 * 3_600_000).toISOString().slice(0, 10)

/**
 * Período do relatório a partir de datas aaaa-mm-dd, do começo do primeiro dia ao fim do último, em
 * Brasília. Sem datas: os últimos 30 dias, incluindo hoje. Com uma só, a outra completa o período.
 */
export function periodoDoRelatorio(
  agora: Date,
  de?: string | null,
  ate?: string | null,
): Periodo {
  const fim = fimDoDiaEmBrasilia(ate)
  const inicio = inicioDoDiaEmBrasilia(de)
  if ((de && !inicio) || (ate && !fim)) {
    throw new ErroDeRelatorio('Use datas no formato aaaa-mm-dd.')
  }
  const fimFinal = fim ?? fimDoDiaEmBrasilia(diaEmBrasilia(agora)) ?? agora
  const inicioFinal =
    inicio ??
    inicioDoDiaEmBrasilia(
      diaEmBrasilia(
        new Date(fimFinal.getTime() - (DIAS_DO_PERIODO_PADRAO - 1) * DIA_MS),
      ),
    ) ??
    agora
  if (inicioFinal.getTime() > fimFinal.getTime()) {
    throw new ErroDeRelatorio('A data inicial vem depois da final.')
  }
  return { de: inicioFinal, ate: fimFinal }
}

const dentro = (data: Date | null, periodo: Periodo) =>
  data !== null &&
  data.getTime() >= periodo.de.getTime() &&
  data.getTime() <= periodo.ate.getTime()

// ---------- Cursos ----------

export async function cursosParaFiltro(banco: Banco) {
  return comoLibsql(banco)
    .select({ id: curso.id, nome: curso.nome })
    .from(curso)
    .where(isNull(curso.excluidoEm))
    .orderBy(asc(curso.ordem))
}

// Aulas ativas (aula e módulo não excluídos), com o curso de cada uma. Com `cursoId`, só as dele.
function consultaDeAulasAtivas(banco: Banco, cursoId: string | null) {
  return comoLibsql(banco)
    .select({ aulaId: aula.id, cursoId: modulo.cursoId })
    .from(aula)
    .innerJoin(modulo, eq(modulo.id, aula.moduloId))
    .where(
      and(
        isNull(aula.excluidoEm),
        isNull(modulo.excluidoEm),
        cursoId ? eq(modulo.cursoId, cursoId) : undefined,
      ),
    )
}

// ---------- Último acesso ----------

// As três fontes do último acesso, prontas para irem juntas num `batch`: uma linha por aluno (o mais
// recente de cada fonte), em vez de uma linha por sessão ou por aula aberta.
function consultasDeAcessos(db: ReturnType<typeof comoLibsql>) {
  return {
    sessoes: db
      .select({
        userId: session.userId,
        quando: sql<Date | null>`max(${session.updatedAt})`.mapWith(
          session.updatedAt,
        ),
      })
      .from(session)
      .groupBy(session.userId),
    aulasAbertas: db
      .select({
        userId: progressoDaAula.userId,
        quando: sql<Date | null>`max(${progressoDaAula.abertaEm})`.mapWith(
          progressoDaAula.abertaEm,
        ),
      })
      .from(progressoDaAula)
      .groupBy(progressoDaAula.userId),
    termos: db
      .select({ userId: user.id, quando: user.termosAceitoEm })
      .from(user)
      .where(isNotNull(user.termosAceitoEm)),
  }
}

type FontesDeAcesso = {
  userId: string
  quando: Date | null
}[][]

function juntarAcessos(fontes: FontesDeAcesso): Map<string, Date> {
  const mapa = new Map<string, Date>()
  for (const fonte of fontes) {
    for (const { userId, quando } of fonte) {
      if (!quando) continue
      const atual = mapa.get(userId)
      if (!atual || atual.getTime() < quando.getTime()) mapa.set(userId, quando)
    }
  }
  return mapa
}

/** Último acesso de cada aluno (só quem já acessou aparece no mapa). */
export async function ultimosAcessos(banco: Banco): Promise<Map<string, Date>> {
  const db = comoLibsql(banco)
  const q = consultasDeAcessos(db)
  return juntarAcessos(await db.batch([q.sessoes, q.aulasAbertas, q.termos]))
}

// ---------- Panorama ----------

export interface FiltroDoRelatorio {
  periodo: Periodo
  cursoId?: string | null
}

export interface GanchosDoPanorama {
  /** Comentários do período (#47) de um curso (ou do total); sem o gancho, 0. */
  contarComentarios?: (contexto: {
    db: Banco
    periodo: Periodo
    cursoId: string | null
  }) => Promise<number>
  /**
   * Comentários do período de TODOS os cursos de uma vez (curso -> total). Com este gancho o Panorama
   * faz uma consulta só, em vez de uma por curso; vale mais que `contarComentarios`.
   */
  contarComentariosPorCurso?: (
    db: Banco,
    periodo: Periodo,
  ) => Promise<Map<string, number>>
}

export interface MetricasDoPanorama {
  alunosAtivos: number
  novos: number
  nuncaAcessaram: number
  aulasConcluidas: number
  comentarios: number
  avaliacoes: number
}

export interface PanoramaDoCurso extends MetricasDoPanorama {
  cursoId: string
  cursoNome: string
}

export interface Panorama {
  periodo: Periodo
  geral: MetricasDoPanorama
  porCurso: PanoramaDoCurso[]
}

// Tudo o que o Panorama lê, de uma vez: as consultas não dependem umas das outras (cada curso é só um
// filtro em memória sobre estas linhas), então saem juntas, e não uma rodada por curso. As linhas de
// progresso, sessão e avaliação já vêm só do período: nenhuma métrica usa o que ficou fora dele.
async function lerDadosDoPanorama(banco: Banco, periodo: Periodo) {
  const db = comoLibsql(banco)
  const nele = (coluna: AnyColumn) =>
    and(gte(coluna, periodo.de), lte(coluna, periodo.ate))
  const acessos = consultasDeAcessos(db)
  const [
    cursos,
    alunos,
    matriculas,
    aulas,
    progresso,
    sessoes,
    avaliacoes,
    ...fontesDeAcesso
  ] = await db.batch([
    db
      .select({ id: curso.id, nome: curso.nome })
      .from(curso)
      .where(isNull(curso.excluidoEm))
      .orderBy(asc(curso.ordem)),
    db
      .select({ id: user.id, criadoEm: user.createdAt })
      .from(user)
      .where(eq(user.perfil, 'aluno')),
    db
      .select({
        userId: matricula.userId,
        criadaEm: matricula.criadoEm,
        cursoId: turma.cursoId,
      })
      .from(matricula)
      .innerJoin(turma, eq(turma.id, matricula.turmaId)),
    consultaDeAulasAtivas(banco, null),
    db
      .select({
        userId: progressoDaAula.userId,
        aulaId: progressoDaAula.aulaId,
        abertaEm: progressoDaAula.abertaEm,
        gravadaEm: progressoDaAula.gravadaEm,
        concluidaEm: progressoDaAula.concluidaEm,
      })
      .from(progressoDaAula)
      .where(
        or(
          nele(progressoDaAula.abertaEm),
          nele(progressoDaAula.gravadaEm),
          nele(progressoDaAula.concluidaEm),
        ),
      ),
    db
      .select({ userId: session.userId })
      .from(session)
      .where(nele(session.updatedAt))
      .groupBy(session.userId),
    db
      .select({
        aulaId: avaliacaoDaAula.aulaId,
        quando: avaliacaoDaAula.atualizadaEm,
      })
      .from(avaliacaoDaAula)
      .where(nele(avaliacaoDaAula.atualizadaEm)),
    acessos.sessoes,
    acessos.aulasAbertas,
    acessos.termos,
  ])
  return {
    cursos,
    alunos,
    matriculas,
    aulas,
    progresso,
    sessoes,
    avaliacoes,
    acessos: juntarAcessos(fontesDeAcesso as FontesDeAcesso),
  }
}

type DadosDoPanorama = Awaited<ReturnType<typeof lerDadosDoPanorama>>

// As métricas de um curso (ou do total, sem `cursoId`) a partir das linhas já lidas.
function metricasDoPanorama(
  dados: DadosDoPanorama,
  periodo: Periodo,
  cursoId: string | null,
  comentarios: number,
): MetricasDoPanorama {
  const alunos = new Set(dados.alunos.map((a) => a.id))
  let universo = alunos
  let novos = dados.alunos.filter((a) => dentro(a.criadoEm, periodo)).length

  if (cursoId) {
    const doCurso = dados.matriculas.filter((m) => m.cursoId === cursoId)
    universo = new Set(
      doCurso.map((m) => m.userId).filter((id) => alunos.has(id)),
    )
    novos = new Set(
      doCurso
        .filter((m) => universo.has(m.userId) && dentro(m.criadaEm, periodo))
        .map((m) => m.userId),
    ).size
  }

  const aulaIds = new Set(
    dados.aulas
      .filter((a) => !cursoId || a.cursoId === cursoId)
      .map((a) => a.aulaId),
  )
  const progresso = dados.progresso.filter((p) => aulaIds.has(p.aulaId))
  const ativos = new Set(
    progresso
      .filter(
        (p) =>
          universo.has(p.userId) &&
          (dentro(p.abertaEm, periodo) || dentro(p.gravadaEm, periodo)),
      )
      .map((p) => p.userId),
  )
  if (!cursoId) {
    for (const s of dados.sessoes)
      if (universo.has(s.userId)) ativos.add(s.userId)
  }

  return {
    alunosAtivos: ativos.size,
    novos,
    nuncaAcessaram: [...universo].filter((id) => !dados.acessos.has(id)).length,
    aulasConcluidas: progresso.filter((p) => dentro(p.concluidaEm, periodo))
      .length,
    comentarios,
    avaliacoes: dados.avaliacoes.filter((a) => aulaIds.has(a.aulaId)).length,
  }
}

/** Panorama da área no período, no total e curso a curso (ou só o curso escolhido). */
export async function panorama(
  db: Banco,
  filtro: FiltroDoRelatorio,
  ganchos: GanchosDoPanorama = {},
): Promise<Panorama> {
  const cursoId = filtro.cursoId || null
  // Os comentários vêm de um gancho (outro módulo): junto com a leitura dos dados, não depois dela.
  const [dados, comentariosPorCurso] = await Promise.all([
    lerDadosDoPanorama(db, filtro.periodo),
    ganchos.contarComentariosPorCurso?.(db, filtro.periodo),
  ])
  const cursos = dados.cursos.filter((c) => !cursoId || c.id === cursoId)
  if (cursoId && cursos.length === 0) {
    throw new ErroDeRelatorio('Curso não encontrado.')
  }
  // Sem o gancho por curso, cai no gancho antigo (uma chamada por curso e uma para o total).
  const comentarios = async (curso: string | null) =>
    comentariosPorCurso
      ? curso
        ? (comentariosPorCurso.get(curso) ?? 0)
        : [...comentariosPorCurso.values()].reduce((soma, n) => soma + n, 0)
      : ((await ganchos.contarComentarios?.({
          db,
          periodo: filtro.periodo,
          cursoId: curso,
        })) ?? 0)
  const porCurso: PanoramaDoCurso[] = []
  for (const c of cursos) {
    porCurso.push({
      cursoId: c.id,
      cursoNome: c.nome,
      ...metricasDoPanorama(
        dados,
        filtro.periodo,
        c.id,
        await comentarios(c.id),
      ),
    })
  }
  return {
    periodo: filtro.periodo,
    geral: metricasDoPanorama(
      dados,
      filtro.periodo,
      cursoId,
      await comentarios(cursoId),
    ),
    porCurso,
  }
}

// ---------- Progresso dos alunos de um curso ----------

export type FaixaDeProgresso =
  | '0'
  | '1-25'
  | '26-50'
  | '51-75'
  | '76-99'
  | '100'

export const FAIXAS_DE_PROGRESSO: {
  faixa: FaixaDeProgresso
  rotulo: string
}[] = [
  { faixa: '0', rotulo: 'Não começou' },
  { faixa: '1-25', rotulo: '1% a 25%' },
  { faixa: '26-50', rotulo: '26% a 50%' },
  { faixa: '51-75', rotulo: '51% a 75%' },
  { faixa: '76-99', rotulo: '76% a 99%' },
  { faixa: '100', rotulo: 'Concluiu' },
]

export function faixaDoPercentual(percentual: number): FaixaDeProgresso {
  if (percentual <= 0) return '0'
  if (percentual <= 25) return '1-25'
  if (percentual <= 50) return '26-50'
  if (percentual <= 75) return '51-75'
  if (percentual < 100) return '76-99'
  return '100'
}

export interface GanchosDoProgresso {
  /** Pontos de cada aluno (#54); sem o gancho, a coluna fica vazia (nulo). */
  pontosDosAlunos?: (
    db: Banco,
    userIds: string[],
    cursoId: string,
  ) => Promise<Map<string, number>>
  /**
   * Pontos de todos os alunos NAQUELE curso (aluno -> total), sem precisar da lista de alunos: sai junto
   * com as outras leituras, em vez de esperar por elas. Vale mais que `pontosDosAlunos`.
   */
  pontosDoCurso?: (db: Banco, cursoId: string) => Promise<Map<string, number>>
}

export interface FiltroDoProgresso {
  cursoId: string
  /** Só quem não acessa há pelo menos tantos dias (ou nunca acessou). */
  sumiuHaDias?: number | null
  faixa?: FaixaDeProgresso | null
}

export interface AlunoNoProgresso {
  userId: string
  nome: string
  email: string
  aulasConcluidas: number
  totalDeAulas: number
  /** 0 a 100, arredondado para baixo: só chega a 100 com tudo concluído. */
  percentual: number
  faixa: FaixaDeProgresso
  ultimoAcessoEm: Date | null
  /** Segundos de vídeo tocando nas aulas do curso. */
  tempoDeVideo: number
  pontos: number | null
}

export interface ProgressoDosAlunos {
  cursoNome: string
  totalDeAulas: number
  /** Quantos alunos em cada faixa, antes dos filtros de faixa e de sumiço. */
  faixas: { faixa: FaixaDeProgresso; rotulo: string; total: number }[]
  alunos: AlunoNoProgresso[]
}

/** Alunos com matrícula ativa no curso: quem está parado aparece primeiro. */
export async function progressoDosAlunos(
  db: Banco,
  agora: Relogio,
  filtro: FiltroDoProgresso,
  ganchos: GanchosDoProgresso = {},
): Promise<ProgressoDosAlunos> {
  const conexao = comoLibsql(db)
  const hoje = agora()
  // Curso, aulas, matrículas, progresso e últimos acessos saem numa ida só (nenhum depende de outro:
  // o progresso pede "as aulas deste curso" por subconsulta), e os pontos vão em paralelo.
  const aulasDoCurso = conexao
    .select({ id: aula.id })
    .from(aula)
    .innerJoin(modulo, eq(modulo.id, aula.moduloId))
    .where(
      and(
        eq(modulo.cursoId, filtro.cursoId),
        isNull(aula.excluidoEm),
        isNull(modulo.excluidoEm),
      ),
    )
  const acessosDasFontes = consultasDeAcessos(conexao)
  const [
    [[cursoEncontrado], aulasAtivasDoCurso, matriculas, progresso, ...fontes],
    pontosDoCurso,
  ] = await Promise.all([
    conexao.batch([
      conexao
        .select({ nome: curso.nome })
        .from(curso)
        .where(and(eq(curso.id, filtro.cursoId), isNull(curso.excluidoEm))),
      consultaDeAulasAtivas(db, filtro.cursoId),
      conexao
        .select({
          userId: user.id,
          nome: user.name,
          email: user.email,
          situacao: matricula.situacao,
          expiraEm: matricula.expiraEm,
        })
        .from(matricula)
        .innerJoin(turma, eq(turma.id, matricula.turmaId))
        .innerJoin(user, eq(user.id, matricula.userId))
        .where(eq(turma.cursoId, filtro.cursoId)),
      conexao
        .select()
        .from(progressoDaAula)
        .where(inArray(progressoDaAula.aulaId, aulasDoCurso)),
      acessosDasFontes.sessoes,
      acessosDasFontes.aulasAbertas,
      acessosDasFontes.termos,
    ]),
    ganchos.pontosDoCurso?.(db, filtro.cursoId),
  ])
  if (!cursoEncontrado) throw new ErroDeRelatorio('Curso não encontrado.')

  const aulaIds = aulasAtivasDoCurso.map((a) => a.aulaId)
  const alunos = new Map<string, { nome: string; email: string }>()
  for (const m of matriculas) {
    if (situacaoDaMatricula(m, hoje) === 'ativa') {
      alunos.set(m.userId, { nome: m.nome, email: m.email })
    }
  }
  const ids = [...alunos.keys()]

  const doAluno = new Map<string, typeof progresso>()
  for (const p of progresso) {
    doAluno.set(p.userId, [...(doAluno.get(p.userId) ?? []), p])
  }
  const acessos = juntarAcessos(fontes as FontesDeAcesso)
  // Só o gancho antigo precisa da lista de alunos (então espera por ela).
  const pontos =
    pontosDoCurso ??
    (await ganchos.pontosDosAlunos?.(db, ids, filtro.cursoId)) ??
    null

  const todos: AlunoNoProgresso[] = ids.map((userId) => {
    const aluno = alunos.get(userId) as { nome: string; email: string }
    const dele = doAluno.get(userId) ?? []
    const concluidas = dele.filter((p) => p.concluidaEm !== null).length
    const total = aulaIds.length
    const percentual = total === 0 ? 0 : Math.floor((concluidas * 100) / total)
    return {
      userId,
      nome: aluno.nome,
      email: aluno.email,
      aulasConcluidas: concluidas,
      totalDeAulas: total,
      percentual,
      faixa: faixaDoPercentual(percentual),
      ultimoAcessoEm: acessos.get(userId) ?? null,
      tempoDeVideo: dele.reduce((soma, p) => soma + p.tempoTocando, 0),
      pontos: pontos ? (pontos.get(userId) ?? 0) : null,
    }
  })

  const faixas = FAIXAS_DE_PROGRESSO.map((f) => ({
    ...f,
    total: todos.filter((a) => a.faixa === f.faixa).length,
  }))

  const limite =
    filtro.sumiuHaDias && filtro.sumiuHaDias > 0
      ? hoje.getTime() - filtro.sumiuHaDias * DIA_MS
      : null
  const filtrados = todos
    .filter((a) => !filtro.faixa || a.faixa === filtro.faixa)
    .filter(
      (a) =>
        limite === null ||
        a.ultimoAcessoEm === null ||
        a.ultimoAcessoEm.getTime() <= limite,
    )
    .sort(
      (a, b) =>
        (a.ultimoAcessoEm?.getTime() ?? -1) -
          (b.ultimoAcessoEm?.getTime() ?? -1) ||
        a.nome.localeCompare(b.nome, 'pt-BR'),
    )

  return {
    cursoNome: cursoEncontrado.nome,
    totalDeAulas: aulaIds.length,
    faixas,
    alunos: filtrados,
  }
}
