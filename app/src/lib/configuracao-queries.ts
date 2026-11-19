import { queryOptions, useSuspenseQuery } from '@tanstack/react-query'

import {
  getBoasVindasFn,
  getConfiguracaoDaAreaFn,
} from '#/lib/configuracao-fns'

// Termos, privacidade e contato de suporte. Curto de propósito: quando o Proprietário muda a
// versão dos Termos, o aluno logado é levado a aceitar de novo logo na próxima navegação.
export const configuracaoDaAreaQuery = queryOptions({
  queryKey: ['configuracao-da-area'],
  queryFn: () => getConfiguracaoDaAreaFn(),
  staleTime: 30_000,
})

export function useConfiguracaoDaArea() {
  return useSuspenseQuery(configuracaoDaAreaQuery).data
}

// Vídeo de boas-vindas (#101): `url` nulo = sem vídeo, nada aparece. Marcar como visto troca o cache à mão.
export const boasVindasQuery = queryOptions({
  queryKey: ['boas-vindas'],
  queryFn: () => getBoasVindasFn(),
  staleTime: 5 * 60_000,
})
