import { env } from 'cloudflare:workers'
import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { getDb } from '#/db/index'
import { exigirPermissaoNaSessao } from '#/lib/autorizacao'
import { carregarCursoDoPainel } from '#/lib/conteudo-fns'
import {
  alunosDoCurso,
  cursoDaTurma,
  edicoesDoCurso,
  liberacaoDoCurso,
  nomeDoCurso,
  quemCompraDoCurso,
  totalDeAlunos,
} from '#/regras/curso-do-painel'
import { ABAS_DO_CURSO, type AbaDoCurso } from '#/regras/grupo-de-ligacoes'
import type { Banco } from '#/regras/tipos'

const id = z.string().min(1).max(100)

// Página do curso: o cabeçalho (nome, total de alunos, edições para os links das abas) mais SÓ os dados da aba
// aberta, tudo numa rodada (exportada para o teste de idas).
export async function carregarCursoComAba(
  db: Banco,
  cursoId: string,
  aba: AbaDoCurso,
  edicao?: string,
) {
  const [total, edicoes, nome, conteudo, quemCompra, liberacao, alunos] =
    await Promise.all([
      totalDeAlunos(db, cursoId),
      edicoesDoCurso(db, cursoId),
      aba === 'conteudo' ? null : nomeDoCurso(db, cursoId),
      aba === 'conteudo' ? carregarCursoDoPainel(db, cursoId) : null,
      aba === 'quem-compra' ? quemCompraDoCurso(db, cursoId) : null,
      aba === 'liberacao' ? liberacaoDoCurso(db, cursoId, edicao) : null,
      aba === 'alunos' ? alunosDoCurso(db, cursoId) : null,
    ])
  return {
    aba,
    total,
    edicoes,
    nome: conteudo?.completo?.curso.nome ?? nome,
    conteudo,
    quemCompra,
    liberacao,
    alunos,
  }
}

export const cursoComAbaFn = createServerFn({ method: 'GET' })
  .validator(
    z.object({
      id,
      aba: z.enum(ABAS_DO_CURSO),
      edicao: id.optional(),
    }),
  )
  .handler(async ({ data }) => {
    await exigirPermissaoNaSessao('usar-estudio')
    await exigirPermissaoNaSessao('gerir-matriculas')
    return carregarCursoComAba(getDb(env.DB), data.id, data.aba, data.edicao)
  })

// Links antigos (`/painel/liberacao?turma=`): de que curso é a edição.
export const cursoDaEdicaoFn = createServerFn({ method: 'GET' })
  .validator(z.object({ turmaId: id }))
  .handler(async ({ data }) => {
    await exigirPermissaoNaSessao('gerir-matriculas')
    return cursoDaTurma(getDb(env.DB), data.turmaId)
  })
