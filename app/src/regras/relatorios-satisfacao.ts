// Relatório Satisfação: notas por aula (as piores primeiro), média, percentual de notas baixas, NPS
// adaptado e os textos de "o que faltou?". O período filtra pela data da nota atual do aluno.
//
// NPS adaptado à nota de 1 a 5: promotores dão 5, neutros 4 e detratores 1 a 3. O NPS é o
// percentual de promotores menos o de detratores, de -100 a 100 (nulo sem nenhuma nota).

import { and, desc, eq, isNull } from 'drizzle-orm'
import { aula, avaliacaoDaAula, curso, modulo, user } from '#/db/schema'
import { NOTA_BAIXA_MAXIMA } from '#/regras/avaliacoes'
import type { FiltroDoRelatorio, Periodo } from '#/regras/relatorios'
import { type Banco, comoLibsql } from '#/regras/tipos'

const NOTA_DO_PROMOTOR = 5
const NOTA_MAXIMA_DO_DETRATOR = 3

export interface ResumoDeNotas {
  total: number
  /** Uma casa decimal; nulo sem notas. */
  media: number | null
  /** 0 a 100, arredondado; nulo sem notas. */
  percentualDeNotasBaixas: number | null
  promotores: number
  neutros: number
  detratores: number
  nps: number | null
}

export function resumirNotas(notas: number[]): ResumoDeNotas {
  const total = notas.length
  const promotores = notas.filter((n) => n === NOTA_DO_PROMOTOR).length
  const detratores = notas.filter((n) => n <= NOTA_MAXIMA_DO_DETRATOR).length
  if (total === 0) {
    return {
      total,
      media: null,
      percentualDeNotasBaixas: null,
      promotores,
      neutros: 0,
      detratores,
      nps: null,
    }
  }
  const baixas = notas.filter((n) => n <= NOTA_BAIXA_MAXIMA).length
  return {
    total,
    media: Math.round((notas.reduce((s, n) => s + n, 0) / total) * 10) / 10,
    percentualDeNotasBaixas: Math.round((baixas * 100) / total),
    promotores,
    neutros: total - promotores - detratores,
    detratores,
    nps: Math.round(((promotores - detratores) * 100) / total),
  }
}

export interface SatisfacaoDeUmaAula extends ResumoDeNotas {
  aulaId: string
  aulaTitulo: string
  cursoNome: string
}

export interface TextoDoQueFaltou {
  id: string
  nota: number
  oQueFaltou: string
  alunoNome: string
  alunoEmail: string
  aulaTitulo: string
  cursoNome: string
  atualizadaEm: Date
  lida: boolean
}

export interface RelatorioDeSatisfacao {
  periodo: Periodo
  resumo: ResumoDeNotas
  /** Das piores para as melhores (média menor primeiro; empate: mais notas primeiro). */
  aulas: SatisfacaoDeUmaAula[]
  textos: TextoDoQueFaltou[]
}

export async function relatorioDeSatisfacao(
  db: Banco,
  filtro: FiltroDoRelatorio,
): Promise<RelatorioDeSatisfacao> {
  const { periodo } = filtro
  const cursoId = filtro.cursoId || null
  const linhas = (
    await comoLibsql(db)
      .select({
        id: avaliacaoDaAula.id,
        nota: avaliacaoDaAula.nota,
        oQueFaltou: avaliacaoDaAula.oQueFaltou,
        lidaEm: avaliacaoDaAula.lidaEm,
        atualizadaEm: avaliacaoDaAula.atualizadaEm,
        alunoNome: user.name,
        alunoEmail: user.email,
        aulaId: aula.id,
        aulaTitulo: aula.titulo,
        cursoId: curso.id,
        cursoNome: curso.nome,
      })
      .from(avaliacaoDaAula)
      .innerJoin(user, eq(user.id, avaliacaoDaAula.userId))
      .innerJoin(aula, eq(aula.id, avaliacaoDaAula.aulaId))
      .innerJoin(modulo, eq(modulo.id, aula.moduloId))
      .innerJoin(curso, eq(curso.id, modulo.cursoId))
      .where(and(isNull(aula.excluidoEm), isNull(modulo.excluidoEm)))
      .orderBy(desc(avaliacaoDaAula.atualizadaEm))
  ).filter(
    (l) =>
      (!cursoId || l.cursoId === cursoId) &&
      l.atualizadaEm.getTime() >= periodo.de.getTime() &&
      l.atualizadaEm.getTime() <= periodo.ate.getTime(),
  )

  const porAula = new Map<string, typeof linhas>()
  for (const l of linhas)
    porAula.set(l.aulaId, [...(porAula.get(l.aulaId) ?? []), l])
  const aulas = [...porAula.values()]
    .map((dela) => ({
      aulaId: dela[0]?.aulaId ?? '',
      aulaTitulo: dela[0]?.aulaTitulo ?? '',
      cursoNome: dela[0]?.cursoNome ?? '',
      ...resumirNotas(dela.map((l) => l.nota)),
    }))
    .sort(
      (a, b) =>
        (a.media ?? 0) - (b.media ?? 0) ||
        b.total - a.total ||
        a.aulaTitulo.localeCompare(b.aulaTitulo, 'pt-BR'),
    )

  return {
    periodo,
    resumo: resumirNotas(linhas.map((l) => l.nota)),
    aulas,
    textos: linhas
      .filter((l) => l.oQueFaltou !== null)
      .map((l) => ({
        id: l.id,
        nota: l.nota,
        oQueFaltou: l.oQueFaltou ?? '',
        alunoNome: l.alunoNome,
        alunoEmail: l.alunoEmail,
        aulaTitulo: l.aulaTitulo,
        cursoNome: l.cursoNome,
        atualizadaEm: l.atualizadaEm,
        lida: l.lidaEm !== null,
      })),
  }
}
