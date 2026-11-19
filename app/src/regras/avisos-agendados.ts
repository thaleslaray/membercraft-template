// Avisos agendados do aluno (cron diário, #46): cada um vai ao sininho e/ou por e-mail.
//
// - Conteúdo liberado: o que abriu por data desde a última execução (`liberacoesNoIntervalo`,
//   #42). O último instante processado fica em `estado_de_aviso` e a primeira execução olha 1 dia.
// - Acesso expirando: matrícula que expira dentro de N dias (padrão 7).
// - Seu acesso está pronto: matrícula de N dias (padrão 3) cujo aluno nunca entrou.
// - Sentimos sua falta: N dias (padrão 14) sem acessar, com matrícula ativa.
//
// "Uma vez por ciclo": `aviso_enviado` tem índice único (pessoa, tipo, ciclo). O ciclo do
// "expirando" é a matrícula + a data de expiração (prorrogar abre ciclo novo); o de "sentimos sua
// falta" é o dia do último acesso (voltar e sumir de novo abre ciclo novo); o de "acesso pronto" é
// único por pessoa; o de "conteúdo liberado" é o conteúdo.
//
// Os dias (e o liga/desliga de "acesso pronto" e "sentimos sua falta") são ajustáveis pela
// equipe (`ajuste_de_aviso`, tela Estúdio > Avisos). A e-mail passa por
// `pedirEmail`, injetado: o módulo não conhece fila nem provedor.

import { and, eq, gt, inArray, isNull, lte, sql } from 'drizzle-orm'
import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import type * as schema from '#/db/schema'
import {
  ajusteDeAviso,
  aula,
  avisoEnviado,
  curso,
  matricula,
  modulo,
  session,
  turma,
  user,
} from '#/db/schema'
import { diaEmBrasilia, formatarData } from '#/lib/datas'
import { liberacoesNoIntervalo } from '#/regras/acesso'
import { primeiroNome } from '#/regras/email-modelos'
import type { PedidoDeEmail } from '#/regras/envio-de-email'
import { gravarEstadoDeAviso, lerEstadoDeAviso } from '#/regras/estado-de-aviso'
import { emLotes } from '#/regras/lotes'
import { matriculaVigenteSql } from '#/regras/matricula'
import { notificar } from '#/regras/notificacoes'
import { type Banco, comoLibsql, type Relogio } from '#/regras/tipos'

const DIA_MS = 86_400_000
const PEDACO = 50

export interface DependenciasDosAvisos {
  pedirEmail: (pedido: PedidoDeEmail) => Promise<unknown>
}

// ---------- Ajustes (dias e liga/desliga) ----------

export const AJUSTES_PADRAO = {
  diasAcessoExpirando: 7,
  diasAcessoPronto: 3,
  diasSentimosSuaFalta: 14,
} as const
type AjustesDeDias = { -readonly [K in keyof typeof AJUSTES_PADRAO]: number }
/** Dias de cada aviso e o liga/desliga dos que a equipe pode desligar (padrão: ligados). */
export type Ajustes = AjustesDeDias & {
  acessoProntoLigado: boolean
  sentimosSuaFaltaLigado: boolean
}

const CAMPO_LIGADO = {
  diasAcessoPronto: 'acessoProntoLigado',
  diasSentimosSuaFalta: 'sentimosSuaFaltaLigado',
} as const

const CHAVE_DO_AJUSTE: Record<keyof AjustesDeDias, string> = {
  diasAcessoExpirando: 'dias-acesso-expirando',
  diasAcessoPronto: 'dias-acesso-pronto',
  diasSentimosSuaFalta: 'dias-sentimos-sua-falta',
}
const DIAS_MAXIMOS = 365
// Quanto tempo depois do prazo ainda vale avisar "acesso pronto" (evita avisar matrícula antiga).
const JANELA_DO_PRONTO_DIAS = 14

export class ErroDeAviso extends Error {
  constructor(mensagem: string) {
    super(mensagem)
    this.name = 'ErroDeAviso'
  }
}

const DIAS_DO_AJUSTE = Object.keys(CHAVE_DO_AJUSTE) as (keyof AjustesDeDias)[]

export async function lerAjustes(banco: Banco): Promise<Ajustes> {
  const db = comoLibsql(banco)
  const linhas = await db.select().from(ajusteDeAviso)
  const porChave = new Map(linhas.map((l) => [l.chave, l]))
  const saida = {
    ...AJUSTES_PADRAO,
    acessoProntoLigado: true,
    sentimosSuaFaltaLigado: true,
  } as Ajustes
  for (const campo of DIAS_DO_AJUSTE) {
    const linha = porChave.get(CHAVE_DO_AJUSTE[campo])
    saida[campo] = linha?.valor ?? AJUSTES_PADRAO[campo]
    if (campo in CAMPO_LIGADO) {
      saida[CAMPO_LIGADO[campo as keyof typeof CAMPO_LIGADO]] =
        linha?.ligado ?? true
    }
  }
  return saida
}

