import { env } from 'cloudflare:workers'
import { createFileRoute } from '@tanstack/react-router'
import { getDb } from '#/db/index'
import { servirDoBucket } from '#/lib/arquivos-http'
import { exigirPessoaNoPedido, respostaDeErro } from '#/lib/sessao-http'
import { pdfParaBaixar } from '#/regras/certificados'

// Download do PDF do certificado: só o dono, com o PDF pronto e o certificado sem revogação.
// Não confere matrícula: o aluno baixa mesmo com o acesso expirado.
export const Route = createFileRoute('/api/certificados/$id')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const conferido = await exigirPessoaNoPedido(request)
        if ('erro' in conferido) return conferido.erro
        const pdf = await pdfParaBaixar(
          getDb(env.DB),
          conferido.pessoa.id,
          params.id,
        )
        if (!pdf) return respostaDeErro(404, 'Certificado não encontrado.')
        return servirDoBucket(pdf.chave, {
          naoEncontrado: 'O PDF ainda não está pronto.',
          tipo: 'application/pdf',
          nomeDoDownload: pdf.nomeDoArquivo,
          cache: 'private, no-store',
        })
      },
    },
  },
})
