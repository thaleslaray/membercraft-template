import { type AnyRouter, useRouterState } from '@tanstack/react-router'

// Carregamento de rota com filtro na URL (#107): o esqueleto da página inteira vale só no primeiro
// carregamento. Quem já está na tela e troca de busca, filtro ou página mantém o conteúdo antigo,
// apagado, até o novo chegar.

let roteador: AnyRouter | undefined

/** O roteador do navegador (o servidor não pinta esqueleto). Chamado em `getRouter()`. */
export function registrarRoteador(r: AnyRouter) {
  if (typeof window !== 'undefined') roteador = r
}

/**
 * O `pendingMs` de uma rota com filtro na URL. Com a rota já na tela, `Infinity` (o roteador segura
 * o conteúdo antigo em vez de trocar pelo esqueleto); fora dela, `undefined` (vale o
 * `defaultPendingMs`, que mostra o esqueleto se passar de 300 ms).
 */
export function pendingMsDaRota(rotaId: string): number | undefined {
  return roteador?.state.matches.some((m) => m.routeId === rotaId)
    ? Number.POSITIVE_INFINITY
    : undefined
}

/** Verdadeiro enquanto o roteador carrega algo: a página que segue na tela se apaga (`data-pendente`). */
export function useCarregandoRota(): boolean {
  return useRouterState({ select: (s) => s.isLoading })
}
