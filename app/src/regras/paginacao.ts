// Listas paginadas de 20 em 20 (spec #33). Um só lugar para o tamanho da página e a conta da página:
// cada lista pede `deslocamento(pagina)` ao banco e devolve `montarPagina`.

export const POR_PAGINA = 20

export interface Pagina<T> {
  itens: T[]
  pagina: number
  porPagina: number
  total: number
  totalDePaginas: number
}

/** A página vinda da tela (texto, número ou lixo) como inteiro de 1 em diante. */
export function paginaValida(valor: unknown): number {
  const numero = Math.floor(Number(valor))
  return Number.isFinite(numero) && numero >= 1 ? numero : 1
}

export function deslocamento(pagina: number): number {
  return (pagina - 1) * POR_PAGINA
}

export function montarPagina<T>(
  itens: T[],
  total: number,
  pagina: number,
): Pagina<T> {
  return {
    itens,
    pagina,
    porPagina: POR_PAGINA,
    total,
    totalDePaginas: Math.max(1, Math.ceil(total / POR_PAGINA)),
  }
}
