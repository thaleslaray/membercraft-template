import { env } from 'cloudflare:workers'
import { createFileRoute } from '@tanstack/react-router'
import { getDb } from '#/db/index'
import { servirDoBucket } from '#/lib/arquivos-http'
import { exigirPessoaNoPedido, respostaDeErro } from '#/lib/sessao-http'
import { donoDoAnexo, podeVerAnexo } from '#/regras/atendimento'
import { podeFazer } from '#/regras/permissoes'

// Imagens do Atendimento: só a equipe, o dono da conversa e quem acabou de enviar a imagem.
export const Route = createFileRoute('/api/atendimento/anexo/$')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const conferido = await exigirPessoaNoPedido(request)
        if ('erro' in conferido) return conferido.erro
        const { pessoa } = conferido

        const chave = decodeURIComponent(params._splat ?? '')
        if (!donoDoAnexo(chave)) {
          return respostaDeErro(404, 'Imagem não encontrada.')
        }
        const permitido = await podeVerAnexo(getDb(env.DB), chave, {
          id: pessoa.id,
          equipe: podeFazer(pessoa.perfil, 'usar-estudio'),
        })
        if (!permitido) return respostaDeErro(404, 'Imagem não encontrada.')
        return servirDoBucket(chave, {
          naoEncontrado: 'Imagem não encontrada.',
          cache: 'private, max-age=3600',
        })
      },
    },
  },
})
