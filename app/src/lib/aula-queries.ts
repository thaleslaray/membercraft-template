import { infiniteQueryOptions, queryOptions } from '@tanstack/react-query'

import { avaliacaoDaAulaFn } from '#/lib/avaliacoes-fns'
import { comentariosDaAulaFn } from '#/lib/comentarios-fns'

// A nota e os comentários da aula chegam junto com a página (`paginaDaAulaFn`): o loader grava os dois
// no cache com `setQueryData` e os componentes os leem daqui, sem outro pedido ao abrir a aula.
// O `staleTime` evita que a montagem refaça a busca que o loader acabou de fazer; gravar, comentar
// ou excluir continuam usando `invalidateQueries`, que busca de novo na hora.
export const TEMPO_DA_PAGINA_DA_AULA = 30_000

export const avaliacaoDaAulaQuery = (aulaId: string) =>
  queryOptions({
    queryKey: ['avaliacao-da-aula', aulaId],
    queryFn: () => avaliacaoDaAulaFn({ data: { aulaId } }),
    staleTime: TEMPO_DA_PAGINA_DA_AULA,
  })

export const comentariosDaAulaQuery = (aulaId: string) =>
  infiniteQueryOptions({
    queryKey: ['comentarios-da-aula', aulaId],
    initialPageParam: 1,
    queryFn: ({ pageParam }) =>
      comentariosDaAulaFn({ data: { aulaId, pagina: pageParam } }),
    getNextPageParam: (ultima, todas) =>
      ultima.temMais ? todas.length + 1 : undefined,
    staleTime: TEMPO_DA_PAGINA_DA_AULA,
  })
