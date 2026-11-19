import { env } from 'cloudflare:workers'
import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { getDb } from '#/db/index'
import {
  exigirPermissaoNaSessao,
  pessoaLogadaNaSessao,
} from '#/lib/autorizacao'
import { verificarCertificados } from '#/lib/certificados-cola'
import { avisarNoSininho } from '#/lib/notificacoes-cola'
import { agora } from '#/lib/relogio'
import {
  cursosDoRanking,
  darPontosAvulsos,
  extratoDoAluno,
  LIMITE_DO_AVULSO,
  LIMITE_DO_MOTIVO,
  ranking,
  ultimosLancamentos,
} from '#/regras/pontos'
import { cursosParaFiltro } from '#/regras/relatorios'
import type { Banco } from '#/regras/tipos'

const id = z.string().min(1).max(100)

// "Meus pontos": o extrato de quem está logado.
export const meusPontosFn = createServerFn({ method: 'GET' })
  .validator(z.object({ pagina: z.number().int().min(1).optional() }))
  .handler(async ({ data }) =>
    extratoDoAluno(
      getDb(env.DB),
      (await pessoaLogadaNaSessao()).id,
      data.pagina,
    ),
  )

// Ranking geral (sem curso) ou de um curso em que o aluno tem matrícula ativa: os 10 primeiros e a
// posição de quem olha, mais os 3 últimos lançamentos dele.
export const rankingFn = createServerFn({ method: 'GET' })
  .validator(z.object({ cursoId: id.optional() }))
  .handler(async ({ data }) => {
    const userId = (await pessoaLogadaNaSessao()).id
    const db = getDb(env.DB)
    const cursos = await cursosDoRanking(db, agora, userId)
    const cursoId = cursos.some((c) => c.id === data.cursoId)
      ? (data.cursoId ?? null)
      : null
    return {
      cursos,
      cursoId,
      ...(await ranking(db, agora, { cursoId, userId })),
      ultimos: await ultimosLancamentos(db, userId),
    }
  })

// O extrato e a lista de cursos não dependem um do outro: vão juntos (exportada para o teste de idas).
export async function carregarPontosDoAlunoNoPainel(
  db: Banco,
  alunoId: string,
) {
  const [extrato, cursos] = await Promise.all([
    extratoDoAluno(db, alunoId),
    cursosParaFiltro(db),
  ])
  return { extrato, cursos }
}

// Painel do aluno: o extrato dele e os cursos para escolher onde dar pontos.
export const pontosDoAlunoNoPainelFn = createServerFn({ method: 'GET' })
  .validator(z.object({ alunoId: id }))
  .handler(async ({ data }) => {
    await exigirPermissaoNaSessao('usar-estudio')
    return carregarPontosDoAlunoNoPainel(getDb(env.DB), data.alunoId)
  })

// A Equipe dá (positivo) ou tira (negativo) pontos, com motivo; o aluno é avisado no sininho.
export const darPontosFn = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      alunoId: id,
      cursoId: id.nullable(),
      pontos: z.number().int().min(-LIMITE_DO_AVULSO).max(LIMITE_DO_AVULSO),
      motivo: z.string().max(LIMITE_DO_MOTIVO + 100),
    }),
  )
  .handler(async ({ data }) => {
    const sessao = await exigirPermissaoNaSessao('usar-estudio')
    const { texto } = await darPontosAvulsos(getDb(env.DB), agora, {
      autorId: sessao.user.id,
      ...data,
    })
    await avisarNoSininho(env, {
      userId: data.alunoId,
      tipo: 'pontos',
      texto,
      link: '/pontos',
    })
    // Pontos a mais podem completar a exigência do certificado (#55).
    if (data.pontos > 0) {
      await verificarCertificados(env, data.alunoId, data.cursoId)
    }
    return true
  })
