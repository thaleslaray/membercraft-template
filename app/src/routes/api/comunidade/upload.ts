import { env } from 'cloudflare:workers'
import { createFileRoute } from '@tanstack/react-router'
import { getDb } from '#/db/index'
import { guardarNoBucket, receberArquivo } from '#/lib/arquivos-http'
import { escritaLimitada, MENSAGEM_DE_ESCRITA_LIMITADA } from '#/lib/rate-limit'
import { exigirPessoaNoPedido, respostaDeErro } from '#/lib/sessao-http'
import {
  chaveDoEnvio,
  type FinalidadeDoEnvio,
  LIMITE_DO_ANEXO,
  validarEnvioDaComunidade,
} from '#/regras/anexos-da-comunidade'
import { comunidadesVisiveis } from '#/regras/comunidades'

// Envio de imagens do texto e de anexos das publicações: qualquer pessoa que participa de alguma
// comunidade. O arquivo vai ao R2 e a rota devolve a chave; a tela a manda de volta ao publicar.
export const Route = createFileRoute('/api/comunidade/upload')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const conferido = await exigirPessoaNoPedido(request)
        if ('erro' in conferido) return conferido.erro
        const { pessoa } = conferido
        if (await escritaLimitada(pessoa.id)) {
          return respostaDeErro(429, MENSAGEM_DE_ESCRITA_LIMITADA)
        }

        const comunidades = await comunidadesVisiveis(
          getDb(env.DB),
          () => new Date(),
          pessoa,
        )
        if (comunidades.length === 0) {
          return respostaDeErro(403, 'Sem permissão.')
        }

        const recebido = await receberArquivo(request, LIMITE_DO_ANEXO)
        if ('erro' in recebido) return recebido.erro
        const { arquivo, formulario } = recebido
        const finalidade = formulario.get('finalidade')
        if (finalidade !== 'imagem' && finalidade !== 'anexo') {
          return respostaDeErro(400, 'Finalidade inválida.')
        }
        const erro = validarEnvioDaComunidade(finalidade as FinalidadeDoEnvio, {
          tipo: arquivo.type,
          tamanho: arquivo.size,
        })
        if (erro) return respostaDeErro(400, erro)

        const chave = chaveDoEnvio(
          finalidade,
          pessoa.id,
          arquivo.name,
          crypto.randomUUID(),
        )
        const tipo = await guardarNoBucket(chave, arquivo)
        return Response.json({
          chave,
          nome: arquivo.name,
          tipo,
          tamanho: arquivo.size,
        })
      },
    },
  },
})
