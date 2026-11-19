// Lógica pura do número que conta até o valor novo (#108): de onde parte, se anima, a curva e o valor
// de cada quadro. O hook `useValorQueCresce` só liga isto ao relógio e ao aparelho.

// Mesma curva do token `--mov-saida`: cubic-bezier(0.22, 1, 0.36, 1). Sem quique.
const [X1, Y1, X2, Y2] = [0.22, 1, 0.36, 1]

const coordenada = (t: number, a: number, b: number) =>
  3 * (1 - t) ** 2 * t * a + 3 * (1 - t) * t ** 2 * b + t ** 3

/** Progresso (0 a 1) da curva de saída no instante `t` (0 a 1). */
export function curvaDeSaida(t: number): number {
  if (t <= 0) return 0
  if (t >= 1) return 1
  // Acha o parâmetro da curva cujo x vale `t` (bisseção) e devolve o y dele.
  let baixo = 0
  let alto = 1
  for (let i = 0; i < 24; i++) {
    const meio = (baixo + alto) / 2
    if (coordenada(meio, X1, X2) < t) baixo = meio
    else alto = meio
  }
  return coordenada((baixo + alto) / 2, Y1, Y2)
}

/**
 * De onde a contagem parte, ou `null` quando o número deve aparecer direto: sem valor visto antes,
 * valor que não mudou, partida inválida ou "menos movimento".
 */
export function pontoDePartida({
  de,
  para,
  menosMovimento,
}: {
  de: number | null
  para: number
  menosMovimento: boolean
}): number | null {
  if (menosMovimento) return null
  if (de === null || !Number.isFinite(de) || !Number.isFinite(para)) return null
  if (de === para) return null
  return de
}

/** O número inteiro mostrado `decorrido` ms depois do início; no fim (ou além) é exatamente `para`. */
export function valorNoQuadro(
  de: number,
  para: number,
  decorrido: number,
  duracao: number,
): number {
  if (duracao <= 0 || decorrido >= duracao) return para
  const t = Math.max(0, decorrido) / duracao
  return Math.round(de + (para - de) * curvaDeSaida(t))
}

/** Lê o que foi guardado; texto ausente ou estragado vira `null`. */
export function lerValorGuardado(texto: string | null): number | null {
  if (texto === null || texto.trim() === '') return null
  const n = Number(texto)
  return Number.isFinite(n) ? n : null
}

/** Os lugares da tela em que um número conta: o total dos pontos e a posição no ranking (geral ou por curso). */
export type LugarDoValor = 'pontos-total' | `ranking-pontos:${string}`

/** Chave do aparelho: uma por usuário e por lugar da tela. */
export function chaveGuardada(usuarioId: string, lugar: LugarDoValor): string {
  return `mk:valor:${usuarioId}:${lugar}`
}
