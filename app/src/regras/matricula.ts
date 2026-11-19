// Turmas e matrículas. A matrícula é o vínculo do aluno com uma turma, com situação Ativa, Expirada
// ou Inativa, uma expiração opcional (vazio = vitalícia) e as origens que a sustentam (matrícula
// manual ou venda paga). Este módulo traz o que a equipe faz à mão: matrícula manual em lote,
// prorrogar, encerrar, reativar e trocar o e-mail. `aplicarVendaPaga` e `aplicarEstorno` são o lado
// das vendas da Voomp (#43): usam as mesmas tabelas, com `origem_da_matricula.tipo = 'venda'`.

import {
  and,
  asc,
  count,
  desc,
  eq,
  gt,
  inArray,
  isNull,
  like,
  lte,
  or,
  sql,
} from 'drizzle-orm'
import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import type * as schema from '#/db/schema'
import {
  comunidadeTurma,
  curso,
  ligacaoDeVenda,
  matricula,
  origemDaMatricula,
  regraDeLiberacao,
  session,
  turma,
  user,
} from '#/db/schema'
import { emLotes, emPedacos } from '#/regras/lotes'
import { deslocamento, montarPagina, POR_PAGINA } from '#/regras/paginacao'
import { prepararRegistro } from '#/regras/registro-de-acoes'
import { type Banco, comoLibsql, type Relogio } from '#/regras/tipos'

export class ErroDeMatricula extends Error {
  constructor(mensagem: string) {
    super(mensagem)
    this.name = 'ErroDeMatricula'
  }
}

// D1 e libsql têm a mesma API de consulta; ver o comentário igual em `conteudo.ts`.
const novoId = () => crypto.randomUUID()
const DIA = 86_400_000
const LIMITE_DO_LOTE = 200
// ---------- Situação ----------

export type SituacaoDaMatricula = 'ativa' | 'expirada' | 'inativa'

// A situação de verdade: uma matrícula ativa cuja data já passou está expirada, mesmo que a rotina
// diária ainda não a tenha marcado.
export function situacaoDaMatricula(
  m: { situacao: SituacaoDaMatricula; expiraEm: Date | null },
  agora: Date,
): SituacaoDaMatricula {
  if (m.situacao === 'inativa') return 'inativa'
  if (m.situacao === 'expirada') return 'expirada'
  if (m.expiraEm && m.expiraEm.getTime() <= agora.getTime()) return 'expirada'
  return 'ativa'
}

// O mesmo critério de `situacaoDaMatricula`, em SQL: matrícula vigente é a ativa sem data ou com a
// data no futuro. Use este predicado em vez de reescrever a regra à mão.
export function matriculaVigenteSql(agora: Date) {
  return and(
    eq(matricula.situacao, 'ativa'),
    or(isNull(matricula.expiraEm), gt(matricula.expiraEm, agora)),
  )
}

// Marca como expiradas as matrículas ativas que passaram da data (rotina diária).
export async function expirarMatriculas(
  banco: Banco,
  agora: Relogio,
): Promise<number> {
  const db = comoLibsql(banco)
  const hoje = agora()
  const vencidas = await db
    .select({ id: matricula.id })
    .from(matricula)
    .where(and(eq(matricula.situacao, 'ativa'), lte(matricula.expiraEm, hoje)))
  for (const pedaco of emPedacos(vencidas)) {
    await db
      .update(matricula)
      .set({ situacao: 'expirada' })
      .where(
        inArray(
          matricula.id,
          pedaco.map((m) => m.id),
        ),
      )
  }
  return vencidas.length
}

// ---------- Turmas ----------

function prazoValido(prazoEmDias: number | null | undefined): number | null {
  if (prazoEmDias === null || prazoEmDias === undefined) return null
  if (
    !Number.isInteger(prazoEmDias) ||
    prazoEmDias < 1 ||
    prazoEmDias > 36500
  ) {
    throw new ErroDeMatricula(
      'O prazo de acesso é um número de dias, de 1 em diante.',
    )
  }
  return prazoEmDias
}

function nomeDaTurma(valor: string): string {
  const nome = valor.trim()
  if (!nome) throw new ErroDeMatricula('Informe o nome da turma.')
  if (nome.length > 200) {
    throw new ErroDeMatricula(
      'O nome da turma pode ter no máximo 200 caracteres.',
    )
  }
  return nome
}

