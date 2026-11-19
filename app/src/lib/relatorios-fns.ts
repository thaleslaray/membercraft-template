import { env } from 'cloudflare:workers'
import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { getDb } from '#/db/index'
import { exigirPermissaoNaSessao } from '#/lib/autorizacao'
import { agora } from '#/lib/relogio'
import { contarComentariosPorCurso } from '#/regras/comentarios'
import { podeFazer, tratarPerfil } from '#/regras/permissoes'
import { pontosDoCurso } from '#/regras/pontos'
import {
  cursosParaFiltro,
  panorama,
  periodoDoRelatorio,
  progressoDosAlunos,
} from '#/regras/relatorios'
import { relatorioDeQuizzes } from '#/regras/relatorios-quizzes'
import { relatorioDeSatisfacao } from '#/regras/relatorios-satisfacao'
import type { Banco } from '#/regras/tipos'

const dia = z.string().max(10).optional()
const cursoId = z.string().max(100).optional()

const filtros = z.object({ de: dia, ate: dia, cursoId })

// Os relatórios são da Equipe (`usar-estudio`); só o Proprietário vê os botões de CSV.
async function equipe() {
  const sessao = await exigirPermissaoNaSessao('usar-estudio')
  return {
    db: getDb(env.DB),
    podeExportar: podeFazer(tratarPerfil(sessao.user.perfil), 'exportar-dados'),
  }
}

// Cada aba lê a lista de cursos (o filtro) e o relatório. Os dois não dependem um do outro, então vão
// juntos. As funções abaixo recebem o banco para o teste de idas (as server functions só conferem a
// permissão antes).

export async function carregarPanorama(
  db: Banco,
  podeExportar: boolean,
  data: z.infer<typeof filtros>,
) {
  const [cursos, dados] = await Promise.all([
    cursosParaFiltro(db),
    panorama(
      db,
      {
        periodo: periodoDoRelatorio(agora(), data.de, data.ate),
        cursoId: data.cursoId,
      },
      { contarComentariosPorCurso },
    ),
  ])
  return { podeExportar, cursos, panorama: dados }
}

export const panoramaFn = createServerFn({ method: 'GET' })
  .validator(filtros)
  .handler(async ({ data }) => {
    const { db, podeExportar } = await equipe()
    return carregarPanorama(db, podeExportar, data)
  })

const filtroDoProgresso = z.object({
  cursoId,
  sumiuHaDias: z.number().int().min(1).max(3650).optional(),
  faixa: z.enum(['0', '1-25', '26-50', '51-75', '76-99', '100']).optional(),
})

export async function carregarProgressoDosAlunos(
  db: Banco,
  podeExportar: boolean,
  data: z.infer<typeof filtroDoProgresso>,
) {
  const lerProgresso = (escolhido: string) =>
    progressoDosAlunos(
      db,
      agora,
      {
        cursoId: escolhido,
        sumiuHaDias: data.sumiuHaDias,
        faixa: data.faixa,
      },
      { pontosDoCurso },
    )
  // Com o curso na busca, a lista de cursos e o progresso saem juntos. Sem ele, o primeiro curso da
  // lista é o escolhido: aí a segunda leitura depende de verdade da primeira.
  if (data.cursoId) {
    const [cursos, progresso] = await Promise.all([
      cursosParaFiltro(db),
      lerProgresso(data.cursoId),
    ])
    return { podeExportar, cursos, cursoId: data.cursoId, progresso }
  }
  const cursos = await cursosParaFiltro(db)
  const escolhido = cursos[0]?.id
  return {
    podeExportar,
    cursos,
    cursoId: escolhido ?? null,
    progresso: escolhido ? await lerProgresso(escolhido) : null,
  }
}

export const progressoDosAlunosFn = createServerFn({ method: 'GET' })
  .validator(filtroDoProgresso)
  .handler(async ({ data }) => {
    const { db, podeExportar } = await equipe()
    return carregarProgressoDosAlunos(db, podeExportar, data)
  })

export async function carregarSatisfacao(
  db: Banco,
  podeExportar: boolean,
  data: z.infer<typeof filtros>,
) {
  const [cursos, relatorio] = await Promise.all([
    cursosParaFiltro(db),
    relatorioDeSatisfacao(db, {
      periodo: periodoDoRelatorio(agora(), data.de, data.ate),
      cursoId: data.cursoId,
    }),
  ])
  return { podeExportar, cursos, relatorio }
}

export const satisfacaoFn = createServerFn({ method: 'GET' })
  .validator(filtros)
  .handler(async ({ data }) => {
    const { db, podeExportar } = await equipe()
    return carregarSatisfacao(db, podeExportar, data)
  })

export async function carregarQuizzes(
  db: Banco,
  podeExportar: boolean,
  data: z.infer<typeof filtros>,
) {
  const [cursos, relatorio] = await Promise.all([
    cursosParaFiltro(db),
    relatorioDeQuizzes(db, {
      periodo: periodoDoRelatorio(agora(), data.de, data.ate),
      cursoId: data.cursoId,
    }),
  ])
  return { podeExportar, cursos, relatorio }
}

export const quizzesFn = createServerFn({ method: 'GET' })
  .validator(filtros)
  .handler(async ({ data }) => {
    const { db, podeExportar } = await equipe()
    return carregarQuizzes(db, podeExportar, data)
  })
