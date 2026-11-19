// Acesso: o que o aluno vê de cada módulo e aula (#42). `situacaoDoConteudo` devolve `liberado`,
// `oculto` ou `cadeado` com o motivo (ver `cadeado.ts`).
//
// - A regra é por módulo na turma; a regra própria da aula vale no lugar da do módulo. Sem regra,
//   o item é livre (`regras-de-liberacao.ts` grava).
// - Só a matrícula ativa libera. Com mais de uma turma do mesmo curso vale a mais generosa.
// - As condições "concluído" olham qualquer curso. Módulo ou curso alvo sem aulas ativas (removido
//   ou esvaziado) conta como concluído: não há o que concluir, e um cadeado eterno só puniria o
//   aluno. Aula alvo removida mantém o cadeado.
// - Regra malformada (campo obrigatório nulo, ex.: `pontos`) falha fechada: o conteúdo fica
//   bloqueado até a equipe corrigir (`lerRegra`, `regrasQuebradas`).
// - A equipe vê tudo; `comoAluno` aplica as regras de uma turma, como se a pessoa tivesse acabado
//   de se matricular nela ("ver como aluno").
// - Datas e "dias após a compra" são do horário de Brasília (o dia começa às 00:00 de lá).
//
// Pontos de extensão:
// - `saldoDoCurso`: o saldo de pontos do aluno no curso, vindo da fatia de pontos (#54). Sem ele,
//   o saldo é 0.
// - `liberacoesNoIntervalo`: o que libera numa janela de tempo, para o aviso "Conteúdo liberado"
//   (sininho e e-mail, #46).

import { and, eq, inArray, isNotNull, isNull } from 'drizzle-orm'
import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import type * as schema from '#/db/schema'
import {
  aula,
  curso,
  matricula,
  modulo,
  progressoDaAula,
  regraDeLiberacao,
  turma,
} from '#/db/schema'
import { diaEmBrasilia } from '#/lib/datas'
import {
  LIBERADO,
  postoDoCadeado,
  type Requisito,
  type SituacaoDoConteudo,
} from '#/regras/cadeado'
import { emLotes } from '#/regras/lotes'
import { situacaoDaMatricula } from '#/regras/matricula'
import { type Perfil, podeFazer } from '#/regras/permissoes'
import { type Banco, comoLibsql, type Relogio } from '#/regras/tipos'

export type {
  MotivoDoCadeado,
  Requisito,
  SituacaoDoConteudo,
} from '#/regras/cadeado'

export interface Aluno {
  id: string
  perfil: Perfil
}

export type ItemDoConteudo = { tipo: 'modulo' | 'aula'; id: string }

export interface OpcoesDeAcesso {
  /** Pontos do aluno no curso (fatia #54). Padrão: 0. */
  saldoDoCurso?: (userId: string, cursoId: string) => Promise<number> | number
  /** "Ver como aluno": a equipe vê o curso da turma com as regras dela. */
  comoAluno?: { turmaId: string }
}

export interface MapaDeSituacoes {
  modulos: Map<string, SituacaoDoConteudo>
  aulas: Map<string, SituacaoDoConteudo>
}

type Regra = typeof regraDeLiberacao.$inferSelect

// O que a regra precisa saber do mundo para decidir, já carregado.
interface Mundo {
  agora: Date
  saldo: (cursoId: string) => Promise<number>
  /** Quais aulas o aluno concluiu (de qualquer curso). */
  concluidas: Set<string>
  cursoPorAula: Map<string, string>
  aulasDoModulo: Map<string, string[]>
  aulasDoCurso: Map<string, string[]>
  nomeDoModulo: Map<string, string>
  nomeDoCurso: Map<string, string>
  tituloDaAula: Map<string, string>
}

function cadeado(
  motivo: Extract<SituacaoDoConteudo, { tipo: 'cadeado' }>['motivo'],
  extra: { liberaEm?: Date; requisito?: Requisito } = {},
): SituacaoDoConteudo {
  return { tipo: 'cadeado', motivo, ...extra }
}

// Sem aulas ativas no alvo não há o que concluir: a condição está satisfeita (ver o cabeçalho).
function tudoConcluido(aulas: string[] | undefined, concluidas: Set<string>) {
  return !aulas || aulas.every((id) => concluidas.has(id))
}

