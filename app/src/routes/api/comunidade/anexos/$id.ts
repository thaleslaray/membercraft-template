import { env } from 'cloudflare:workers'
import { createFileRoute } from '@tanstack/react-router'
import { getDb } from '#/db/index'
import { servirDoBucket } from '#/lib/arquivos-http'
import { exigirPessoaNoPedido, respostaDeErro } from '#/lib/sessao-http'
import { anexoVisivel } from '#/regras/publicacoes'

// Download de anexo de publicação: só com sessão e acesso à comunidade da publicação.
export const Route = createFileRoute('/api/comunidade/anexos/$id')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const conferido = await exigirPessoaNoPedido(request)
        if ('erro' in conferido) return conferido.erro

        const anexo = await anexoVisivel(
          getDb(env.DB),
          () => new Date(),
          conferido.pessoa,
          params.id,
        )
        // Sem acesso e inexistente respondem igual, para não revelar o que existe.
        if (!anexo) return respostaDeErro(404, 'Anexo não encontrado.')
        return servirDoBucket(anexo.chave, {
          naoEncontrado: 'Anexo não encontrado.',
          tipo: 'application/octet-stream',
          nomeDoDownload: anexo.nome,
          cache: 'private, no-store',
          cabecalhos: { 'x-content-type-options': 'nosniff' },
        })
      },
    },
  },
})
