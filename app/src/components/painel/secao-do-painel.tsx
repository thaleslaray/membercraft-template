/**
 * Seção em cartão do painel: `<section aria-labelledby>` com o título como `h2` (no lugar de
 * `Card aria-label`, que é um `div` sem papel). `acao` fica no canto do título.
 *
 *   <SecaoDoPainel titulo="Pontos: 120" acao={<Button>…</Button>}>…</SecaoDoPainel>
 */
import { type ReactNode, useId } from 'react'
import { Card, CardContent, CardHeader } from '#/components/ui/card'
import { cn } from '#/lib/utils'

export function SecaoDoPainel({
  titulo,
  acao,
  className,
  tituloClassName,
  contentClassName,
  children,
}: {
  titulo: ReactNode
  acao?: ReactNode
  className?: string
  tituloClassName?: string
  contentClassName?: string
  children: ReactNode
}) {
  const id = useId()
  return (
    <section aria-labelledby={id} className="min-w-0">
      <Card className={className}>
        <CardHeader className="flex flex-wrap items-center justify-between gap-2">
          <h2
            id={id}
            className={cn(
              'text-base leading-snug font-semibold',
              tituloClassName,
            )}
          >
            {titulo}
          </h2>
          {acao}
        </CardHeader>
        <CardContent className={cn('flex flex-col gap-4', contentClassName)}>
          {children}
        </CardContent>
      </Card>
    </section>
  )
}