export async function criarTurma(
  banco: Banco,
  entrada: { cursoId: string; nome: string; prazoEmDias?: number | null },
): Promise<string> {
  const db = comoLibsql(banco)
  const nome = nomeDaTurma(entrada.nome)
  const prazoEmDias = prazoValido(entrada.prazoEmDias)
  const [achado] = await db
    .select({ id: curso.id })
    .from(curso)
    .where(and(eq(curso.id, entrada.cursoId), isNull(curso.excluidoEm)))
  if (!achado) throw new ErroDeMatricula('Curso não encontrado.')
  const id = novoId()
  await db
    .insert(turma)
    .values({ id, cursoId: entrada.cursoId, nome, prazoEmDias })
  return id
}

// O prazo novo vale só para as matrículas que vierem depois; as que já existem não mudam.
export async function editarTurma(
  banco: Banco,
  id: string,
  entrada: { nome: string; prazoEmDias?: number | null },
): Promise<void> {
  const db = comoLibsql(banco)
  const nome = nomeDaTurma(entrada.nome)
  const prazoEmDias = prazoValido(entrada.prazoEmDias)
  const [achada] = await db
    .select({ id: turma.id })
    .from(turma)
    .where(eq(turma.id, id))
  if (!achada) throw new ErroDeMatricula('Turma não encontrada.')
  await db.update(turma).set({ nome, prazoEmDias }).where(eq(turma.id, id))
}

export function mensagemDeEdicaoComAlunos(alunos: number): string {
  return `Esta edição tem ${alunos} ${alunos === 1 ? 'aluno' : 'alunos'}. Mova ou cancele as matrículas antes de excluir.`
}

// Só exclui edição sem nenhuma matrícula (ativa ou não). Apaga ligações de venda, regras de liberação e
// vínculos com comunidades junto, tudo em um batch com o registro da ação.
export async function excluirTurma(
  banco: Banco,
  agora: Relogio,
  id: string,
  autorId: string | null,
): Promise<void> {
  const db = comoLibsql(banco)
  const [[achada], [{ alunos }]] = await db.batch([
    db
      .select({ id: turma.id, nome: turma.nome, cursoId: turma.cursoId })
      .from(turma)
      .where(eq(turma.id, id)),
    db
      .select({ alunos: count() })
      .from(matricula)
      .where(eq(matricula.turmaId, id)),
  ])
  if (!achada) throw new ErroDeMatricula('Turma não encontrada.')
  if (alunos > 0) throw new ErroDeMatricula(mensagemDeEdicaoComAlunos(alunos))
  await db.batch([
    db.delete(ligacaoDeVenda).where(eq(ligacaoDeVenda.turmaId, id)),
    db.delete(regraDeLiberacao).where(eq(regraDeLiberacao.turmaId, id)),
    db.delete(comunidadeTurma).where(eq(comunidadeTurma.turmaId, id)),
    db.delete(turma).where(eq(turma.id, id)),
    prepararRegistro(banco, agora, {
      autorId,
      acao: 'edicao-excluida',
      detalhe: { turmaId: id, nome: achada.nome, cursoId: achada.cursoId },
    }),
  ])
}

export async function listarTurmas(banco: Banco) {
  const db = comoLibsql(banco)
  const linhas = await db
    .select({
      id: turma.id,
      cursoId: turma.cursoId,
      cursoNome: curso.nome,
      nome: turma.nome,
      prazoEmDias: turma.prazoEmDias,
    })
    .from(turma)
    .innerJoin(curso, eq(curso.id, turma.cursoId))
    .where(isNull(curso.excluidoEm))
    .orderBy(asc(curso.nome), asc(turma.criadoEm))
  return linhas
}

async function obterTurma(db: LibSQLDatabase<typeof schema>, id: string) {
  const [achada] = await db.select().from(turma).where(eq(turma.id, id))
  if (!achada) throw new ErroDeMatricula('Turma não encontrada.')
  return achada
}

function expiracaoNova(
  agora: Date,
  expiracao: Date | null | undefined,
  prazoEmDias: number | null,
): Date | null {
  if (expiracao) {
    if (expiracao.getTime() <= agora.getTime()) {
      throw new ErroDeMatricula('A expiração precisa ser uma data no futuro.')
    }
    return expiracao
  }
  return prazoEmDias ? new Date(agora.getTime() + prazoEmDias * DIA) : null
}

// ---------- Matrícula manual ----------

export interface PessoaDoLote {
  email: string
  nome?: string
}

const EMAIL = /^[^\s@<>,;"']+@[^\s@<>,;"']+\.[^\s@<>,;"']+$/

export function emailValido(email: string): boolean {
  return email.length <= 254 && EMAIL.test(email)
}

