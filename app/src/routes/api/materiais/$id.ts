import { env } from 'cloudflare:workers'
import { createFileRoute } from '@tanstack/react-router'
import { getDb } from '#/db/index'
import { servirDoBucket } from '#/lib/arquivos-http'
import { opcoesDeAcesso } from '#/lib/liberacao'
import { exigirPessoaNoPedido, respostaDeErro } from '#/lib/sessao-http'
import { situacaoDoConteudo } from '#/regras/acesso'
import { podeAcessarCurso } from '#/regras/acesso-ao-curso'
import { materialComCurso } from '#/regras/conteudo'

// Download de material de aula: só com sessão e acesso ao curso. Não existe link público.
export const Route = createFileRoute('/api/materiais/$id')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const conferido = await exigirPessoaNoPedido(request)
        if ('erro' in conferido) return conferido.erro

        const db = getDb(env.DB)
        const achado = await materialComCurso(db, params.id)
        // Sem acesso e inexistente respondem igual, para não revelar o que existe.
        if (
          !achado ||
          !(await podeAcessarCurso(
            db,
            () => new Date(),
            conferido.pessoa,
            achado.cursoId,
          ))
        ) {
          return respostaDeErro(404, 'Material não encontrado.')
        }
        // Material de aula oculta ou com cadeado também não baixa (#42).
        const situacao = await situacaoDoConteudo(
          db,
          () => new Date(),
          conferido.pessoa,
          { tipo: 'aula', id: achado.material.aulaId },
          opcoesDeAcesso(db, conferido.pessoa),
        )
        if (situacao.tipo !== 'liberado') {
          return respostaDeErro(404, 'Material não encontrado.')
        }
        return servirDoBucket(achado.material.chave, {
          naoEncontrado: 'Material não encontrado.',
          tipo: achado.material.tipo,
          nomeDoDownload: achado.material.nome,
          cache: 'private, no-store',
        })
      },
    },
  },
})
