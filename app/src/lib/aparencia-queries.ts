import { queryOptions, useSuspenseQuery } from '@tanstack/react-query'

import { getAparenciaFn } from '#/lib/aparencia-fns'

// Carregada pela raiz (__root.tsx) antes de qualquer página; muda só quando o Proprietário salva.
export const aparenciaQuery = queryOptions({
  queryKey: ['aparencia'],
  queryFn: () => getAparenciaFn(),
  staleTime: 5 * 60_000,
})

/** A aparência em vigor. A raiz já garantiu o dado, então nunca suspende de verdade. */
export function useAparencia() {
  return useSuspenseQuery(aparenciaQuery).data
}
