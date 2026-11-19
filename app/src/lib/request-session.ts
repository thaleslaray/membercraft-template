// A sessão do pedido, lida UMA vez. Na renderização no servidor, o guard da rota e o loader da página
// chamam server functions que precisam da sessão; sem isto cada uma repetia a leitura (com o cache do
// cookie vencido, são idas ao D1 em fila). A chave é o próprio `Request`: some junto com ele, então
// nada vaza de um pedido para outro.
//
// SÓ para leituras comuns. Ação sensível e escrita no usuário continuam usando `disableCookieCache: true`
// (veja `autorizacao.ts`).
import { env } from 'cloudflare:workers'
import { getRequest } from '@tanstack/react-start/server'

import { getAuth } from '#/lib/auth'

type Sessao = ReturnType<ReturnType<typeof getAuth>['api']['getSession']>

const porPedido = new WeakMap<Request, Sessao>()

export function getRequestSession(request: Request = getRequest()): Sessao {
  let sessao = porPedido.get(request)
  if (!sessao) {
    sessao = getAuth(env).api.getSession({ headers: request.headers })
    porPedido.set(request, sessao)
  }
  return sessao
}
