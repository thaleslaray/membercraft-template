/**
 * `<select>` nativo com o visual do `Input` (P5): mesma borda, fundo, altura, foco e erro. Ocupa a
 * largura disponível sem estourar (`w-full min-w-0`); quem quer mais estreito passa `className`.
 *
 *   <SelectNativo id="filtro" value={v} onChange={(e) => setV(e.target.value)}>
 *     <option value="">Todas</option>
 *     ...
 *   </SelectNativo>
 *
 * Substitui `selectClasse`, `campo`, `CLASSE_DO_SELECT`, `SELECT_CLASSES` e os `<select>` crus.
 * O seletor nativo é o melhor no celular (abre a lista do sistema).
 */
import { ChevronDown } from 'lucide-react'
import type * as React from 'react'
import { cn } from '#/lib/utils'

function SelectNativo({
  className,
  children,
  ...props
}: React.ComponentProps<'select'>) {
  return (
    <div data-slot="select-nativo" className="relative w-full min-w-0">
      <select
        className={cn(
          'h-[2.375rem] w-full min-w-0 appearance-none truncate rounded-md border border-input bg-background py-2 pr-9 pl-3 text-base text-foreground shadow-xs outline-none transition-[color,box-shadow] md:text-sm dark:bg-input/30',
          'focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 in-data-[area=painel]:focus-visible:ring-ring',
          'aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40',
          'disabled:cursor-not-allowed disabled:opacity-50 toque:h-11',
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground"
      />
    </div>
  )
}

export { SelectNativo }
