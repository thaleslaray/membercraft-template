import { Link } from '@tanstack/react-router'
import type { AbaDaComunidade } from '#/lib/aba-da-comunidade'
import { cn } from '#/lib/utils'

// Controle segmentado Mural | Ranking. É navegação (a aba mora na URL), então são links; o
// indicador desliza por `transform` entre os dois segmentos, na curva de saída do tema.
export function AbasDaComunidade({
  aba,
}: {
  aba: AbaDaComunidade | undefined
}) {
  const noRanking = aba === 'ranking'
  // O segmento ativo se distingue pelo indicador por baixo, não pela cor do texto (contraste).
  const segmento = (ativo: boolean) =>
    cn(
      'pressiona-linha relative z-10 rounded-md px-4 py-1.5 text-center toque:flex toque:min-h-11 toque:items-center toque:justify-center text-sm text-foreground no-underline transition-[font-weight] duration-base ease-saida',
      ativo ? 'font-semibold' : 'font-medium',
    )
  return (
    <nav
      aria-label="Seções da Comunidade"
      className="relative grid w-full grid-cols-2 rounded-lg bg-muted p-1 md:w-64"
    >
      <span
        aria-hidden="true"
        data-indicador=""
        className="absolute inset-y-1 left-1 w-[calc(50%-0.25rem)] rounded-md bg-background shadow-xs transition-transform dark:bg-foreground/15 dark:shadow-none duration-base ease-saida"
        style={{ transform: noRanking ? 'translateX(100%)' : 'translateX(0)' }}
      />
      <Link
        to="/comunidades"
        search={{}}
        aria-current={noRanking ? undefined : 'page'}
        className={segmento(!noRanking)}
      >
        Mural
      </Link>
      <Link
        to="/comunidades"
        search={{ aba: 'ranking' }}
        aria-current={noRanking ? 'page' : undefined}
        className={segmento(noRanking)}
      >
        Ranking
      </Link>
    </nav>
  )
}
