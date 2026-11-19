import { type SQL, type SQLWrapper, sql } from 'drizzle-orm'

// O D1 aceita no máximo 100 parâmetros por comando (cada valor de `inArray` e cada coluna de um
// `insert ... values` conta um). Toda lista que cresce com os dados passa por aqui.
// Preferir uma subconsulta (`in (select id from ...)`) quando a lista vem do próprio banco.

/** Itens por lote numa consulta que só tem a lista como parâmetro (sobram 20 para o resto). */
export const TAMANHO_DO_LOTE = 80

/** Parte a lista em pedaços de até `tamanho` itens. */
export function emPedacos<T>(
  lista: readonly T[],
  tamanho = TAMANHO_DO_LOTE,
): T[][] {
  const pedacos: T[][] = []
  for (let i = 0; i < lista.length; i += tamanho) {
    pedacos.push(lista.slice(i, i + tamanho))
  }
  return pedacos
}

/**
 * Roda `buscar` para cada lote (sem repetidos) e junta as linhas. Passe `tamanho` menor que
 * `TAMANHO_DO_LOTE` quando a consulta tiver outros parâmetros além da lista: o total fica em até 100.
 * A ordem das linhas é a dos lotes: reordene depois se a consulta ordenava.
 */
export async function emLotes<T, R>(
  itens: readonly T[],
  buscar: (lote: T[]) => Promise<R[]>,
  tamanho = TAMANHO_DO_LOTE,
): Promise<R[]> {
  const saida: R[] = []
  for (const lote of emPedacos([...new Set(itens)], tamanho)) {
    saida.push(...(await buscar(lote)))
  }
  return saida
}

/**
 * `coluna in (...)` com a lista inteira num ÚNICO parâmetro (um JSON lido por `json_each`).
 * Só para consulta paginada ou agregada, que não dá para repartir em lotes; a lista deve ser
 * de tamanho razoável (centenas, não milhões).
 */
export function entreOsIds(coluna: SQLWrapper, ids: readonly string[]): SQL {
  return sql`${coluna} in (select value from json_each(${JSON.stringify(ids)}))`
}
