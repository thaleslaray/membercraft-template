import { env } from 'cloudflare:workers'
import { createFileRoute } from '@tanstack/react-router'
import { getDb } from '#/db/index'
import { guardarNoBucket, receberArquivo } from '#/lib/arquivos-http'
import { escritaLimitada, MENSAGEM_DE_ESCRITA_LIMITADA } from '#/lib/rate-limit'
import { exigirPessoaNoPedido, respostaDeErro } from '#/lib/sessao-http'
import { podeAcessarCurso } from '#/regras/acesso-ao-curso'
import {
  chaveDeEntrega,
  LIMITE_DO_ENVIO_PELO_WORKER,
  validarArquivoDeEntrega,
} from '#/regras/entregas'
import { cursoDaAula } from '#/regras/progresso'

// Envio de arquivo da entrega do quiz PELO WORKER. É o caminho do dev e do e2e local, onde o R2 não
// tem endpoint S3; no ambiente remoto o navegador manda direto ao R2 por URL assinada
// (`prepararEnvioDeArquivoFn`), sem passar por aqui. Por isso o limite é menor (90 MB).
export const Route = createFileRoute('/api/quiz/entregas')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const conferido = await exigirPessoaNoPedido(request)
        if ('erro' in conferido) return conferido.erro
        const { pessoa } = conferido
        if (await escritaLimitada(pessoa.id)) {
          return respostaDeErro(429, MENSAGEM_DE_ESCRITA_LIMITADA)
        }

        const recebido = await receberArquivo(
          request,
          LIMITE_DO_ENVIO_PELO_WORKER,
        )
        if ('erro' in recebido) return recebido.erro
        const { arquivo, formulario } = recebido
        const aulaId = formulario.get('aulaId')
        if (typeof aulaId !== 'string' || !aulaId) {
          return respostaDeErro(400, 'Aula inválida.')
        }
        const db = getDb(env.DB)
        const cursoId = await cursoDaAula(db, aulaId)
        if (
          !cursoId ||
          !(await podeAcessarCurso(db, () => new Date(), pessoa, cursoId))
        ) {
          return respostaDeErro(404, 'Aula não encontrada.')
        }
        const erro = validarArquivoDeEntrega(
          { tamanho: arquivo.size },
          'worker',
        )
        if (erro) return respostaDeErro(400, erro)

        const chave = chaveDeEntrega(
          pessoa.id,
          arquivo.name,
          crypto.randomUUID(),
        )
        const tipo = await guardarNoBucket(chave, arquivo)
        return Response.json({ chave, nome: arquivo.name, tipo })
      },
    },
  },
})