/** A regra com os campos obrigatórios do tipo garantidos, ou `quebrada` (nada de default). */
export type RegraLida =
  | { tipo: 'livre' | 'oculto' | 'bloqueado' }
  | { tipo: 'data'; liberaEm: Date; fechaEm: Date | null }
  | { tipo: 'dias_apos_compra'; dias: number }
  | { tipo: 'pontuacao_minima'; pontos: number }
  | {
      tipo: 'curso_concluido' | 'modulo_concluido' | 'aula_concluida'
      alvoId: string
    }
  | { tipo: 'quebrada' }

const QUEBRADA: RegraLida = { tipo: 'quebrada' }

function inteiroPositivo(n: number | null): n is number {
  return n !== null && Number.isInteger(n) && n > 0
}

/**
 * Valida a linha pelo que `definirRegra` exige ao gravar. Linha que nunca passaria na gravação
 * (coluna anulável vazia, tipo desconhecido) vira `quebrada`.
 */
export function lerRegra(
  r: Pick<
    Regra,
    'tipo' | 'liberaEm' | 'fechaEm' | 'dias' | 'pontos' | 'alvoId'
  >,
): RegraLida {
  switch (r.tipo) {
    case 'livre':
    case 'oculto':
    case 'bloqueado':
      return { tipo: r.tipo }
    case 'data':
      return r.liberaEm
        ? { tipo: 'data', liberaEm: r.liberaEm, fechaEm: r.fechaEm }
        : QUEBRADA
    case 'dias_apos_compra':
      return inteiroPositivo(r.dias)
        ? { tipo: 'dias_apos_compra', dias: r.dias }
        : QUEBRADA
    case 'pontuacao_minima':
      return inteiroPositivo(r.pontos)
        ? { tipo: 'pontuacao_minima', pontos: r.pontos }
        : QUEBRADA
    case 'curso_concluido':
    case 'modulo_concluido':
    case 'aula_concluida':
      return r.alvoId ? { tipo: r.tipo, alvoId: r.alvoId } : QUEBRADA
    default:
      return QUEBRADA
  }
}

/** As regras gravadas que `lerRegra` não aceita, para a equipe corrigir. */
export async function regrasQuebradas(banco: Banco, turmaId?: string) {
  const db = comoLibsql(banco)
  const linhas = await db
    .select()
    .from(regraDeLiberacao)
    .where(turmaId ? eq(regraDeLiberacao.turmaId, turmaId) : undefined)
  return linhas
    .filter((r) => lerRegra(r).tipo === 'quebrada')
    .map((r) => ({
      turmaId: r.turmaId,
      moduloId: r.moduloId,
      aulaId: r.aulaId,
      tipo: r.tipo,
    }))
}

async function avaliarRegra(
  linha: Regra | undefined,
  iniciaEm: Date,
  cursoId: string,
  mundo: Mundo,
): Promise<SituacaoDoConteudo> {
  if (!linha) return LIBERADO
  const regra = lerRegra(linha)
  const { agora } = mundo
  switch (regra.tipo) {
    case 'livre':
      return LIBERADO
    case 'oculto':
      return { tipo: 'oculto' }
    case 'bloqueado':
    case 'quebrada':
      return cadeado('bloqueado')
    case 'data': {
      if (agora.getTime() < regra.liberaEm.getTime()) {
        return cadeado('data', { liberaEm: regra.liberaEm })
      }
      if (regra.fechaEm && agora.getTime() > regra.fechaEm.getTime()) {
        return cadeado('fechado')
      }
      return LIBERADO
    }
    case 'dias_apos_compra': {
      const { dias } = regra
      const liberaEm = diaEmBrasilia(iniciaEm, dias)
      return agora.getTime() < liberaEm.getTime()
        ? cadeado('dias_apos_compra', {
            liberaEm,
            requisito: { tipo: 'dias', dias },
          })
        : LIBERADO
    }
    case 'pontuacao_minima': {
      const minimo = regra.pontos
      const saldo = await mundo.saldo(cursoId)
      return saldo >= minimo
        ? LIBERADO
        : cadeado('pontuacao_minima', {
            requisito: { tipo: 'pontos', minimo, faltam: minimo - saldo },
          })
    }
    case 'curso_concluido': {
      const id = regra.alvoId
      return tudoConcluido(mundo.aulasDoCurso.get(id), mundo.concluidas)
        ? LIBERADO
        : cadeado('apos_curso', {
            requisito: { tipo: 'curso', id, nome: mundo.nomeDoCurso.get(id) },
          })
    }
    case 'modulo_concluido': {
      const id = regra.alvoId
      return tudoConcluido(mundo.aulasDoModulo.get(id), mundo.concluidas)
        ? LIBERADO
        : cadeado('apos_modulo', {
            requisito: { tipo: 'modulo', id, nome: mundo.nomeDoModulo.get(id) },
          })
    }
    case 'aula_concluida': {
      const id = regra.alvoId
      return mundo.concluidas.has(id) && mundo.cursoPorAula.has(id)
        ? LIBERADO
        : cadeado('apos_aula', {
            requisito: { tipo: 'aula', id, nome: mundo.tituloDaAula.get(id) },
          })
    }
  }
}

