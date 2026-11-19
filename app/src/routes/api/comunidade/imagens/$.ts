import { createFileRoute } from '@tanstack/react-router'
import { servirDoBucket } from '#/lib/arquivos-http'
import { exigirPessoaNoPedido, respostaDeErro } from '#/lib/sessao-http'
import {
  chaveDeImagemDaComunidadeValida,
  PREFIXO_DAS_IMAGENS_DA_COMUNIDADE,
} from '#/regras/anexos-da-comunidade'

// Imagens do texto das publicações: exigem sessão e só servem a pasta de imagens da comunidade.
export const Route = createFileRoute('/api/comunidade/imagens/$')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const conferido = await exigirPessoaNoPedido(request)
        if ('erro' in conferido) return conferido.erro

        const chave = `${PREFIXO_DAS_IMAGENS_DA_COMUNIDADE}${decodeURIComponent(params._splat ?? '')}`
        if (!chaveDeImagemDaComunidadeValida(chave)) {
          return respostaDeErro(404, 'Imagem não encontrada.')
        }
        return servirDoBucket(chave, {
          naoEncontrado: 'Imagem não encontrada.',
          cache: 'private, max-age=3600',
          cabecalhos: { 'x-content-type-options': 'nosniff' },
        })
      },
    },
  },
})