export async function salvarAjustes(
  banco: Banco,
  agora: Relogio,
  novos: Ajustes,
): Promise<void> {
  const db = comoLibsql(banco)
  for (const campo of DIAS_DO_AJUSTE) {
    const valor = novos[campo]
    if (!Number.isInteger(valor) || valor < 1 || valor > DIAS_MAXIMOS) {
      throw new ErroDeAviso(
        `Os dias precisam ser um número inteiro de 1 a ${DIAS_MAXIMOS}.`,
      )
    }
  }
  for (const campo of DIAS_DO_AJUSTE) {
    const ligado =
      campo in CAMPO_LIGADO
        ? novos[CAMPO_LIGADO[campo as keyof typeof CAMPO_LIGADO]]
        : true
    await db
      .insert(ajusteDeAviso)
      .values({
        chave: CHAVE_DO_AJUSTE[campo],
        valor: novos[campo],
        ligado,
        atualizadoEm: agora(),
      })
      .onConflictDoUpdate({
        target: ajusteDeAviso.chave,
        set: { valor: novos[campo], ligado, atualizadoEm: agora() },
      })
  }
}

// ---------- Uma vez por ciclo ----------

/** Reserva o ciclo: devolve `true` só na primeira vez (quem reservar primeiro envia). */
async function reservarCiclo(
  db: LibSQLDatabase<typeof schema>,
  agora: Relogio,
  userId: string,
  tipo: string,
  ciclo: string,
): Promise<boolean> {
  const reservado = await db
    .insert(avisoEnviado)
    .values({ id: crypto.randomUUID(), userId, tipo, ciclo, criadoEm: agora() })
    .onConflictDoNothing()
    .returning({ id: avisoEnviado.id })
  return reservado.length > 0
}

async function pessoas(db: LibSQLDatabase<typeof schema>, ids: string[]) {
  const mapa = new Map<string, { nome: string; email: string }>()
  const unicos = [...new Set(ids)]
  for (let i = 0; i < unicos.length; i += PEDACO) {
    const linhas = await db
      .select({ id: user.id, nome: user.name, email: user.email })
      .from(user)
      .where(inArray(user.id, unicos.slice(i, i + PEDACO)))
    for (const l of linhas) mapa.set(l.id, { nome: l.nome, email: l.email })
  }
  return mapa
}

// ---------- Conteúdo liberado ----------

export const MARCO_DA_LIBERACAO = 'liberacao:ultimo-instante'

export async function avisarConteudoLiberado(
  banco: Banco,
  agora: Relogio,
  deps: DependenciasDosAvisos,
): Promise<number> {
  const db = comoLibsql(banco)
  const ate = agora()
  const marco = await lerEstadoDeAviso(banco, MARCO_DA_LIBERACAO)
  const de = new Date(marco ?? ate.getTime() - DIA_MS)
  const liberacoes = await liberacoesNoIntervalo(banco, de, ate)

  const ids = (campo: 'cursoId' | 'moduloId' | 'aulaId') =>
    liberacoes.flatMap((l) => (l[campo] ? [l[campo] as string] : []))
  const [cursos, modulos, aulas, gente] = await Promise.all([
    nomes(ids('cursoId'), (p) =>
      db
        .select({ id: curso.id, nome: curso.nome })
        .from(curso)
        .where(inArray(curso.id, p)),
    ),
    nomes(ids('moduloId'), (p) =>
      db
        .select({ id: modulo.id, nome: modulo.nome })
        .from(modulo)
        .where(inArray(modulo.id, p)),
    ),
    nomes(ids('aulaId'), (p) =>
      db
        .select({ id: aula.id, nome: aula.titulo })
        .from(aula)
        .where(inArray(aula.id, p)),
    ),
    pessoas(
      db,
      liberacoes.map((l) => l.userId),
    ),
  ])

  let avisados = 0
  for (const l of liberacoes) {
    const alvo = gente.get(l.userId)
    if (!alvo) continue
    const ciclo = `${l.cursoId}:${l.moduloId ?? ''}:${l.aulaId ?? ''}`
    if (
      !(await reservarCiclo(db, agora, l.userId, 'conteudo-liberado', ciclo))
    ) {
      continue
    }
    const nomeDoCurso = cursos.get(l.cursoId) ?? 'seu curso'
    const nomeDoConteudo = l.aulaId
      ? (aulas.get(l.aulaId) ?? 'Uma aula')
      : (modulos.get(l.moduloId ?? '') ?? 'Um módulo')
    await notificar(banco, agora, {
      userId: l.userId,
      tipo: 'conteudo-liberado',
      texto: `${nomeDoConteudo} de ${nomeDoCurso} foi liberado.`,
      link: l.aulaId ? `/aulas/${l.aulaId}` : `/cursos/${l.cursoId}`,
    })
    await deps.pedirEmail({
      tipo: 'conteudo-liberado',
      para: alvo.email,
      userId: l.userId,
      variaveis: {
        nome: primeiroNome(alvo.nome),
        curso: nomeDoCurso,
        conteudo: nomeDoConteudo,
      },
    })
    avisados++
  }
  // O marco só avança depois de tudo: se algo lançar, a próxima execução refaz (o ciclo evita dobro).
  await gravarEstadoDeAviso(banco, agora, MARCO_DA_LIBERACAO, ate.getTime())
  return avisados
}

