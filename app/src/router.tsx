import { createRouter as createTanStackRouter } from '@tanstack/react-router'
import { setupRouterSsrQueryIntegration } from '@tanstack/react-router-ssr-query'
import { createIsomorphicFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import { aplicarEstadosDoPainel } from '#/components/painel/estados'
import { getContext } from '#/integrations/tanstack-query/root-provider'
import { registrarRoteador } from '#/lib/carregamento-da-rota'
import { tiposDaTroca } from '#/lib/troca-de-tela'
import { routeTree } from '#/routeTree.gen'

// Nonce desta resposta (src/server.ts o põe no cabeçalho interno `x-csp-nonce`). Só existe no servidor:
// o navegador não precisa dele depois de hidratar.
const nonceDoPedido = createIsomorphicFn()
  .server(() => getRequest().headers.get('x-csp-nonce') ?? undefined)
  .client(() => undefined)

// Aba aberta desde antes de um deploy pede um arquivo JS com o hash antigo, que não existe mais (o
// servidor responde 404 de verdade). O Vite avisa com `vite:preloadError`: recarrega a página UMA vez
// para pegar a versão nova. A marca no `sessionStorage` evita o laço se o arquivo faltar de verdade.
const RECARGA_POR_VERSAO = 'recarga-por-versao'
function recarregarSeAVersaoMudou() {
  if (typeof window === 'undefined') return
  window.addEventListener('vite:preloadError', (evento) => {
    let ultima = 0
    try {
      ultima = Number(sessionStorage.getItem(RECARGA_POR_VERSAO)) || 0
      if (Date.now() - ultima < 60_000) return
      sessionStorage.setItem(RECARGA_POR_VERSAO, String(Date.now()))
    } catch {
      // Sem `sessionStorage` não há como garantir "uma vez": deixa o erro seguir.
      return
    }
    evento.preventDefault()
    window.location.reload()
  })
}
recarregarSeAVersaoMudou()

export function getRouter() {
  const context = getContext()

  const router = createTanStackRouter({
    routeTree,
    context,
    scrollRestoration: true,
    // Troca de tela com direção (#89): o tipo (avancar | voltar | esmaecer) vira o movimento em styles.css.
    defaultViewTransition: {
      types: ({ fromLocation, toLocation }) =>
        tiposDaTroca(fromLocation?.pathname, toLocation.pathname),
    },
    // Esqueletos (#107): só aparecem se a tela demorar mais de 300 ms e, uma vez à vista, ficam pelo
    // menos 500 ms, para não piscar. Só vale para rotas com `pendingComponent`.
    defaultPendingMs: 300,
    defaultPendingMinMs: 500,
    defaultPreload: 'intent',
    // O que o pré-carregamento (passar o mouse no link) trouxe vale por 30 s (o padrão do TanStack
    // Router): o clique usa o dado em mãos em vez de buscar de novo. Com 0, o dado vencia na hora e
    // o clique refazia tudo. Quem muda dado chama `router.invalidate()`, que descarta esse cache.
    defaultPreloadStaleTime: 30_000,
    ssr: { nonce: nonceDoPedido() },
  })

  registrarRoteador(router)
  // Carregando, erro e não encontrado do painel em todas as rotas da equipe, dentro da casca.
  aplicarEstadosDoPainel(router)
  setupRouterSsrQueryIntegration({ router, queryClient: context.queryClient })

  return router
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