// Quão "generosa" é uma situação que não libera: quanto menor, melhor para o aluno.
function posto(s: SituacaoDoConteudo): [number, number] {
  if (s.tipo === 'liberado') return [-1, 0]
  if (s.tipo === 'oculto') return [5, 0]
  const [grupo, desempate] = postoDoCadeado(s)
  // Só os que abrem por data desempatam pela data; nos demais grupos o desempate não conta.
  return [grupo, grupo === 0 ? desempate : 0]
}

export function maisGenerosa(
  situacoes: SituacaoDoConteudo[],
): SituacaoDoConteudo {
  let melhor = situacoes[0] ?? cadeado('sem_matricula')
  for (const s of situacoes.slice(1)) {
    const [a, b] = posto(s)
    const [c, d] = posto(melhor)
    if (a < c || (a === c && b < d)) melhor = s
  }
  return melhor
}

interface Vinculo {
  turmaId: string
  cursoId: string
  /** Só a matrícula ativa libera; a expirada mostra "acesso expirado"; a inativa não conta. */
  situacao: 'ativa' | 'expirada'
  iniciaEm: Date
}

/**
 * A situação de todos os módulos e aulas dos cursos para a pessoa. Faz as consultas uma vez só,
 * por isso serve às telas (curso, aula, busca) em vez de perguntar item a item.
 */