// Lê o texto colado pela equipe: um aluno por linha, no formato `e-mail`, `e-mail, Nome`,
// `e-mail;Nome` ou `Nome <e-mail>`. A linha sem e-mail vira uma pessoa inválida.
export function interpretarLote(texto: string): PessoaDoLote[] {
  const pessoas: PessoaDoLote[] = []
  for (const linha of texto.split(/\r?\n/)) {
    const limpa = linha.trim()
    if (!limpa) continue
    const partes = limpa.split(/[\s,;<>]+/).filter(Boolean)
    const email = partes.find((p) => p.includes('@'))
    if (!email) {
      pessoas.push({ email: limpa })
      continue
    }
    const nome = limpa
      .replace(email, ' ')
      .replace(/[<>,;]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    pessoas.push(nome ? { email, nome } : { email })
  }
  return pessoas
}

export interface ResumoDaMatriculaManual {
  /** Matrículas novas (a conta pode já existir ou ter sido criada agora). */
  criados: string[]
  /** Dos criados, os e-mails que não tinham conta e ganharam uma. */
  contasNovas: string[]
  jaMatriculados: string[]
  reativados: string[]
  invalidos: string[]
}

export interface EventoDeLiberacao {
  userId: string
  email: string
  turmaId: string
  cursoId: string
  contaNova: boolean
}

export interface EntradaDaMatriculaManual {
  pessoas: PessoaDoLote[]
  turmaId: string
  /** Vazio: vale o prazo da turma (ou vitalícia, se a turma não tem prazo). */
  expiracao?: Date | null
  autorId: string
  observacao?: string
  // PONTO DE EXTENSÃO da fatia #45: o e-mail "Curso liberado" sai por aqui, uma vez por matrícula
  // nova ou reativada, depois de gravar. Falha aqui nunca desfaz a matrícula.
  aoLiberarCurso?: (evento: EventoDeLiberacao) => Promise<void>
}

export async function matricularManual(
  banco: Banco,
  agora: Relogio,
  entrada: EntradaDaMatriculaManual,
): Promise<ResumoDaMatriculaManual> {
  const db = comoLibsql(banco)
  if (entrada.pessoas.length > LIMITE_DO_LOTE) {
    throw new ErroDeMatricula(
      `Matricule no máximo ${LIMITE_DO_LOTE} e-mails por vez.`,
    )
  }
  const turmaAlvo = await obterTurma(db, entrada.turmaId)
  const hoje = agora()
  const expiraEm = expiracaoNova(hoje, entrada.expiracao, turmaAlvo.prazoEmDias)

  const resumo: ResumoDaMatriculaManual = {
    criados: [],
    contasNovas: [],
    jaMatriculados: [],
    reativados: [],
    invalidos: [],
  }
  const validas = new Map<string, string | undefined>()
  for (const p of entrada.pessoas) {
    const email = p.email.trim().toLowerCase()
    if (!emailValido(email)) resumo.invalidos.push(p.email.trim())
    else if (!validas.has(email))
      validas.set(email, p.nome?.trim() || undefined)
  }
  const emails = [...validas.keys()]

  const contas = new Map<string, string>()
  for (const pedaco of emPedacos(emails)) {
    const linhas = await db
      .select({ id: user.id, email: user.email })
      .from(user)
      .where(inArray(user.email, pedaco))
    for (const l of linhas) contas.set(l.email, l.id)
  }
  const existentes = new Map<string, typeof matricula.$inferSelect>()
  const idsDeContas = [...contas.values()]
  for (const pedaco of emPedacos(idsDeContas)) {
    const linhas = await db
      .select()
      .from(matricula)
      .where(
        and(
          inArray(matricula.userId, pedaco),
          eq(matricula.turmaId, turmaAlvo.id),
        ),
      )
    for (const l of linhas) existentes.set(l.userId, l)
  }

  const comandos = []
  const liberados: EventoDeLiberacao[] = []
  const origem = (matriculaId: string) =>
    db.insert(origemDaMatricula).values({
      id: novoId(),
      matriculaId,
      tipo: 'manual',
      autorId: entrada.autorId,
      observacao: entrada.observacao?.trim() || null,
      criadoEm: hoje,
    })

  for (const [email, nome] of validas) {
    const contaId = contas.get(email)
    const atual = contaId ? existentes.get(contaId) : undefined
    if (atual) {
      if (situacaoDaMatricula(atual, hoje) === 'ativa') {
        resumo.jaMatriculados.push(email)
        continue
      }
      comandos.push(
        db
          .update(matricula)
          .set({ situacao: 'ativa', iniciaEm: hoje, expiraEm })
          .where(eq(matricula.id, atual.id)),
        origem(atual.id),
      )
      resumo.reativados.push(email)
      liberados.push({
        userId: atual.userId,
        email,
        turmaId: turmaAlvo.id,
        cursoId: turmaAlvo.cursoId,
        contaNova: false,
      })
      continue
    }
    // Conta nova só com o e-mail; o nome (se faltar) o aluno informa no primeiro acesso.
    const userId = contaId ?? novoId()
    if (!contaId) {
      comandos.push(
        db.insert(user).values({ id: userId, name: nome ?? '', email }),
      )
      resumo.contasNovas.push(email)
    }
    const matriculaId = novoId()
    comandos.push(
      db.insert(matricula).values({
        id: matriculaId,
        userId,
        turmaId: turmaAlvo.id,
        situacao: 'ativa',
        iniciaEm: hoje,
        expiraEm,
      }),
      origem(matriculaId),
    )
    resumo.criados.push(email)
    liberados.push({
      userId,
      email,
      turmaId: turmaAlvo.id,
      cursoId: turmaAlvo.cursoId,
      contaNova: !contaId,
    })
  }

  comandos.push(
    prepararRegistro(banco, agora, {
      autorId: entrada.autorId,
      acao: 'matricula-manual',
      detalhe: {
        turmaId: turmaAlvo.id,
        expiraEm: expiraEm?.toISOString() ?? null,
        observacao: entrada.observacao?.trim() || null,
        ...resumo,
      },
    }),
  )
  await db.batch(comandos as [(typeof comandos)[number], ...typeof comandos])

  if (entrada.aoLiberarCurso) {
    for (const evento of liberados) {
      try {
        await entrada.aoLiberarCurso(evento)
      } catch (erro) {
        console.error('[matricula] aviso de curso liberado falhou', erro)
      }
    }
  }
  return resumo
}

// ---------- Vendas da Voomp ----------

export interface TurmaDaVenda {
  turmaId: string
  /** Prazo da ligação Produto da Voomp -> turma; nulo/ausente: vale o prazo da turma. */
  prazoEmDias?: number | null
}

export type ResultadoDaVenda = 'criada' | 'reativada' | 'estendida' | 'repetida'

export interface EntradaDaVendaPaga {
  /** Id da venda na Voomp: é o que sustenta a matrícula e o que o estorno tira. */
  vendaId: string
  email: string
  /** Nome que a Voomp mandou; só vale para a conta nova. */
  nome?: string | null
  turmas: TurmaDaVenda[]
  // PONTO DE EXTENSÃO da fatia #45 (e-mail "Curso liberado"): UMA vez por venda, depois de gravar, com um evento
  // por curso novo ou reativado (duas turmas do mesmo curso contam uma). Sem novidade, não chama. A falha
  // daqui nunca desfaz a matrícula.
  aoLiberarCursos?: (eventos: EventoDeLiberacao[]) => Promise<void>
}

export interface ResumoDaVendaPaga {
  userId: string
  contaNova: boolean
  resultados: {
    turmaId: string
    matriculaId: string
    resultado: ResultadoDaVenda
  }[]
}

// Entre duas expirações vale a mais distante; vitalícia (nulo) ganha de qualquer data.
function expiracaoMaisDistante(a: Date | null, b: Date | null): Date | null {
  if (a === null || b === null) return null
  return a.getTime() >= b.getTime() ? a : b
}

// Venda paga: cria a matrícula, reativa a expirada ou inativa, ou estende a ativa (fica a expiração
// mais distante). A conta é achada só pelo e-mail e criada se não existir. O progresso nunca é
// apagado. Repetir a mesma venda não faz nada: a venda já consta nas origens da matrícula.
export async function aplicarVendaPaga(
  banco: Banco,
  agora: Relogio,
  entrada: EntradaDaVendaPaga,
): Promise<ResumoDaVendaPaga> {
  const db = comoLibsql(banco)
  const hoje = agora()
  const email = entrada.email.trim().toLowerCase()
  if (!emailValido(email)) {
    throw new ErroDeMatricula('A venda não traz um e-mail válido.')
  }
  if (!entrada.vendaId.trim()) {
    throw new ErroDeMatricula('A venda não traz o id.')
  }
  if (entrada.turmas.length === 0) {
    throw new ErroDeMatricula('A venda não tem turma para matricular.')
  }

  const turmas = new Map<string, typeof turma.$inferSelect>()
  for (const t of entrada.turmas) {
    if (!turmas.has(t.turmaId))
      turmas.set(t.turmaId, await obterTurma(db, t.turmaId))
  }

  const [conta] = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.email, email))
  const userId = conta?.id ?? novoId()
  const existentes = conta
    ? await db.select().from(matricula).where(eq(matricula.userId, userId))
    : []

  const comandos = []
  if (!conta) {
    comandos.push(
      db
        .insert(user)
        .values({ id: userId, name: entrada.nome?.trim() ?? '', email }),
    )
  }
  const resultados: ResumoDaVendaPaga['resultados'] = []
  const liberados: EventoDeLiberacao[] = []
  const feitas = new Set<string>()
  for (const item of entrada.turmas) {
    if (feitas.has(item.turmaId)) continue
    feitas.add(item.turmaId)
    const alvo = turmas.get(item.turmaId) as typeof turma.$inferSelect
    const prazo = prazoValido(item.prazoEmDias) ?? alvo.prazoEmDias
    const expiraEm = prazo ? new Date(hoje.getTime() + prazo * DIA) : null
    const atual = existentes.find((m) => m.turmaId === alvo.id)
    const origem = (matriculaId: string) =>
      db.insert(origemDaMatricula).values({
        id: novoId(),
        matriculaId,
        tipo: 'venda',
        vendaId: entrada.vendaId,
        criadoEm: hoje,
      })
    const evento = (): EventoDeLiberacao => ({
      userId,
      email,
      turmaId: alvo.id,
      cursoId: alvo.cursoId,
      contaNova: !conta,
    })

    if (!atual) {
      const matriculaId = novoId()
      comandos.push(
        db.insert(matricula).values({
          id: matriculaId,
          userId,
          turmaId: alvo.id,
          situacao: 'ativa',
          iniciaEm: hoje,
          expiraEm,
        }),
        origem(matriculaId),
      )
      resultados.push({ turmaId: alvo.id, matriculaId, resultado: 'criada' })
      liberados.push(evento())
      continue
    }

    const [jaTem] = await db
      .select({ id: origemDaMatricula.id })
      .from(origemDaMatricula)
      .where(
        and(
          eq(origemDaMatricula.matriculaId, atual.id),
          eq(origemDaMatricula.tipo, 'venda'),
          eq(origemDaMatricula.vendaId, entrada.vendaId),
        ),
      )
    if (jaTem) {
      resultados.push({
        turmaId: alvo.id,
        matriculaId: atual.id,
        resultado: 'repetida',
      })
      continue
    }
    if (situacaoDaMatricula(atual, hoje) === 'ativa') {
      comandos.push(
        db
          .update(matricula)
          .set({ expiraEm: expiracaoMaisDistante(atual.expiraEm, expiraEm) })
          .where(eq(matricula.id, atual.id)),
        origem(atual.id),
      )
      resultados.push({
        turmaId: alvo.id,
        matriculaId: atual.id,
        resultado: 'estendida',
      })
      continue
    }
    comandos.push(
      db
        .update(matricula)
        .set({ situacao: 'ativa', iniciaEm: hoje, expiraEm })
        .where(eq(matricula.id, atual.id)),
      origem(atual.id),
    )
    resultados.push({
      turmaId: alvo.id,
      matriculaId: atual.id,
      resultado: 'reativada',
    })
    liberados.push(evento())
  }

  if (comandos.length > 0) {
    await db.batch(comandos as [(typeof comandos)[number], ...typeof comandos])
  }
  if (entrada.aoLiberarCursos && liberados.length > 0) {
    const porCurso = new Map<string, EventoDeLiberacao>()
    for (const evento of liberados) {
      if (!porCurso.has(evento.cursoId)) porCurso.set(evento.cursoId, evento)
    }
    try {
      await entrada.aoLiberarCursos([...porCurso.values()])
    } catch (erro) {
      console.error('[matricula] aviso de cursos liberados falhou', erro)
    }
  }
  return { userId, contaNova: !conta, resultados }
}

