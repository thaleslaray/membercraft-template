import { createFileRoute } from '@tanstack/react-router'
import { servirDoBucket } from '#/lib/arquivos-http'
import { exigirPessoaNoPedido, respostaDeErro } from '#/lib/sessao-http'
import { chaveDeImagemValida } from '#/regras/arquivos-de-conteudo'

// Capas e miniaturas: exigem sessão (a área é fechada) e só servem a pasta de imagens.
export const Route = createFileRoute('/api/imagens/$')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const conferido = await exigirPessoaNoPedido(request)
        if ('erro' in conferido) return conferido.erro

        const chave = decodeURIComponent(params._splat ?? '')
        if (!chaveDeImagemValida(chave)) {
          return respostaDeErro(404, 'Imagem não encontrada.')
        }
        return servirDoBucket(chave, {
          naoEncontrado: 'Imagem não encontrada.',
          cache: 'private, max-age=604800, stale-while-revalidate=2592000',
        })
      },
    },
  },
})
