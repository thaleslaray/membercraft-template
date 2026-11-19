import { ChevronLeft, ChevronRight } from 'lucide-react'
import { type ReactNode, useEffect, useRef, useState } from 'react'
import { querMenosMovimento } from '#/lib/menos-movimento'
import { cn } from '#/lib/utils'

/**
 * Fileira horizontal do Lume: título pequeno e setas sobre os cartões ao passar o mouse (só no
 * computador); a rolagem é a nativa, com `scroll-snap`.
 */
export function Fileira({
  titulo,
  children,
}: {
  titulo: string
  children: ReactNode
}) {
  const ref = useRef<HTMLUListElement>(null)
  const [pontas, setPontas] = useState({ antes: false, depois: false })
  const rolar = (sentido: number) =>
    ref.current?.scrollBy({
      left: sentido * ref.current.clientWidth * 0.85,
      behavior: querMenosMovimento() ? 'auto' : 'smooth',
    })

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ler = () =>
      setPontas({
        antes: el.scrollLeft > 4,
        depois: el.scrollLeft + el.clientWidth < el.scrollWidth - 4,
      })
    ler()
    const observador = new ResizeObserver(ler)
    observador.observe(el)
    el.addEventListener('scroll', ler, { passive: true })
    return () => {
      observador.disconnect()
      el.removeEventListener('scroll', ler)
    }
  }, [])

  const seta =
    'absolute top-1/2 z-10 grid size-9 -translate-y-1/2 place-items-center rounded-full bg-background/90 text-foreground shadow-sm ring-1 ring-border backdrop-blur-md transition-opacity duration-200 opacity-0 group-hover/fileira:opacity-100 focus-visible:opacity-100 lume-cel:hidden'
  return (
    <section aria-label={titulo} className="group/fileira grid gap-3.5">
      <h2 className="px-(--pad) font-display text-lg leading-6 tracking-[-0.02em]">
        {titulo}
      </h2>
      <div className="relative min-w-0">
        <ul
          ref={ref}
          className="flex snap-x snap-mandatory scroll-px-(--pad) gap-[22px] -mt-1 overflow-x-auto px-(--pad) pt-1 pb-1 [scrollbar-width:none] lume-cel:gap-3 [&::-webkit-scrollbar]:hidden *:shrink-0 *:snap-start"
        >
          {children}
        </ul>
        {pontas.antes && (
          <button
            type="button"
            className={cn(seta, 'left-[max(8px,calc(var(--pad)/2-18px))]')}
            onClick={() => rolar(-1)}
            aria-label={`Voltar em ${titulo}`}
          >
            <ChevronLeft className="size-5" strokeWidth={2.5} />
          </button>
        )}
        {pontas.depois && (
          <button
            type="button"
            className={cn(seta, 'right-[max(8px,calc(var(--pad)/2-18px))]')}
            onClick={() => rolar(1)}
            aria-label={`Avançar em ${titulo}`}
          >
            <ChevronRight className="size-5" strokeWidth={2.5} />
          </button>
        )}
      </div>
    </section>
  )
}
