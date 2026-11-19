import type { ReactNode } from 'react'

/**
 * Fileira horizontal com a rolagem nativa do aparelho e `scroll-snap`: o arraste tem o impulso do
 * sistema, sem setas nem animação própria. Cada filho é um item de largura fixa.
 */
export function Fileira({
  titulo,
  acao,
  children,
}: {
  titulo: string
  /** Link "Ver todas", quando houver. */
  acao?: ReactNode
  children: ReactNode
}) {
  return (
    <section aria-label={titulo} className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="text-xl leading-7 font-semibold tracking-[-0.01em]">
          {titulo}
        </h2>
        {acao}
      </div>
      <ul className="-mx-4 flex snap-x snap-mandatory scroll-px-4 gap-4 overflow-x-auto px-4 pb-2 md:-mx-8 md:scroll-px-8 md:px-8 xl:-mx-16 xl:scroll-px-16 xl:px-16 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {children}
      </ul>
    </section>
  )
}
