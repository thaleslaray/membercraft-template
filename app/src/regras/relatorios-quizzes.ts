// Relatório Quizzes: tentativas, aprovação e percentual de acerto por pergunta (para achar pergunta
// mal feita). O período filtra pela data de envio da tentativa.
//
// - Aprovação: aprovadas sobre as já corrigidas (aprovadas + reprovadas); aguardando correção fica de
//   fora da taxa e aparece à parte.
// - Pergunta: agrupada pelo enunciado dentro do quiz, porque salvar o quiz regrava os ids das
//   perguntas e a tentativa antiga guarda a cópia do que o aluno viu. Só entram perguntas com
//   correção automática.

import { and, desc, eq, isNull } from 'drizzle-orm'
import { aula, curso, modulo, quiz, tentativaDoQuiz, user } from '#/db/schema'
import {
  corrigirPergunta,
  type PerguntaCopiada,
  type Respostas,
} from '#/regras/quiz'
import type { FiltroDoRelatorio, Periodo } from '#/regras/relatorios'
import { type Banco, comoLibsql } from '#/regras/tipos'

export interface AcertoDaPergunta {
  enunciado: string
  respondidas: number
  acertos: number
  /** 0 a 100, arredondado. */
  percentualDeAcerto: number
}

export interface QuizNoRelatorio {
  quizId: string
  aulaId: string
  aulaTitulo: string
  cursoNome: string
  tentativas: number
  alunos: number
  aprovadas: number
  reprovadas: number
  aguardandoCorrecao: number
  /** 0 a 100; nulo enquanto nenhuma tentativa foi corrigida. */
  taxaDeAprovacao: number | null
  /** Das mais erradas para as mais acertadas. */
  perguntas: AcertoDaPergunta[]
}

export interface RelatorioDeQuizzes {
  periodo: Periodo
  quizzes: QuizNoRelatorio[]
}

function lerJson<T>(texto: string, padrao: T): T {
  try {
    return JSON.parse(texto) as T
  } catch {
    return padrao
  }
}

function acertou(pergunta: PerguntaCopiada, respostas: Respostas) {
  try {
    return corrigirPergunta(pergunta, respostas[pergunta.id] ?? [])
  } catch {
    return null
  }
}

export async function relatorioDeQuizzes(
  db: Banco,
  filtro: FiltroDoRelatorio,
): Promise<RelatorioDeQuizzes> {
  const { periodo } = filtro
  const cursoId = filtro.cursoId || null
  const linhas = (
    await comoLibsql(db)
      .select({
        quizId: quiz.id,
        aulaId: aula.id,
        aulaTitulo: aula.titulo,
        cursoId: curso.id,
        cursoNome: curso.nome,
        userId: tentativaDoQuiz.userId,
        estado: tentativaDoQuiz.estado,
        perguntas: tentativaDoQuiz.perguntas,
        respostas: tentativaDoQuiz.respostas,
        enviadaEm: tentativaDoQuiz.enviadaEm,
      })
      .from(tentativaDoQuiz)
      .innerJoin(quiz, eq(quiz.id, tentativaDoQuiz.quizId))
      .innerJoin(aula, eq(aula.id, quiz.aulaId))
      .innerJoin(modulo, eq(modulo.id, aula.moduloId))
      .innerJoin(curso, eq(curso.id, modulo.cursoId))
      .where(and(isNull(aula.excluidoEm), isNull(modulo.excluidoEm)))
      .orderBy(desc(tentativaDoQuiz.enviadaEm))
  ).filter(
    (l) =>
      (!cursoId || l.cursoId === cursoId) &&
      l.enviadaEm.getTime() >= periodo.de.getTime() &&
      l.enviadaEm.getTime() <= periodo.ate.getTime(),
  )

  const porQuiz = new Map<string, typeof linhas>()
  for (const l of linhas)
    porQuiz.set(l.quizId, [...(porQuiz.get(l.quizId) ?? []), l])

  const quizzes: QuizNoRelatorio[] = [...porQuiz.entries()].map(
    ([quizId, dele]) => {
      const aprovadas = dele.filter((t) => t.estado === 'aprovada').length
      const reprovadas = dele.filter((t) => t.estado === 'reprovada').length
      const porEnunciado = new Map<
        string,
        { respondidas: number; acertos: number }
      >()
      for (const t of dele) {
        const perguntas = lerJson<PerguntaCopiada[]>(t.perguntas, [])
        const respostas = lerJson<Respostas>(t.respostas, {})
        for (const p of perguntas) {
          const certa = acertou(p, respostas)
          if (certa === null) continue
          const chave = p.enunciado.trim()
          const atual = porEnunciado.get(chave) ?? {
            respondidas: 0,
            acertos: 0,
          }
          atual.respondidas += 1
          if (certa) atual.acertos += 1
          porEnunciado.set(chave, atual)
        }
      }
      const corrigidas = aprovadas + reprovadas
      return {
        quizId,
        aulaId: dele[0]?.aulaId ?? '',
        aulaTitulo: dele[0]?.aulaTitulo ?? '',
        cursoNome: dele[0]?.cursoNome ?? '',
        tentativas: dele.length,
        alunos: new Set(dele.map((t) => t.userId)).size,
        aprovadas,
        reprovadas,
        aguardandoCorrecao: dele.length - corrigidas,
        taxaDeAprovacao:
          corrigidas === 0 ? null : Math.round((aprovadas * 100) / corrigidas),
        perguntas: [...porEnunciado.entries()]
          .map(([enunciado, p]) => ({
            enunciado,
            respondidas: p.respondidas,
            acertos: p.acertos,
            percentualDeAcerto: Math.round((p.acertos * 100) / p.respondidas),
          }))
          .sort(
            (a, b) =>
              a.percentualDeAcerto - b.percentualDeAcerto ||
              b.respondidas - a.respondidas,
          ),
      }
    },
  )
  quizzes.sort(
    (a, b) =>
      b.tentativas - a.tentativas ||
      a.aulaTitulo.localeCompare(b.aulaTitulo, 'pt-BR'),
  )
  return { periodo, quizzes }
}

