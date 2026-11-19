import { useCallback, useLayoutEffect, useRef } from 'react'
import { medirFlip, tocarFlip } from '#/lib/flip'

type Medida = ReturnType<typeof medirFlip>

// FLIP para listas que reordenam. Marque cada item com `data-flip="<id>"` e ponha `ref` no contêiner.
// Chame `medir()` logo antes de mudar a ordem (ex.: no clique); depois da renderização o hook anima os
// itens das posições antigas até as novas. `dependencia` é o que muda quando a lista muda (a ordem).
export function useFlip<T extends HTMLElement>(dependencia: unknown) {
  const ref = useRef<T>(null)
  const antes = useRef<Medida | null>(null)

  const medir = useCallback(() => {
    if (ref.current) antes.current = medirFlip(ref.current)
  }, [])

  // biome-ignore lint/correctness/useExhaustiveDependencies: roda quando a ordem (dependência) muda
  useLayoutEffect(() => {
    if (ref.current && antes.current) tocarFlip(ref.current, antes.current)
    antes.current = null
  }, [dependencia])

  return { ref, medir }
}
