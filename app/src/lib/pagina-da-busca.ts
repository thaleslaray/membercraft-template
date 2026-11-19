import { paginaValida } from '#/regras/paginacao'

/** A página da URL (`?pagina=3`): ausente ou 1 some da URL, o resto vira inteiro de 2 em diante. */
export function paginaDaBusca(valor: unknown): number | undefined {
  const pagina = paginaValida(valor)
  return pagina > 1 ? pagina : undefined
}