export async function situacoesDosCursos(
  banco: Banco,
  agora: Relogio,
  aluno: Aluno,
  cursoIds: string[],
  opcoes: OpcoesDeAcesso = {},
): Promise<MapaDeSituacoes> {
  const db = comoLibsql(banco)
  const hoje = agora()
  const mapa: MapaDeSituacoes = { modulos: new Map(), aulas: new Map() }
  if (cursoIds.length === 0) return mapa

  // Duas cadeias que não dependem uma da outra rodam juntas: o conteúdo (módulos e aulas) e as
  // regras da pessoa (matrícula, regras de liberação e o que elas precisam).
  const conteudoDosCursos = async () => {
    const mods = await emLotes(cursoIds, (ids) =>
      db
        .select()
        .from(modulo)
        .where(and(inArray(modulo.cursoId, ids), isNull(modulo.excluidoEm))),
    )
    const aus = await emLotes(
      mods.map((m) => m.id),
      (ids) =>
        db
          .select()
          .from(aula)
          .where(and(inArray(aula.moduloId, ids), isNull(aula.excluidoEm))),
    )
    return { modulos: mods, aulas: aus }
  }

  const regrasDaPessoa = async () => {
    const equipe = podeFazer(aluno.perfil, 'usar-estudio')
    // Cada curso fica livre para a equipe; o aluno parte do "sem matrícula" e vai ganhando vínculos.
    const vinculos = new Map<string, Vinculo[]>()
    const cursosLivres = new Set<string>()
    if (equipe && !opcoes.comoAluno) {
      for (const id of cursoIds) cursosLivres.add(id)
    } else if (equipe && opcoes.comoAluno) {
      const [t] = await db
        .select()
        .from(turma)
        .where(eq(turma.id, opcoes.comoAluno.turmaId))
      for (const id of cursoIds) {
        if (!t || t.cursoId !== id) cursosLivres.add(id)
      }
      if (t && cursoIds.includes(t.cursoId)) {
        vinculos.set(t.cursoId, [
          {
            turmaId: t.id,
            cursoId: t.cursoId,
            situacao: 'ativa',
            iniciaEm: hoje,
          },
        ])
      }
    } else {
      const linhas = await emLotes(cursoIds, (ids) =>
        db
          .select({
            turmaId: turma.id,
            cursoId: turma.cursoId,
            situacao: matricula.situacao,
            expiraEm: matricula.expiraEm,
            iniciaEm: matricula.iniciaEm,
          })
          .from(matricula)
          .innerJoin(turma, eq(turma.id, matricula.turmaId))
          .where(
            and(eq(matricula.userId, aluno.id), inArray(turma.cursoId, ids)),
          ),
      )
      for (const l of linhas) {
        const situacao = situacaoDaMatricula(l, hoje)
        if (situacao === 'inativa') continue
        vinculos.set(l.cursoId, [
          ...(vinculos.get(l.cursoId) ?? []),
          {
            turmaId: l.turmaId,
            cursoId: l.cursoId,
            situacao,
            iniciaEm: l.iniciaEm,
          },
        ])
      }
    }

    const turmaIds = [...vinculos.values()].flat().map((v) => v.turmaId)
    const regras = await emLotes(turmaIds, (ids) =>
      db
        .select()
        .from(regraDeLiberacao)
        .where(inArray(regraDeLiberacao.turmaId, ids)),
    )
    const mundo = await carregarMundo(db, hoje, aluno.id, regras, opcoes)

    const regrasDaTurma = new Map<
      string,
      { modulos: Map<string, Regra>; aulas: Map<string, Regra> }
    >()
    for (const r of regras) {
      const dela = regrasDaTurma.get(r.turmaId) ?? {
        modulos: new Map(),
        aulas: new Map(),
      }
      if (r.aulaId) dela.aulas.set(r.aulaId, r)
      else if (r.moduloId) dela.modulos.set(r.moduloId, r)
      regrasDaTurma.set(r.turmaId, dela)
    }
    return { vinculos, cursosLivres, regrasDaTurma, mundo }
  }

  const [{ modulos, aulas }, { vinculos, cursosLivres, regrasDaTurma, mundo }] =
    await Promise.all([conteudoDosCursos(), regrasDaPessoa()])

  async function decidir(
    cursoId: string,
    daRegra: (turmaId: string) => Regra | undefined,
  ): Promise<SituacaoDoConteudo> {
    if (cursosLivres.has(cursoId)) return LIBERADO
    const doCurso = vinculos.get(cursoId) ?? []
    const ativas = doCurso.filter((v) => v.situacao === 'ativa')
    if (ativas.length === 0) {
      return doCurso.length > 0
        ? cadeado('acesso_expirado')
        : cadeado('sem_matricula')
    }
    const resultados: SituacaoDoConteudo[] = []
    for (const v of ativas) {
      const s = await avaliarRegra(
        daRegra(v.turmaId),
        v.iniciaEm,
        cursoId,
        mundo,
      )
      if (s.tipo === 'liberado') return LIBERADO
      resultados.push(s)
    }
    return maisGenerosa(resultados)
  }

  for (const m of modulos) {
    mapa.modulos.set(
      m.id,
      await decidir(m.cursoId, (t) => regrasDaTurma.get(t)?.modulos.get(m.id)),
    )
  }
  const cursoDoModulo = new Map(modulos.map((m) => [m.id, m.cursoId]))
  for (const a of aulas) {
    const cursoId = cursoDoModulo.get(a.moduloId) as string
    mapa.aulas.set(
      a.id,
      await decidir(cursoId, (t) => {
        const dela = regrasDaTurma.get(t)
        return dela?.aulas.get(a.id) ?? dela?.modulos.get(a.moduloId)
      }),
    )
  }
  return mapa
}

