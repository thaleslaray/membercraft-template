import { queryOptions, useQuery } from '@tanstack/react-query'

import { getSessionFn } from '#/lib/auth-fns'
import { fusoDoAluno } from '#/lib/datas'

export const sessionQuery = queryOptions({
  queryKey: ['session'],
  queryFn: () => getSessionFn(),
  staleTime: 60_000,
})

/** O fuso do aluno logado (Minha conta): nele vão todas as datas e horas que ele lê. */
export function useFusoDoAluno(): string {
  const { data } = useQuery(sessionQuery)
  const usuario = data?.user as { fusoHorario?: string | null } | undefined
  return fusoDoAluno(usuario?.fusoHorario)
}
