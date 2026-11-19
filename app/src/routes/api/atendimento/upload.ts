import { createFileRoute } from '@tanstack/react-router'
import { guardarNoBucket, receberArquivo } from '#/lib/arquivos-http'
import { escritaLimitada, MENSAGEM_DE_ESCRITA_LIMITADA } from '#/lib/rate-limit'
import { exigirPessoaNoPedido, respostaDeErro } from '#/lib/sessao-http'
import {
  chaveDoAnexo,
  LIMITE_DA_IMAGEM,
  validarImagem,
} from '#/regras/atendimento'

// Imagem anexada a uma mensagem do Atendimento (aluno ou equipe): vai ao R2 e a rota devolve a
// chave, que a mensagem guarda. O dono (quem enviou) vai no caminho: ninguém anexa imagem de outro.
export const Route = createFileRoute('/api/atendimento/upload')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const conferido = await exigirPessoaNoPedido(request)
        if ('erro' in conferido) return conferido.erro
        if (await escritaLimitada(conferido.pessoa.id)) {
          return respostaDeErro(429, MENSAGEM_DE_ESCRITA_LIMITADA)
        }

        const recebido = await receberArquivo(
          request,
          LIMITE_DA_IMAGEM,
          'Escolha uma imagem.',
        )
        if ('erro' in recebido) return recebido.erro
        const { arquivo } = recebido
        const erro = validarImagem({
          tipo: arquivo.type,
          tamanho: arquivo.size,
        })
        if (erro) return respostaDeErro(400, erro)

        const chave = chaveDoAnexo(
          conferido.pessoa.id,
          crypto.randomUUID(),
          arquivo.name,
        )
        await guardarNoBucket(chave, arquivo)
        return Response.json({ chave, nome: arquivo.name })
      },
    },
  },
})