export interface ResumoDoEstorno {
  /** Matrículas que ficaram inativas: a venda era a única origem. */
  inativadas: string[]
  /** Matrículas que continuam ativas porque outra venda ou uma matrícula manual as sustenta. */
  mantidas: string[]
}

// Estorno ou chargeback: tira a venda das origens e só inativa a matrícula se nada mais a sustentar.
// Venda que não sustentava nada (ou já estornada) não faz nada.
export async function aplicarEstorno(
  banco: Banco,
  entrada: { vendaId: string },
): Promise<ResumoDoEstorno> {
  const db = comoLibsql(banco)
  const doEstorno = await db
    .select()
    .from(origemDaMatricula)
    .where(
      and(
        eq(origemDaMatricula.tipo, 'venda'),
        eq(origemDaMatricula.vendaId, entrada.vendaId),
      ),
    )
  if (doEstorno.length === 0) return { inativadas: [], mantidas: [] }

  const matriculaIds = [...new Set(doEstorno.map((o) => o.matriculaId))]
  const tiradas = new Set(doEstorno.map((o) => o.id))
  const restantes = await emLotes(matriculaIds, (ids) =>
    db
      .select({
        id: origemDaMatricula.id,
        matriculaId: origemDaMatricula.matriculaId,
      })
      .from(origemDaMatricula)
      .where(inArray(origemDaMatricula.matriculaId, ids)),
  )
  const sustentadas = new Set(
    restantes.filter((o) => !tiradas.has(o.id)).map((o) => o.matriculaId),
  )
  const inativadas = matriculaIds.filter((id) => !sustentadas.has(id))
  const mantidas = matriculaIds.filter((id) => sustentadas.has(id))

  const comandos = []
  for (const ids of emPedacos([...tiradas])) {
    comandos.push(
      db.delete(origemDaMatricula).where(inArray(origemDaMatricula.id, ids)),
    )
  }
  for (const ids of emPedacos(inativadas)) {
    comandos.push(
      db
        .update(matricula)
        .set({ situacao: 'inativa' })
        .where(inArray(matricula.id, ids)),
    )
  }
  await db.batch(comandos as [(typeof comandos)[number], ...typeof comandos])
  return { inativadas, mantidas }
}

