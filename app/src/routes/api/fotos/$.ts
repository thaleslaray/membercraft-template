import { createFileRoute } from '@tanstack/react-router'
import { servirDoBucket } from '#/lib/arquivos-http'
import { exigirPessoaNoPedido, respostaDeErro } from '#/lib/sessao-http'

// Fotos de perfil: a área é fechada, então só quem entrou vê. O nome é gerado pela área
// (aluno-instante.extensão); nada fora desse formato é procurado no R2.
const NOME = /^arquivo\/([\w-]+-\d+\.(?:png|jpg|webp|gif))$/
const TIPOS: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
}

export const Route = createFileRoute('/api/fotos/$')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const conferido = await exigirPessoaNoPedido(request)
        if ('erro' in conferido) return conferido.erro
        const nome = NOME.exec(params._splat ?? '')?.[1]
        if (!nome) return respostaDeErro(404, 'Foto não encontrada.')
        return servirDoBucket(`fotos/${nome}`, {
          naoEncontrado: 'Foto não encontrada.',
          tipoDeReserva: TIPOS[nome.split('.').pop() ?? ''],
          cache: 'private, max-age=31536000, immutable',
        })
      },
    },
  },
})
