import { env } from 'cloudflare:workers'
import { getRequest } from '@tanstack/react-start/server'

import { getAuth } from '#/lib/auth'
import { getRequestSession } from '#/lib/request-session'
import {
  type Acao,
  exigirPermissao,
  type Pessoa,
  tratarPerfil,
} from '#/regras/permissoes'
import { precisaRenovar } from '#/regras/sessao'

type Sessao = ReturnType<ReturnType<typeof getAuth>['api']['getSession']>

// A sessão lida do banco, UMA vez por pedido. Na renderização no servidor, o guard do painel e o loader
// da página chamam server functions que conferem a permissão; sem isto cada uma repetia o `select user`
// (idas ao D1 em fila). A chave é o próprio `Request`: some junto com ele, então nada vaza de um pedido
// para outro, e cada chamada de server function vinda do navegador é um pedido novo (lê do banco). A
// permissão da ação continua sendo conferida em CADA chamada, depois de aguardar a sessão.
const lidaDoBanco = new WeakMap<Request, Sessao>()

async function sessaoLidaDoBanco(request: Request): Sessao {
  const headers = request.headers
  // Lê do banco (sem o cache do cookie): rebaixar alguém de perfil vale na hora. `disableRefresh`: o
  // Better Auth decide renovar com o teto global de 30 dias, e a sessão da Equipe (7 dias) sempre cai
  // nessa conta, o que gravava a sessão no D1 em TODA leitura (um `update session` em fila, ~50 ms).
  // Quem decide a renovação aqui é `precisaRenovar`, com o prazo do perfil.
  // Obs.: com `disableRefresh` o Better Auth também não regrava o cookie de cache da sessão; aqui não
  // faz falta (esta leitura nunca usa o cache). Por isso `getRequestSession` NÃO usa `disableRefresh`.
  const sessao = await getAuth(env).api.getSession({
    headers,
    query: { disableCookieCache: true, disableRefresh: true },
  })
  if (
    sessao &&
    // "Entrar como" vale 1 hora e não renova.
    !(sessao.session as { impersonatedBy?: string | null }).impersonatedBy &&
    precisaRenovar(
      tratarPerfil(sessao.user.perfil),
      sessao.session.expiresAt,
      new Date(),
    )
  ) {
    // Passou 1 dia de uso: renova de verdade (o hook `update.before` põe o prazo do perfil).
    await getAuth(env).api.getSession({
      headers,
      query: { disableCookieCache: true },
    })
  }
  return sessao
}

// A sessão lida do banco (sem cache do cookie), uma vez por pedido.
export function sessaoDoBancoNoPedido(request: Request): Sessao {
  let lida = lidaDoBanco.get(request)
  if (!lida) {
    lida = sessaoLidaDoBanco(request)
    lidaDoBanco.set(request, lida)
  }
  return lida
}

// Para server functions: confere a sessão e a permissão da ação e devolve a sessão.
// Lança erro (a função falha) se não houver sessão ou o perfil não puder.
export async function exigirPermissaoNaSessao(acao: Acao) {
  const sessao = await sessaoDoBancoNoPedido(getRequest())
  if (!sessao) throw new Error('Entre para continuar.')
  exigirPermissao(tratarPerfil(sessao.user.perfil), acao)
  return sessao
}

export interface PessoaLogada extends Pessoa {
  /** Fuso do aluno (Minha conta); nulo = Brasília. */
  fuso: string | null
}

// Para server functions de qualquer pessoa logada: quem é, com o perfil já tratado. Lança se não há
// sessão. Um só lugar para isso (cada `*-fns.ts` tinha a sua cópia).
//
// `semCache: true` lê do banco (sem o cache do cookie): para ações sensíveis da Equipe, em que rebaixar
// alguém precisa valer na hora.
export async function pessoaLogadaNaSessao(
  opcoes: { semCache?: boolean } = {},
): Promise<PessoaLogada> {
  const sessao = opcoes.semCache
    ? await sessaoDoBancoNoPedido(getRequest())
    : await getRequestSession()
  if (!sessao) throw new Error('Entre para continuar.')
  return {
    id: sessao.user.id,
    perfil: tratarPerfil(sessao.user.perfil),
    fuso: (sessao.user as { fusoHorario?: string | null }).fusoHorario ?? null,
  }
}

// Depois de gravar no usuário direto no banco (perfil, termos, tour, foto, dados da conta): relê do D1 e
// regrava o cookie de cache, para a próxima leitura da própria pessoa já vir atualizada.
export async function renovarSessaoNoCookie(): Promise<void> {
  await getAuth(env).api.getSession({
    headers: getRequest().headers,
    query: { disableCookieCache: true },
  })
}
