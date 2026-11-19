import {
  type CSSProperties,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from 'react'
import { Progress } from '#/components/ui/progress'
import { type CoresDaBarra, corDaBarra, extrairCartela } from '#/lib/cartela'
import { cn } from '#/lib/utils'

// Cartelas já lidas nesta aba: a mesma capa aparece no curso, na aula e na conclusão.
const lidas = new Map<string, string[]>()

/**
 * As cores principais da capa do curso. A capa vem do nosso domínio (`/api/imagens/...`), então o
 * navegador lê os pixels num canvas de 48 px sem custo no servidor. Enquanto lê (ou sem capa), devolve
 * uma lista vazia e quem usa cai na cor da marca.
 */
export function useCartela(url: string | null): string[] {
  const [cores, setCores] = useState<string[]>(() =>
    url ? (lidas.get(url) ?? []) : [],
  )
  useEffect(() => {
    if (!url) {
      setCores([])
      return
    }
    const pronta = lidas.get(url)
    if (pronta) {
      setCores(pronta)
      return
    }
    let vivo = true
    const imagem = new Image()
    imagem.decoding = 'async'
    imagem.onload = () => {
      try {
        const lado = 48
        const canvas = document.createElement('canvas')
        canvas.width = lado
        canvas.height = lado
        const ctx = canvas.getContext('2d', { willReadFrequently: true })
        if (!ctx) return
        ctx.drawImage(imagem, 0, 0, lado, lado)
        const cartela = extrairCartela(ctx.getImageData(0, 0, lado, lado).data)
        lidas.set(url, cartela)
        if (vivo) setCores(cartela)
      } catch {
        // Sem cartela, fica a cor da marca.
      }
    }
    imagem.src = url
    return () => {
      vivo = false
    }
  }, [url])
  return cores
}

type ModuloDoAnel = { total: number; feitas: number }

/**
 * Progresso do curso num anel dividido por módulo: cada módulo é um arco do tamanho das suas aulas, na
 * sua cor da cartela, preenchido até onde a aluna chegou. O preenchimento só anima quando o valor muda com a tela aberta
 * (o traço usa `stroke-dasharray`, que não tem como ser só `transform`; mesma duração e curva dos tokens).
 */
export function AnelDoCurso({
  modulos,
  cores,
  rotulo,
  tamanho = 88,
  espessura = 8,
  className,
  children,
}: {
  modulos: ModuloDoAnel[]
  cores: string[]
  rotulo: string
  tamanho?: number
  espessura?: number
  className?: string
  children?: ReactNode
}) {
  const raio = (tamanho - espessura) / 2
  const volta = 2 * Math.PI * raio
  const total = modulos.reduce((n, m) => n + m.total, 0)
  const comAulas = modulos.filter((m) => m.total > 0)
  // Vão entre os arcos: 2 graus, menor quando os arcos são curtos.
  const vao = comAulas.length > 1 ? (2 / 360) * volta : 0

  let inicio = 0
  const arcos = comAulas.map((m, i) => {
    const comprimento = total ? (m.total / total) * volta : 0
    const arco = {
      chave: i,
      inicio,
      util: Math.max(0, comprimento - Math.min(vao, comprimento * 0.3)),
      fracao: m.total ? m.feitas / m.total : 0,
      cor: cores.length ? cores[i % cores.length] : 'var(--primary)',
    }
    inicio += comprimento
    return arco
  })

  return (
    <div
      role="img"
      aria-label={rotulo}
      className={cn('relative grid shrink-0 place-items-center', className)}
      style={{ width: tamanho, height: tamanho }}
    >
      <svg
        width={tamanho}
        height={tamanho}
        viewBox={`0 0 ${tamanho} ${tamanho}`}
        className="absolute inset-0 -rotate-90"
        aria-hidden="true"
      >
        {arcos.length === 0 && (
          <circle
            cx={tamanho / 2}
            cy={tamanho / 2}
            r={raio}
            fill="none"
            stroke="var(--muted)"
            strokeWidth={espessura}
          />
        )}
        {arcos.map((a) => (
          <g key={a.chave}>
            <circle
              cx={tamanho / 2}
              cy={tamanho / 2}
              r={raio}
              fill="none"
              stroke={a.cor}
              strokeOpacity={0.18}
              strokeWidth={espessura}
              strokeDasharray={`${a.util} ${volta}`}
              strokeDashoffset={-a.inicio}
            />
            <circle
              cx={tamanho / 2}
              cy={tamanho / 2}
              r={raio}
              fill="none"
              stroke={a.cor}
              strokeWidth={espessura}
              strokeDasharray={`${a.util * a.fracao} ${volta}`}
              strokeDashoffset={-a.inicio}
              className="transition-[stroke-dasharray] duration-lento ease-saida motion-reduce:transition-none"
            />
          </g>
        ))}
      </svg>
      <div className="relative">{children}</div>
    </div>
  )
}

/**
 * Como `useCartela`, mas só lê a capa quando o elemento entra na tela: a Vitrine com muitos cursos não
 * decodifica todas as capas de uma vez. Devolve a ref (para o cartão) e as cores.
 */
export function useCartelaAoEntrar<T extends Element>(
  url: string | null,
): [React.RefObject<T | null>, string[]] {
  const ref = useRef<T | null>(null)
  const [visivel, setVisivel] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el || visivel) return
    if (typeof IntersectionObserver === 'undefined') {
      setVisivel(true)
      return
    }
    const obs = new IntersectionObserver(
      (entradas) => {
        if (entradas.some((e) => e.isIntersecting)) {
          setVisivel(true)
          obs.disconnect()
        }
      },
      { rootMargin: '200px' },
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [visivel])
  return [ref, useCartela(visivel ? url : null)]
}

