/**
 * Etiqueta de estado do painel (P7): etiqueta neutra com um ponto colorido. Nunca bloco de cor.
 *
 *   <EtiquetaDeEstado tom="perigo">Com erro</EtiquetaDeEstado>
 *   <EtiquetaDeEstado {...ESTADO_DO_AVISO[aviso.situacao]} />   // { rotulo, tom } de `regras/painel`
 *
 * Tons: `neutro` (cinza), `atencao` (pendente, sem turma), `perigo` (erro, reembolso) e `ok`
 * (pago, aplicado). O ponto "ok" usa `--success-texto` (o `--success` some sobre o fundo claro).
 * O mapa situação → { rotulo, tom } de cada tela mora em `regras/`, com teste.
 */
import type { ReactNode } from 'react'
import { cn } from '#/lib/utils'
import type { TomDeEstado } from '#/regras/painel'

const PONTO: Record<TomDeEstado, string> = {
  neutro: 'bg-muted-foreground',
  atencao: 'bg-warning',
  perigo: 'bg-destructive',
  ok: 'bg-success-texto',
}

export function EtiquetaDeEstado({
  tom = 'neutro',
  rotulo,
  children,
  className,
}: {
  tom?: TomDeEstado
  /** Texto da etiqueta; ou passe como filho. */
  rotulo?: ReactNode
  children?: ReactNode
  className?: string
}) {
  return (
    <span
      data-tom={tom}
      className={cn(
        'inline-flex w-fit max-w-full items-center gap-1.5 rounded-full border bg-background px-2.5 py-0.5 text-xs font-medium whitespace-nowrap text-foreground',
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cn('size-2 shrink-0 rounded-full', PONTO[tom])}
      />
      {children ?? rotulo}
    </span>
  )
}
