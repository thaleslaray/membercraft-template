import { createFileRoute, redirect } from '@tanstack/react-router'
import { cursoDaEdicaoFn } from '#/lib/curso-abas-fns'

// A liberação virou aba do curso. Link antigo com `?turma=` leva à aba do curso daquela edição.
export const Route = createFileRoute('/painel/liberacao')({
  validateSearch: (search: Record<string, unknown>): { turma?: string } =>
    typeof search.turma === 'string' && search.turma
      ? { turma: search.turma }
      : {},
  beforeLoad: async ({ search }) => {
    const cursoId = search.turma
      ? await cursoDaEdicaoFn({ data: { turmaId: search.turma } })
      : null
    if (cursoId) {
      throw redirect({
        to: '/painel/conteudo/$cursoId',
        params: { cursoId },
        search: { aba: 'liberacao', edicao: search.turma },
      })
    }
    throw redirect({ to: '/painel/conteudo' })
  },
})