// Carrega só o necessário para as condições "concluído" e para os nomes que o cadeado mostra.
async function carregarMundo(
  db: LibSQLDatabase<typeof schema>,
  agora: Date,
  userId: string,
  regras: Regra[],
  opcoes: OpcoesDeAcesso,
): Promise<Mundo> {
  const alvos = (tipo: Regra['tipo']) =>
    regras
      .filter((r) => r.tipo === tipo && r.alvoId)
      .map((r) => r.alvoId as string)
  const alvoAulas = alvos('aula_concluida')
  const alvoModulos = alvos('modulo_concluido')
  const alvoCursos = alvos('curso_concluido')

  const mundo: Mundo = {
    agora,
    saldo: (() => {
      const guardado = new Map<string, Promise<number>>()
      return (cursoId: string) => {
        let saldo = guardado.get(cursoId)
        if (!saldo) {
          saldo = Promise.resolve(opcoes.saldoDoCurso?.(userId, cursoId) ?? 0)
          guardado.set(cursoId, saldo)
        }
        return saldo
      }
    })(),
    concluidas: new Set(),
    cursoPorAula: new Map(),
    aulasDoModulo: new Map(),
    aulasDoCurso: new Map(),
    nomeDoModulo: new Map(),
    nomeDoCurso: new Map(),
    tituloDaAula: new Map(),
  }
  if (alvoAulas.length + alvoModulos.length + alvoCursos.length === 0)
    return mundo

  const linhasDeAula = (condicao: Parameters<typeof and>[0]) =>
    db
      .select({
        id: aula.id,
        titulo: aula.titulo,
        moduloId: aula.moduloId,
        cursoId: modulo.cursoId,
      })
      .from(aula)
      .innerJoin(modulo, eq(modulo.id, aula.moduloId))
      .innerJoin(curso, eq(curso.id, modulo.cursoId))
      .where(
        and(
          condicao,
          isNull(aula.excluidoEm),
          isNull(modulo.excluidoEm),
          isNull(curso.excluidoEm),
        ),
      )
  const encontradas = [
    ...(await emLotes(alvoAulas, (ids) => linhasDeAula(inArray(aula.id, ids)))),
    ...(await emLotes(alvoModulos, (ids) =>
      linhasDeAula(inArray(aula.moduloId, ids)),
    )),
    ...(await emLotes(alvoCursos, (ids) =>
      linhasDeAula(inArray(modulo.cursoId, ids)),
    )),
  ]
  for (const a of encontradas) {
    mundo.cursoPorAula.set(a.id, a.cursoId)
    mundo.tituloDaAula.set(a.id, a.titulo)
    if (alvoModulos.includes(a.moduloId)) {
      mundo.aulasDoModulo.set(a.moduloId, [
        ...new Set([...(mundo.aulasDoModulo.get(a.moduloId) ?? []), a.id]),
      ])
    }
    if (alvoCursos.includes(a.cursoId)) {
      mundo.aulasDoCurso.set(a.cursoId, [
        ...new Set([...(mundo.aulasDoCurso.get(a.cursoId) ?? []), a.id]),
      ])
    }
  }
  const nomes = await emLotes(alvoModulos, (ids) =>
    db
      .select({ id: modulo.id, nome: modulo.nome })
      .from(modulo)
      .where(inArray(modulo.id, ids)),
  )
  for (const n of nomes) mundo.nomeDoModulo.set(n.id, n.nome)
  const cursos = await emLotes(alvoCursos, (ids) =>
    db
      .select({ id: curso.id, nome: curso.nome })
      .from(curso)
      .where(inArray(curso.id, ids)),
  )
  for (const c of cursos) mundo.nomeDoCurso.set(c.id, c.nome)

  const feitas = await db
    .select({ aulaId: progressoDaAula.aulaId })
    .from(progressoDaAula)
    .where(
      and(
        eq(progressoDaAula.userId, userId),
        isNotNull(progressoDaAula.concluidaEm),
      ),
    )
  mundo.concluidas = new Set(feitas.map((f) => f.aulaId))
  return mundo
}

