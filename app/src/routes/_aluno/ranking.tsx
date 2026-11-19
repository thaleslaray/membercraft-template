import { createFileRoute, redirect } from '@tanstack/react-router'
import { buscaDoRankingAntigo } from '#/lib/aba-da-comunidade'

// O ranking agora é a aba da Comunidade. Esta rota só mantém o link antigo vivo (inclusive
// `?curso=`): leva à aba e troca a entrada no histórico, para o "voltar" não cair aqui de novo.
export const Route = createFileRoute('/_aluno/ranking')({
  validateSearch: (s: Record<string, unknown>): { curso?: string } => ({
    curso: typeof s.curso === 'string' && s.curso ? s.curso : undefined,
  }),
  beforeLoad: ({ search }) => {
    throw redirect({
      to: '/comunidades',
      search: buscaDoRankingAntigo(search.curso),
      replace: true,
    })
  },
})
