import { useState } from 'react'
import { Button } from '#/components/ui/button'

const PASSO = 20

/**
 * Lista que cresce de 20 em 20 no cliente: o servidor manda tudo, a tela só desenha o começo. `chave`
 * volta a contagem para 20 quando a lista é outra (nova busca, outro filtro).
 */
export function useMostrarMais(total: number, chave = '') {
  const [estado, setEstado] = useState({ chave, quantos: PASSO })
  const quantos = estado.chave === chave ? estado.quantos : PASSO
  return {
    visiveis: Math.min(quantos, total),
    aoMostrarMais: () => setEstado({ chave, quantos: quantos + PASSO }),
  }
}

/** O botão do fim da lista; some quando já está tudo na tela. */
export function MostrarMais({
  visiveis,
  total,
  aoMostrarMais,
}: {
  visiveis: number
  total: number
  aoMostrarMais: () => void
}) {
  if (visiveis >= total) return null
  return (
    <div className="flex flex-col items-center gap-2">
      <p className="text-sm text-muted-foreground" aria-live="polite">
        Mostrando {visiveis} de {total}
      </p>
      <Button variant="outline" size="sm" onClick={aoMostrarMais}>
        Mostrar mais
      </Button>
    </div>
  )
}