/** A situação de UM módulo ou aula para a pessoa. */
export async function situacaoDoConteudo(
  banco: Banco,
  agora: Relogio,
  aluno: Aluno,
  item: ItemDoConteudo,
  opcoes: OpcoesDeAcesso = {},
): Promise<SituacaoDoConteudo> {
  const db = comoLibsql(banco)
  const [achado] =
    item.tipo === 'modulo'
      ? await db
          .select({ cursoId: modulo.cursoId })
          .from(modulo)
          .where(and(eq(modulo.id, item.id), isNull(modulo.excluidoEm)))
      : await db
          .select({ cursoId: modulo.cursoId })
          .from(aula)
          .innerJoin(modulo, eq(modulo.id, aula.moduloId))
          .where(
            and(
              eq(aula.id, item.id),
              isNull(aula.excluidoEm),
              isNull(modulo.excluidoEm),
            ),
          )
  if (!achado) return { tipo: 'cadeado', motivo: 'sem_matricula' }
  const mapa = await situacoesDosCursos(
    banco,
    agora,
    aluno,
    [achado.cursoId],
    opcoes,
  )
  return (
    (item.tipo === 'modulo' ? mapa.modulos : mapa.aulas).get(item.id) ?? {
      tipo: 'cadeado',
      motivo: 'sem_matricula',
    }
  )
}

/** As aulas do curso que a pessoa pode abrir (para o botão "Continuar" do curso, #41). */
export function aulasLiberadas(mapa: MapaDeSituacoes): Set<string> {
  return new Set(
    [...mapa.aulas].filter(([, s]) => s.tipo === 'liberado').map(([id]) => id),
  )
}

/** Tira da lista os módulos e as aulas ocultos para a pessoa (módulo oculto leva as aulas junto). */
export function semOcultos<M extends { id: string; aulas: { id: string }[] }>(
  modulos: M[],
  mapa: MapaDeSituacoes,
): M[] {
  return modulos
    .filter((m) => mapa.modulos.get(m.id)?.tipo !== 'oculto')
    .map((m) => ({
      ...m,
      aulas: m.aulas.filter((a) => mapa.aulas.get(a.id)?.tipo !== 'oculto'),
    }))
}

export interface LiberacaoNoIntervalo {
  userId: string
  turmaId: string
  cursoId: string
  /** O módulo ou a aula que passa a abrir (um dos dois). */
  moduloId: string | null
  aulaId: string | null
  liberaEm: Date
}

/**
 * Gancho do aviso "Conteúdo liberado" (#46): o que passa a abrir para cada aluno com matrícula
 * ativa no intervalo (`de` exclusive, `ate` inclusive). Cobre as regras de data e de dias após a
 * compra; as condições "concluído" e de pontos abrem por ação do aluno, não pelo relógio.
 */
export async function liberacoesNoIntervalo(
  banco: Banco,
  de: Date,
  ate: Date,
): Promise<LiberacaoNoIntervalo[]> {
  const db = comoLibsql(banco)
  const regras = await db
    .select({
      regra: regraDeLiberacao,
      cursoId: turma.cursoId,
    })
    .from(regraDeLiberacao)
    .innerJoin(turma, eq(turma.id, regraDeLiberacao.turmaId))
    .where(inArray(regraDeLiberacao.tipo, ['data', 'dias_apos_compra']))
  if (regras.length === 0) return []
  const matriculas = await emLotes(
    regras.map((r) => r.regra.turmaId),
    (ids) => db.select().from(matricula).where(inArray(matricula.turmaId, ids)),
  )
  const saida: LiberacaoNoIntervalo[] = []
  const dentro = (t: Date) =>
    t.getTime() > de.getTime() && t.getTime() <= ate.getTime()
  for (const { regra, cursoId } of regras) {
    const dela = matriculas.filter(
      (m) =>
        m.turmaId === regra.turmaId && situacaoDaMatricula(m, ate) === 'ativa',
    )
    for (const m of dela) {
      const lida = lerRegra(regra)
      let liberaEm: Date | null = null
      if (lida.tipo === 'data') {
        const fechada = lida.fechaEm && lida.fechaEm <= lida.liberaEm
        liberaEm = fechada ? null : lida.liberaEm
      } else if (lida.tipo === 'dias_apos_compra') {
        liberaEm = diaEmBrasilia(m.iniciaEm, lida.dias)
      }
      if (!liberaEm || !dentro(liberaEm)) continue
      saida.push({
        userId: m.userId,
        turmaId: regra.turmaId,
        cursoId,
        moduloId: regra.moduloId,
        aulaId: regra.aulaId,
        liberaEm,
      })
    }
  }
  return saida.sort((a, b) => a.liberaEm.getTime() - b.liberaEm.getTime())
}
