// A Comunidade tem duas abas, Mural e Ranking, e a aba mora na URL (`?aba=ranking`); sem `aba` é o
// Mural. O link antigo `/ranking` redireciona para a aba, guardando o curso escolhido.

export type AbaDaComunidade = 'ranking'

export const abaDaBusca = (valor: unknown): AbaDaComunidade | undefined =>
  valor === 'ranking' ? 'ranking' : undefined

export const buscaDoRankingAntigo = (
  curso: string | undefined,
): { aba: 'ranking'; curso?: string } =>
  curso ? { aba: 'ranking', curso } : { aba: 'ranking' }