async function nomes(
  ids: string[],
  buscar: (pedaco: string[]) => Promise<{ id: string; nome: string }[]>,
) {
  const mapa = new Map<string, string>()
  const unicos = [...new Set(ids)]
  for (let i = 0; i < unicos.length; i += PEDACO) {
    for (const l of await buscar(unicos.slice(i, i + PEDACO))) {
      mapa.set(l.id, l.nome)
    }
  }
  return mapa
}

// ---------- Acesso expirando ----------

export async function avisarAcessoExpirando(
  banco: Banco,
  agora: Relogio,
  deps: DependenciasDosAvisos,
  dias: number,
): Promise<number> {
  const db = comoLibsql(banco)
  const hoje = agora()
  const limite = new Date(hoje.getTime() + dias * DIA_MS)
  const linhas = await db
    .select({
      matriculaId: matricula.id,
      userId: matricula.userId,
      expiraEm: matricula.expiraEm,
      cursoId: curso.id,
      cursoNome: curso.nome,
      nome: user.name,
      email: user.email,
    })
    .from(matricula)
    .innerJoin(turma, eq(turma.id, matricula.turmaId))
    .innerJoin(curso, eq(curso.id, turma.cursoId))
    .innerJoin(user, eq(user.id, matricula.userId))
    .where(and(matriculaVigenteSql(hoje), lte(matricula.expiraEm, limite)))
  let avisados = 0
  for (const l of linhas) {
    if (!l.expiraEm) continue
    const ciclo = `${l.matriculaId}:${l.expiraEm.getTime()}`
    if (
      !(await reservarCiclo(db, agora, l.userId, 'acesso-expirando', ciclo))
    ) {
      continue
    }
    await notificar(banco, agora, {
      userId: l.userId,
      tipo: 'acesso-expirando',
      texto: `Seu acesso a ${l.cursoNome} expira em ${formatarData(l.expiraEm)}.`,
      link: `/cursos/${l.cursoId}`,
    })
    await deps.pedirEmail({
      tipo: 'acesso-expirando',
      para: l.email,
      userId: l.userId,
      variaveis: {
        nome: primeiroNome(l.nome),
        curso: l.cursoNome,
        data: formatarData(l.expiraEm),
      },
    })
    avisados++
  }
  return avisados
}

// ---------- Seu acesso está pronto ----------

/** Matrícula de `dias` dias (ou mais, até a janela) de quem nunca entrou: sem sessão e sem aceite dos termos. */
export async function avisarAcessoPronto(
  banco: Banco,
  agora: Relogio,
  deps: DependenciasDosAvisos,
  dias: number,
): Promise<number> {
  const db = comoLibsql(banco)
  const hoje = agora()
  const ate = new Date(hoje.getTime() - dias * DIA_MS)
  const desde = new Date(ate.getTime() - JANELA_DO_PRONTO_DIAS * DIA_MS)
  const linhas = await db
    .select({
      userId: matricula.userId,
      nome: user.name,
      email: user.email,
      sessoes: sql<number>`(select count(*) from ${session} where ${session.userId} = ${user.id})`,
    })
    .from(matricula)
    .innerJoin(user, eq(user.id, matricula.userId))
    .where(
      and(
        matriculaVigenteSql(hoje),
        lte(matricula.iniciaEm, ate),
        gt(matricula.iniciaEm, desde),
        isNull(user.termosAceitoEm),
        eq(user.perfil, 'aluno'),
      ),
    )
  let avisados = 0
  const vistos = new Set<string>()
  for (const l of linhas) {
    if (Number(l.sessoes) > 0 || vistos.has(l.userId)) continue
    vistos.add(l.userId)
    if (!(await reservarCiclo(db, agora, l.userId, 'acesso-pronto', 'unico'))) {
      continue
    }
    await deps.pedirEmail({
      tipo: 'acesso-pronto',
      para: l.email,
      userId: l.userId,
      variaveis: { nome: primeiroNome(l.nome) },
    })
    avisados++
  }
  return avisados
}