export interface RespostaDeQuiz {
  cursoNome: string
  aulaTitulo: string
  alunoNome: string
  alunoEmail: string
  tentativa: number
  estado: string
  enviadaEm: Date
  pergunta: string
  /** Textos das alternativas que o aluno marcou, separados por " | ". */
  resposta: string
  /** Nulo nas perguntas sem correção automática. */
  acertou: boolean | null
}

/** Uma linha por pergunta de cada tentativa (para o CSV de respostas dos quizzes). */
export async function respostasDosQuizzes(
  db: Banco,
  filtro: FiltroDoRelatorio,
): Promise<RespostaDeQuiz[]> {
  const { periodo } = filtro
  const cursoId = filtro.cursoId || null
  const linhas = (
    await comoLibsql(db)
      .select({
        cursoId: curso.id,
        cursoNome: curso.nome,
        aulaTitulo: aula.titulo,
        alunoNome: user.name,
        alunoEmail: user.email,
        numero: tentativaDoQuiz.numero,
        estado: tentativaDoQuiz.estado,
        perguntas: tentativaDoQuiz.perguntas,
        respostas: tentativaDoQuiz.respostas,
        enviadaEm: tentativaDoQuiz.enviadaEm,
      })
      .from(tentativaDoQuiz)
      .innerJoin(quiz, eq(quiz.id, tentativaDoQuiz.quizId))
      .innerJoin(aula, eq(aula.id, quiz.aulaId))
      .innerJoin(modulo, eq(modulo.id, aula.moduloId))
      .innerJoin(curso, eq(curso.id, modulo.cursoId))
      .innerJoin(user, eq(user.id, tentativaDoQuiz.userId))
      .orderBy(desc(tentativaDoQuiz.enviadaEm))
  ).filter(
    (l) =>
      (!cursoId || l.cursoId === cursoId) &&
      l.enviadaEm.getTime() >= periodo.de.getTime() &&
      l.enviadaEm.getTime() <= periodo.ate.getTime(),
  )
  return linhas.flatMap((t) => {
    const respostas = lerJson<Respostas>(t.respostas, {})
    return lerJson<PerguntaCopiada[]>(t.perguntas, []).map((p) => {
      const marcadas = new Set(respostas[p.id] ?? [])
      return {
        cursoNome: t.cursoNome,
        aulaTitulo: t.aulaTitulo,
        alunoNome: t.alunoNome,
        alunoEmail: t.alunoEmail,
        tentativa: t.numero,
        estado: t.estado,
        enviadaEm: t.enviadaEm,
        pergunta: p.enunciado,
        resposta: p.alternativas
          .filter((a) => marcadas.has(a.id))
          .map((a) => a.texto)
          .join(' | '),
        acertou: acertou(p, respostas),
      }
    })
  })
}
