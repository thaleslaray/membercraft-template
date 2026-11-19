import type { ReactNode } from 'react'

/**
 * Destaque (Início e página do curso). As capas da escola trazem o título escrito na arte, então a
 * capa aparece inteira (16:9) num cartão, nunca como fundo com texto por cima. Computador: texto à
 * esquerda, capa à direita, e um véu bem desfocado da própria capa no fundo. Celular: capa em cima,
 * texto embaixo. Desfoque, moldura e máscara da capa vêm do tema (`--destaque-cartao-desfoque`,
 * `--capa-moldura`, `--destaque-capa-mascara`, a mesma do destaque amplo): no Ateliê claro a capa
 * fica direto no papel. Sem
 * capa, só o degradê da cor da marca, com a altura do conteúdo. Sobe por baixo do
 * topo fixo. O conteúdo se alinha à esquerda, na mesma régua (`--pad`) do resto da página. Com a tela
 * baixa (celular deitado) os espaços encolhem e a capa respeita a altura da janela.
 */
export function Destaque({
  imagem,
  compacto,
  children,
}: {
  imagem: string | null
  compacto?: boolean
  children: ReactNode
}) {
  return (
    <section
      className={`relative -mt-(--lume-topo) overflow-hidden px-(--pad) pt-[calc(var(--lume-topo)+48px)] lume-cel:pt-[calc(var(--lume-topo)+12px)] [@media(max-height:520px)]:pt-[calc(var(--lume-topo)+8px)] ${
        compacto ? 'pb-10' : 'pb-14'
      } lume-cel:pb-8 [@media(max-height:520px)]:pb-4`}
    >
      {imagem ? (
        <img
          aria-hidden="true"
          src={imagem}
          alt=""
          decoding="async"
          className="absolute inset-0 size-full scale-110 object-cover opacity-(--destaque-cartao-desfoque) blur-3xl"
        />
      ) : (
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-[linear-gradient(135deg,color-mix(in_srgb,var(--brand)_30%,var(--background)),var(--background))]"
        />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-background from-0% to-background/40 to-70%" />

      <div
        className={`relative grid items-center gap-10 lume-cel:gap-6 [@media(max-height:520px)]:gap-6 ${
          imagem
            ? 'lume-tela:max-w-[1500px] lume-tela:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]'
            : 'lume-tela:max-w-[760px]'
        }`}
      >
        {imagem && (
          <img
            src={imagem}
            alt=""
            fetchPriority="high"
            loading="eager"
            decoding="async"
            className="aspect-video w-full rounded-[calc(var(--lume-capa)*1.2)] object-contain shadow-(--capa-moldura) lume-tela:order-2 lume-tela:[mask-image:var(--destaque-capa-mascara)] lume-tela:w-[min(100%,calc((100dvh-var(--lume-topo)-2rem)*16/9))] lume-tela:justify-self-end"
          />
        )}
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3.5">
          {children}
        </div>
      </div>
    </section>
  )
}

export const TITULO_DO_DESTAQUE =
  'line-clamp-3 font-display text-[clamp(30px,3.6vw,48px)] leading-[1.05] tracking-[-0.025em] text-balance [overflow-wrap:anywhere]'

/** Etiqueta pequena acima do título do destaque. */
export function Etiqueta({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex w-fit items-center rounded-full bg-foreground/[.08] px-3 py-1 text-xs font-semibold backdrop-blur-md">
      {children}
    </span>
  )
}

/** Botão principal do destaque: pílula na cor do texto, ou vinho onde o tema pede (`--botao-principal`). */
export const BOTAO_DO_DESTAQUE =
  'inline-flex h-11 min-w-0 max-w-full items-center justify-center gap-2 rounded-full bg-(--botao-principal) px-6 text-[15px] font-semibold text-(--botao-principal-tinta) no-underline transition-colors hover:bg-(--botao-principal-hover) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring'

/** Botão secundário do destaque (pílula translúcida). */
export const BOTAO_SECUNDARIO_DO_DESTAQUE =
  'inline-flex h-11 items-center justify-center gap-2 rounded-full bg-foreground/[.08] px-5 text-[15px] font-semibold text-foreground no-underline backdrop-blur-md transition-colors hover:bg-foreground/15'
