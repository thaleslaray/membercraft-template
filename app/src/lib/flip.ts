import { querMenosMovimento } from '#/lib/menos-movimento'

// FLIP (First, Last, Invert, Play) para listas que reordenam: mede onde cada item estava, deixa o React
// reordenar, mede onde ficou e anima só `transform` do deslocamento até zero. Sem biblioteca.

type Ponto = { left: number; top: number }

/** Quanto o item precisa ser puxado de volta para parecer parado onde estava; `null` se não andou. */
export function deslocamentoFlip(
  antes: Ponto,
  depois: Ponto,
): { dx: number; dy: number } | null {
  const dx = antes.left - depois.left
  const dy = antes.top - depois.top
  if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return null
  return { dx, dy }
}

/** Posições atuais dos filhos que têm `data-flip="<chave>"` dentro do contêiner. */
export function medirFlip(conteiner: HTMLElement): Map<string, Ponto> {
  const mapa = new Map<string, Ponto>()
  for (const el of conteiner.querySelectorAll<HTMLElement>('[data-flip]')) {
    const { left, top } = el.getBoundingClientRect()
    mapa.set(el.dataset.flip as string, { left, top })
  }
  return mapa
}

/**
 * Anima cada item de `[data-flip]` das posições medidas antes até as de agora. Chame depois da
 * reordenação (useLayoutEffect). Com "menos movimento", não anima. Interrompível: a animação
 * anterior é cancelada e a nova parte da posição já comutada.
 */
export function tocarFlip(
  conteiner: HTMLElement,
  antes: Map<string, Ponto>,
  opcoes: { duracao?: number } = {},
): void {
  if (querMenosMovimento()) return
  const duracao = opcoes.duracao ?? 380
  for (const el of conteiner.querySelectorAll<HTMLElement>('[data-flip]')) {
    const anterior = antes.get(el.dataset.flip as string)
    if (!anterior) continue
    const agora = el.getBoundingClientRect()
    const d = deslocamentoFlip(anterior, agora)
    if (!d) continue
    el.animate(
      [
        { transform: `translate(${d.dx}px, ${d.dy}px)` },
        { transform: 'translate(0, 0)' },
      ],
      { duration: duracao, easing: 'cubic-bezier(.22, 1, .36, 1)' },
    )
  }
}
