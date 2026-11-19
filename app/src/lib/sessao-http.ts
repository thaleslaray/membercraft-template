import { sessaoDoBancoNoPedido } from '#/lib/autorizacao'
import { getRequestSession } from '#/lib/request-session'
import { type Acao, podeFazer, tratarPerfil } from '#/regras/permissoes'

// Para rotas de servidor (download, upload): a sessão do pedido, com o perfil já tratado.
// `semCache: true` lê do banco, sem o cache do cookie (ações sensíveis da Equipe).
export async function pessoaDoPedido(
  request: Request,
  opcoes: { semCache?: boolean } = {},
) {
  const sessao = opcoes.semCache
    ? await sessaoDoBancoNoPedido(request)
    : await getRequestSession(request)
  if (!sessao) return null
  return { id: sessao.user.id, perfil: tratarPerfil(sessao.user.perfil) }
}

export function respostaDeErro(status: number, mensagem: string): Response {
  return new Response(JSON.stringify({ erro: mensagem }), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  })
}

/** Confere sessão e permissão; devolve a pessoa ou a resposta de erro (401/403) a enviar. */
export async function exigirPessoaNoPedido(
  request: Request,
  acao?: Acao,
  opcoes: { semCache?: boolean } = {},
): Promise<
  | { pessoa: NonNullable<Awaited<ReturnType<typeof pessoaDoPedido>>> }
  | { erro: Response }
> {
  const pessoa = await pessoaDoPedido(request, opcoes)
  if (!pessoa) return { erro: respostaDeErro(401, 'Entre para continuar.') }
  if (acao && !podeFazer(pessoa.perfil, acao)) {
    return { erro: respostaDeErro(403, 'Sem permissão.') }
  }
  return { pessoa }
}
