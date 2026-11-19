import { createFileRoute } from '@tanstack/react-router'
import { guardarNoBucket, receberArquivo } from '#/lib/arquivos-http'
import { exigirPessoaNoPedido, respostaDeErro } from '#/lib/sessao-http'
import {
  chaveDoArquivo,
  type FinalidadeDoArquivo,
  LIMITE_DO_MATERIAL,
  validarEnvio,
} from '#/regras/arquivos-de-conteudo'

// Envio de capas e materiais pela Equipe: o arquivo vai direto ao R2 e a rota devolve a chave,
// que a tela grava junto do curso, do módulo ou da aula.
export const Route = createFileRoute('/api/painel/upload')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const conferido = await exigirPessoaNoPedido(request, 'usar-estudio', {
          semCache: true,
        })
        if ('erro' in conferido) return conferido.erro

        const recebido = await receberArquivo(request, LIMITE_DO_MATERIAL)
        if ('erro' in recebido) return recebido.erro
        const { arquivo, formulario } = recebido
        const finalidade = formulario.get('finalidade')
        if (finalidade !== 'imagem' && finalidade !== 'material') {
          return respostaDeErro(400, 'Finalidade inválida.')
        }
        const erro = validarEnvio(finalidade as FinalidadeDoArquivo, {
          tipo: arquivo.type,
          tamanho: arquivo.size,
        })
        if (erro) return respostaDeErro(400, erro)

        const chave = chaveDoArquivo(
          finalidade,
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