// ---------- Prorrogar, encerrar, reativar ----------

async function obterMatricula(db: LibSQLDatabase<typeof schema>, id: string) {
  const [achada] = await db.select().from(matricula).where(eq(matricula.id, id))
  if (!achada) throw new ErroDeMatricula('Matrícula não encontrada.')
  return achada
}

// Move a expiração para depois da atual (ou `null` = vitalícia). Também ressuscita a expirada.
export async function prorrogar(
  banco: Banco,
  agora: Relogio,
  entrada: { matriculaId: string; ate: Date | null },
): Promise<void> {
  const db = comoLibsql(banco)
  const hoje = agora()
  const atual = await obterMatricula(db, entrada.matriculaId)
  if (atual.situacao === 'inativa') {
    throw new ErroDeMatricula(
      'A matrícula está inativa: reative em vez de prorrogar.',
    )
  }
  if (entrada.ate) {
    if (entrada.ate.getTime() <= hoje.getTime()) {
      throw new ErroDeMatricula(
        'A nova expiração precisa ser uma data no futuro.',
      )
    }
    if (atual.expiraEm && entrada.ate.getTime() <= atual.expiraEm.getTime()) {
      throw new ErroDeMatricula('A nova expiração precisa ser depois da atual.')
    }
  }
  await db
    .update(matricula)
    .set({ situacao: 'ativa', expiraEm: entrada.ate })
    .where(eq(matricula.id, atual.id))
}

