import { env } from 'cloudflare:workers'
import { createFileRoute } from '@tanstack/react-router'
import { getDb } from '#/db/index'
import { exigirPessoaNoPedido, respostaDeErro } from '#/lib/sessao-http'
import { exportarCsv } from '#/regras/exportacao-csv'
import { pontosDosAlunos, rankingCompleto } from '#/regras/pontos'
import type { FaixaDeProgresso } from '#/regras/relatorios'
import { ErroDeRelatorio } from '#/regras/relatorios'

// Exportação em CSV dos relatórios, do ranking e das respostas dos quizzes: só o Proprietário
// (`exportar-dados`), e cada download entra no registro de ações.
export const Route = createFileRoute('/api/painel/exportar')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const conferido = await exigirPessoaNoPedido(
          request,
          'exportar-dados',
          {
            semCache: true,
          },
        )
        if ('erro' in conferido) return conferido.erro

        const q = new URL(request.url).searchParams
        const sumiu = Number(q.get('sumiuHaDias'))
        try {
          const arquivo = await exportarCsv(
            getDb(env.DB),
            () => new Date(),
            conferido.pessoa.id,
            {
              tipo: q.get('tipo') ?? '',
              de: q.get('de'),
              ate: q.get('ate'),
              cursoId: q.get('cursoId'),
              sumiuHaDias: Number.isInteger(sumiu) && sumiu > 0 ? sumiu : null,
              faixa: (q.get('faixa') || null) as FaixaDeProgresso | null,
            },
            {
              pontosDosAlunos,
              // O ranking completo (#54): geral, ou do curso pedido.
              ranking: (db, cursoId) =>
                rankingCompleto(db, () => new Date(), cursoId),
            },
          )
          return new Response(arquivo.conteudo, {
            headers: {
              'content-type': 'text/csv; charset=utf-8',
              'content-disposition': `attachment; filename="${arquivo.nome}"`,
              'cache-control': 'no-store',
            },
          })
        } catch (e) {
          if (e instanceof ErroDeRelatorio)
            return respostaDeErro(400, e.message)
          throw e
        }
      },
    },
  },
})
