import type * as React from 'react'
import { cn } from '#/lib/utils'

// Bloco que abre e fecha por transição de altura (grid-template-rows) e pode ser revertido no meio sem
// salto. Serve para "Mais", detalhes e qualquer coisa que recolhe fora do acordeão. Quem usa guarda o
// estado e liga o gatilho com `aria-expanded` e `aria-controls={id}`.
export function Recolhivel({
  aberto,
  className,
  children,
  ...props
}: React.ComponentProps<'div'> & { aberto: boolean }) {
  return (
    <div
      data-slot="recolhivel"
      data-state={aberto ? 'open' : 'closed'}
      className="recolhe"
      {...props}
    >
      <div className="recolhe-miolo">
        <div className={cn(className)}>{children}</div>
      </div>
    </div>
  )
}