export async function encerrar(
  banco: Banco,
  entrada: { matriculaId: string },
): Promise<void> {
  const db = comoLibsql(banco)
  const atual = await obterMatricula(db, entrada.matriculaId)
  if (atual.situacao === 'inativa') {
    throw new ErroDeMatricula('A matrícula já está inativa.')
  }
  await db
    .update(matricula)
    .set({ situacao: 'inativa' })
    .where(eq(matricula.id, atual.id))
}

// Reativa uma matrícula expirada ou inativa: volta a contar do zero (dias após a compra) e ganha
// uma origem manual com o autor.
export async function reativar(
  banco: Banco,
  agora: Relogio,
  entrada: {
    matriculaId: string
    autorId: string
    expiracao?: Date | null
    observacao?: string
  },
): Promise<void> {
  const db = comoLibsql(banco)
  const hoje = agora()
  const atual = await obterMatricula(db, entrada.matriculaId)
  if (situacaoDaMatricula(atual, hoje) === 'ativa') {
    throw new ErroDeMatricula('A matrícula já está ativa.')
  }
  const turmaDela = await obterTurma(db, atual.turmaId)
  const expiraEm = expiracaoNova(hoje, entrada.expiracao, turmaDela.prazoEmDias)
  await db.batch([
    db
      .update(matricula)
      .set({ situacao: 'ativa', iniciaEm: hoje, expiraEm })
      .where(eq(matricula.id, atual.id)),
    db.insert(origemDaMatricula).values({
      id: novoId(),
      matriculaId: atual.id,
      tipo: 'manual',
      autorId: entrada.autorId,
      observacao: entrada.observacao?.trim() || null,
      criadoEm: hoje,
    }),
  ])
}