// As cores esmaecem para dentro quando são lidas; sem movimento, já aparecem.
const ESMAECE =
  'animate-in fade-in duration-500 fill-mode-both motion-reduce:animate-none'

/** A cartela em bolinhas, como uma cartela de coloração. Decoração: o leitor de tela ignora. */
export function Bolinhas({
  cores,
  className,
}: {
  cores: string[]
  className?: string
}) {
  if (cores.length === 0) return null
  return (
    <span
      aria-hidden="true"
      data-testid="cartela-bolinhas"
      className={cn('flex items-center gap-1.5', ESMAECE, className)}
    >
      {cores.slice(0, 5).map((cor, i) => (
        <span
          // biome-ignore lint/suspicious/noArrayIndexKey: a posição na cartela é a identidade
          key={i}
          className="size-2.5 rounded-full"
          style={{ background: cor }}
        />
      ))}
    </span>
  )
}

/** Faixa fina de blocos chapados, um por cor da cartela (sem gradiente). Decoração. */
export function FaixaDaCartela({
  cores,
  className,
}: {
  cores: string[]
  className?: string
}) {
  if (cores.length === 0) return null
  return (
    <div
      aria-hidden="true"
      data-testid="cartela-faixa"
      className={cn('flex h-1.5 w-full', ESMAECE, className)}
    >
      {cores.map((cor, i) => (
        <span
          // biome-ignore lint/suspicious/noArrayIndexKey: a posição na cartela é a identidade
          key={i}
          className="h-full flex-1"
          style={{ background: cor }}
        />
      ))}
    </div>
  )
}

/** Fundo do cabeçalho do curso, tingido de leve com a primeira cor (menos no escuro). */
export function tingimentoDoCabecalho(cores: string[]): CSSProperties {
  if (cores.length === 0) return {}
  return { '--tinta': cores[0] } as CSSProperties
}

/**
 * Barra de progresso na cor da capa. A cor é ajustada para ter 3:1 contra o trilho nos dois modos
 * (escurece no claro, clareia no escuro). Sem cor (sem capa ou ainda lendo), fica a cor da marca.
 */
export function BarraDaCartela({
  cor,
  trilho,
  className,
  ...props
}: {
  cor: string | undefined
  /** Cor do trilho em cada modo, para calcular o contraste. */
  trilho: CoresDaBarra
} & Omit<React.ComponentProps<typeof Progress>, 'style'>) {
  const estilo = cor
    ? ({
        '--barra-claro': corDaBarra(cor, trilho.claro, 'claro'),
        '--barra-escuro': corDaBarra(cor, trilho.escuro, 'escuro'),
      } as CSSProperties)
    : undefined
  return (
    <Progress
      {...props}
      style={estilo}
      className={cn(
        cor &&
          '[&>div]:bg-[var(--barra-claro)] dark:[&>div]:bg-[var(--barra-escuro)]',
        className,
      )}
    />
  )
}
