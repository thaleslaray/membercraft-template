import { cn } from '#/lib/utils'
import { larguraDaBarra } from '#/regras/meus-cursos'

/** Barra de progresso do Lume: cor da marca, verde ao chegar em 100%. */
export function BarraLume({
  pct,
  label,
  feitas,
  className,
}: {
  pct: number
  label: string
  /** Aulas concluídas: com alguma feita a barra mostra ao menos um traço. */
  feitas?: number
  className?: string
}) {
  const valor = Math.min(100, Math.max(0, pct))
  const visivel = feitas === undefined ? valor : larguraDaBarra(valor, feitas)
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(valor)}
      className={cn(
        'h-1.5 overflow-hidden rounded-full bg-foreground/[.12]',
        className,
      )}
    >
      <div
        className={cn(
          'h-full origin-left rounded-full transition-transform duration-lento ease-saida motion-reduce:transition-none',
          valor >= 100 ? 'bg-success' : 'bg-brand',
        )}
        style={{ transform: `scaleX(${visivel / 100})`, width: '100%' }}
      />
    </div>
  )
}