// ---------- Consultas ----------

// Cursos em que o aluno tem matrícula ativa (abrem) e em que só tem matrícula expirada (cadeado
// "acesso expirado"). Com duas turmas do mesmo curso vale a mais generosa: ativa ganha de expirada.
export async function cursosDoAluno(
  banco: Banco,
  agora: Relogio,
  userId: string,
): Promise<{ ativos: string[]; expirados: string[] }> {
  const db = comoLibsql(banco)
  const hoje = agora()
  const linhas = await db
    .select({
      cursoId: turma.cursoId,
      situacao: matricula.situacao,
      expiraEm: matricula.expiraEm,
    })
    .from(matricula)
    .innerJoin(turma, eq(turma.id, matricula.turmaId))
    .innerJoin(curso, eq(curso.id, turma.cursoId))
    .where(and(eq(matricula.userId, userId), isNull(curso.excluidoEm)))
  const ativos = new Set<string>()
  const expirados = new Set<string>()
  for (const l of linhas) {
    const situacao = situacaoDaMatricula(l, hoje)
    if (situacao === 'ativa') ativos.add(l.cursoId)
    else if (situacao === 'expirada') expirados.add(l.cursoId)
  }
  for (const id of ativos) expirados.delete(id)
  return { ativos: [...ativos], expirados: [...expirados] }
}

const PESO_DA_SITUACAO: Record<SituacaoDaMatricula, number> = {
  ativa: 0,
  expirada: 1,
  inativa: 2,
}

/**
 * Um curso por linha, com a melhor situação entre as turmas do aluno (ativa antes de expirada antes
 * de inativa), na ordem do nome do curso. É o que a lista de Alunos mostra ao lado de cada nome.
 */
export function resumoDasMatriculas(
  linhas: {
    cursoNome: string
    situacao: SituacaoDaMatricula
    expiraEm: Date | null
  }[],
  agora: Date,
): { cursoNome: string; situacao: SituacaoDaMatricula }[] {
  const porCurso = new Map<string, SituacaoDaMatricula>()
  for (const l of linhas) {
    const s = situacaoDaMatricula(l, agora)
    const atual = porCurso.get(l.cursoNome)
    if (!atual || PESO_DA_SITUACAO[s] < PESO_DA_SITUACAO[atual]) {
      porCurso.set(l.cursoNome, s)
    }
  }
  return [...porCurso]
    .map(([cursoNome, situacao]) => ({ cursoNome, situacao }))
    .sort((a, b) => a.cursoNome.localeCompare(b.cursoNome, 'pt-BR'))
}

export async function buscarAlunos(
  banco: Banco,
  termo = '',
  pagina = 1,
  agora: Relogio = () => new Date(),
) {
  const db = comoLibsql(banco)
  const t = termo.trim().replace(/[%_]/g, '')
  const filtro = t
    ? and(
        eq(user.perfil, 'aluno'),
        or(like(user.email, `%${t.toLowerCase()}%`), like(user.name, `%${t}%`)),
      )
    : eq(user.perfil, 'aluno')
  const daPagina = db
    .select({ id: user.id })
    .from(user)
    .where(filtro)
    .orderBy(desc(user.createdAt), asc(user.id))
    .limit(POR_PAGINA)
    .offset(deslocamento(pagina))
  // As matrículas dos alunos da página saem junto (subconsulta, sem esperar a lista): uma rodada só.
  const [itens, [{ total }], matriculas] = await Promise.all([
    db
      .select({ id: user.id, nome: user.name, email: user.email })
      .from(user)
      .where(filtro)
      .orderBy(desc(user.createdAt), asc(user.id))
      .limit(POR_PAGINA)
      .offset(deslocamento(pagina)),
    db.select({ total: count() }).from(user).where(filtro),
    db
      .select({
        userId: matricula.userId,
        cursoNome: curso.nome,
        situacao: matricula.situacao,
        expiraEm: matricula.expiraEm,
      })
      .from(matricula)
      .innerJoin(turma, eq(turma.id, matricula.turmaId))
      .innerJoin(curso, eq(curso.id, turma.cursoId))
      .where(inArray(matricula.userId, daPagina)),
  ])
  const hoje = agora()
  return montarPagina(
    itens.map((a) => ({
      ...a,
      matriculas: resumoDasMatriculas(
        matriculas.filter((m) => m.userId === a.id),
        hoje,
      ),
    })),
    total,
    pagina,
  )
}

