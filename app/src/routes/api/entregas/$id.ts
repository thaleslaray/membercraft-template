import { env } from 'cloudflare:workers'
import { createFileRoute } from '@tanstack/react-router'
import { getDb } from '#/db/index'
import { servirDoBucket } from '#/lib/arquivos-http'
import { exigirPessoaNoPedido, respostaDeErro } from '#/lib/sessao-http'
import { formaDoArquivo } from '#/regras/entregas-do-painel'
import { podeFazer } from '#/regras/permissoes'
import { arquivoDeEntrega } from '#/regras/quiz-correcao'

// Download de arquivo entregue no quiz: só quem entregou e a Equipe que corrige. Não há link
// público. Sem permissão e inexistente respondem igual, para não revelar o que existe.
export const Route = createFileRoute('/api/entregas/$id')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const conferido = await exigirPessoaNoPedido(request)
        if ('erro' in conferido) return conferido.erro
        const { pessoa } = conferido

        const achado = await arquivoDeEntrega(getDb(env.DB), params.id)
        if (
          !achado ||
          !(
            achado.alunoId === pessoa.id ||
            podeFazer(pessoa.perfil, 'corrigir-quiz')
          )
        ) {
          return respostaDeErro(404, 'Arquivo não encontrado.')
        }
        // Imagem raster e PDF abrem na tela (miniatura e visualizador do painel); o resto baixa. O
        // PDF pode ser embutido por página da própria origem (o padrão da casca é negar).
        const forma = formaDoArquivo(achado.tipo)
        return servirDoBucket(achado.chave, {
          naTela: forma !== 'outro',
          cabecalhos:
            forma === 'pdf' ? { 'x-frame-options': 'SAMEORIGIN' } : undefined,
          naoEncontrado: 'Arquivo não encontrado.',
          tipo: achado.tipo,
          nomeDoDownload: achado.nome,
          cache: 'private, no-store',
        })
      },
    },
  },
})