// ---------- Sentimos sua falta ----------

/** Quem tem matrícula ativa e passou `dias` dias sem acessar (o último acesso vem das sessões). */
export async function avisarSentimosSuaFalta(
  banco: Banco,
  agora: Relogio,
  deps: DependenciasDosAvisos,
  dias: number,
): Promise<number> {
  const db = comoLibsql(banco)
  const hoje = agora()
  const limite = new Date(hoje.getTime() - dias * DIA_MS)
  const ultimos = await db
    .select({
      userId: session.userId,
      ultimo: sql<number>`max(${session.updatedAt})`,
      nome: user.name,
      email: user.email,
    })
    .from(session)
    .innerJoin(user, eq(user.id, session.userId))
    .where(eq(user.perfil, 'aluno'))
    .groupBy(session.userId)
    .having(sql`max(${session.updatedAt}) <= ${limite.getTime()}`)
  // Quem tem matrícula vigente, buscado de uma vez (em lotes) em vez de uma consulta por aluno.
  const vigentes = await emLotes(
    ultimos.map((u) => u.userId),
    (lote) =>
      db
        .select({ userId: matricula.userId })
        .from(matricula)
        .where(and(inArray(matricula.userId, lote), matriculaVigenteSql(hoje))),
    50,
  )
  const comMatricula = new Set(vigentes.map((v) => v.userId))
  let avisados = 0
  for (const u of ultimos) {
    if (!comMatricula.has(u.userId)) continue
    const ultimo = new Date(Number(u.ultimo))
    const ciclo = diaEmBrasilia(ultimo).toISOString().slice(0, 10)
    if (
      !(await reservarCiclo(db, agora, u.userId, 'sentimos-sua-falta', ciclo))
    ) {
      continue
    }
    const semAcessar = Math.floor((hoje.getTime() - ultimo.getTime()) / DIA_MS)
    await notificar(banco, agora, {
      userId: u.userId,
      tipo: 'sentimos-sua-falta',
      texto: `Sentimos sua falta! Faz ${semAcessar} dias que você não aparece.`,
      link: '/',
    })
    await deps.pedirEmail({
      tipo: 'sentimos-sua-falta',
      para: u.email,
      userId: u.userId,
      variaveis: { nome: primeiroNome(u.nome), dias: String(semAcessar) },
    })
    avisados++
  }
  return avisados
}

// ---------- Tudo junto ----------

export interface ResumoDosAvisos {
  conteudoLiberado: number
  acessoExpirando: number
  acessoPronto: number
  sentimosSuaFalta: number
}

/** A execução do cron diário. Cada aviso é isolado: se um falhar, os outros rodam e o erro volta no fim. */
export async function rodarAvisosAgendados(
  banco: Banco,
  agora: Relogio,
  deps: DependenciasDosAvisos,
): Promise<ResumoDosAvisos> {
  const ajustes = await lerAjustes(banco)
  const resumo: ResumoDosAvisos = {
    conteudoLiberado: 0,
    acessoExpirando: 0,
    acessoPronto: 0,
    sentimosSuaFalta: 0,
  }
  const erros: string[] = []
  const passos: [keyof ResumoDosAvisos, () => Promise<number>][] = [
    ['conteudoLiberado', () => avisarConteudoLiberado(banco, agora, deps)],
    [
      'acessoExpirando',
      () =>
        avisarAcessoExpirando(banco, agora, deps, ajustes.diasAcessoExpirando),
    ],
    [
      'acessoPronto',
      async () =>
        ajustes.acessoProntoLigado
          ? avisarAcessoPronto(banco, agora, deps, ajustes.diasAcessoPronto)
          : 0,
    ],
    [
      'sentimosSuaFalta',
      async () =>
        ajustes.sentimosSuaFaltaLigado
          ? avisarSentimosSuaFalta(
              banco,
              agora,
              deps,
              ajustes.diasSentimosSuaFalta,
            )
          : 0,
    ],
  ]
  for (const [nome, rodar] of passos) {
    try {
      resumo[nome] = await rodar()
    } catch (erro) {
      erros.push(
        `${nome}: ${erro instanceof Error ? erro.message : String(erro)}`,
      )
    }
  }
  if (erros.length > 0) throw new Error(erros.join('; '))
  return resumo
}
