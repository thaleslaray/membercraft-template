import { useState } from 'react'
import { cn } from '#/lib/utils'

/**
 * O círculo com ✓ do botão "Concluir aula" (#108). O ✓ se desenha em 300 ms (`stroke-dashoffset`, a
 * única exceção ao "só transform e opacity", prevista na issue) quando a aula passa de pendente a
 * concluída com a tela aberta. Ao abrir já concluída ou ao desmarcar, o ✓ aparece e some direto.
 * Com "menos movimento", também direto.
 */
export function MarcaDeConcluida({
  concluida,
  className,
}: {
  concluida: boolean
  className?: string
}) {
  const [anterior, setAnterior] = useState(concluida)
  const [desenha, setDesenha] = useState(false)
  if (anterior !== concluida) {
    // Só marcar anima; desmarcar tira a transição no mesmo quadro.
    setAnterior(concluida)
    setDesenha(concluida)
  }
  return (
    <svg
      viewBox="0 0 24 24"
      width="24"
      height="24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      data-slot="marca-de-concluida"
      className={cn('size-4 shrink-0', className)}
    >
      <circle cx="12" cy="12" r="10" />
      <path
        d="m9 12 2 2 4-4"
        pathLength={1}
        data-desenhado={concluida}
        strokeDasharray={1}
        strokeDashoffset={concluida ? 0 : 1}
        opacity={concluida ? 1 : 0}
        className={cn(
          desenha &&
            'transition-[stroke-dashoffset] duration-[300ms] ease-saida motion-reduce:transition-none',
        )}
      />
    </svg>
  )
}