export async function perfilDoAluno(
  banco: Banco,
  agora: Relogio,
  userId: string,
) {
  const db = comoLibsql(banco)
  const hoje = agora()
  // O aluno, as matrículas e as origens saem numa ida só (`batch`): as origens pedem "as matrículas
  // deste aluno" por subconsulta, em vez de esperar a lista de matrículas chegar.
  const [[aluno], linhas, origensBrutas] = await db.batch([
    db
      .select({
        id: user.id,
        nome: user.name,
        email: user.email,
        perfil: user.perfil,
        criadoEm: user.createdAt,
      })
      .from(user)
      .where(eq(user.id, userId)),
    db
      .select({
        id: matricula.id,
        // Apelidos: no `batch` do D1 duas colunas de mesmo nome (`id`, `nome`) se fundem (veja
        // `conferirColunas` em src/test/banco.ts).
        turmaId: sql<string>`${turma.id}`.as('turma_id'),
        turmaNome: sql<string>`${turma.nome}`.as('turma_nome'),
        cursoNome: sql<string>`${curso.nome}`.as('curso_nome'),
        situacao: matricula.situacao,
        iniciaEm: matricula.iniciaEm,
        expiraEm: matricula.expiraEm,
      })
      .from(matricula)
      .innerJoin(turma, eq(turma.id, matricula.turmaId))
      .innerJoin(curso, eq(curso.id, turma.cursoId))
      .where(eq(matricula.userId, userId))
      .orderBy(asc(curso.nome)),
    db
      .select({
        matriculaId: origemDaMatricula.matriculaId,
        tipo: origemDaMatricula.tipo,
        vendaId: origemDaMatricula.vendaId,
        autorNome: user.name,
        observacao: origemDaMatricula.observacao,
        criadoEm: origemDaMatricula.criadoEm,
      })
      .from(origemDaMatricula)
      .leftJoin(user, eq(user.id, origemDaMatricula.autorId))
      .where(
        inArray(
          origemDaMatricula.matriculaId,
          db
            .select({ id: matricula.id })
            .from(matricula)
            .where(eq(matricula.userId, userId)),
        ),
      ),
  ])
  if (!aluno) return null
  const origens = [...origensBrutas].sort(
    (a, b) => a.criadoEm.getTime() - b.criadoEm.getTime(),
  )
  return {
    aluno,
    matriculas: linhas.map((l) => ({
      ...l,
      situacao: situacaoDaMatricula(l, hoje),
      origens: origens.filter((o) => o.matriculaId === l.id),
    })),
  }
}

export type PerfilDoAluno = NonNullable<
  Awaited<ReturnType<typeof perfilDoAluno>>
>

// ---------- Trocar o e-mail ----------

// Troca o e-mail do aluno e encerra todas as sessões dele; a troca entra no registro de ações.
// Devolve os dois endereços e o nome (para o e-mail "Troca de e-mail" ir aos dois), ou `null` se o
// e-mail já era esse e nada mudou.
export async function trocarEmail(
  banco: Banco,
  agora: Relogio,
  entrada: { userId: string; novoEmail: string; autorId: string },
): Promise<{ antigo: string; novo: string; nome: string } | null> {
  const db = comoLibsql(banco)
  const novo = entrada.novoEmail.trim().toLowerCase()
  if (!emailValido(novo)) throw new ErroDeMatricula('Informe um e-mail válido.')
  const [aluno] = await db
    .select()
    .from(user)
    .where(eq(user.id, entrada.userId))
  if (!aluno) throw new ErroDeMatricula('Aluno não encontrado.')
  if (aluno.perfil !== 'aluno') {
    throw new ErroDeMatricula('Só é possível trocar o e-mail de um aluno.')
  }
  if (aluno.email === novo) return null
  const [outro] = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.email, novo))
  if (outro) throw new ErroDeMatricula('Já existe uma conta com esse e-mail.')
  await db.batch([
    db.update(user).set({ email: novo }).where(eq(user.id, aluno.id)),
    db.delete(session).where(eq(session.userId, aluno.id)),
    prepararRegistro(banco, agora, {
      autorId: entrada.autorId,
      acao: 'troca-de-email',
      detalhe: { alunoId: aluno.id, de: aluno.email, para: novo },
    }),
  ])
  return { antigo: aluno.email, novo, nome: aluno.name }
}
