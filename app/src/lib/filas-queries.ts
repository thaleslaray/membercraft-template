import { queryOptions } from '@tanstack/react-query'
import { contadoresDasFilasFn } from '#/lib/equipe-fns'

// Contadores das filas no menu do painel; renova sozinho a cada minuto.
export const filasQuery = queryOptions({
  queryKey: ['painel', 'filas'],
  queryFn: () => contadoresDasFilasFn(),
  staleTime: 30_000,
  refetchInterval: 60_000,
})
