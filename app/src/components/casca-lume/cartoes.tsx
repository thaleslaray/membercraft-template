import { Link } from '@tanstack/react-router'
import { BookOpen, Play } from 'lucide-react'
import { BarraLume } from '#/components/casca-lume/barra'
import { urlDaImagem } from '#/lib/imagens'
import { cn } from '#/lib/utils'
import { larguraDaBarra, rotuloDoProgresso } from '#/regras/meus-cursos'

/** O que o cartão precisa de um curso da aluna (cabe em `CursoDeMeusCursos`). */
export type CursoParaCartaoLume = {
  id: string
  nome: string
  capaHorizontal?: string | null
  capaVertical?: string | null
  percentual: number
  feitas: number
  total: number
  proxima: { aulaId: string; titulo: string } | null
}

const MARCADOR_SEM_CAPA = (
  <BookOpen
    aria-hidden="true"
    className="absolute top-3 left-3 size-5 text-foreground/50"
  />
)

/**
 * Ao passar o mouse a capa sobe 2 px (e ganha sombra onde o tema não a fixa): não corta nem amplia a
 * arte, que aparece inteira (as capas trazem o título). Com movimento reduzido ela não sobe, mas
 * escurece um pouco, para o hover ter retorno. A moldura vem de `--capa-moldura`, lida pela regra
 * `.lume-capa` de `styles.css`.
 */
const ELEVACAO =
  'transition-[translate,box-shadow] duration-200 group-hover:-translate-y-0.5 group-hover:shadow-lg motion-reduce:transition-none motion-reduce:group-hover:translate-y-0 motion-reduce:group-hover:opacity-90'

/** A arte inteira, sem corte: se a proporção do arquivo não bater com a do cartão, sobra fundo. */
const ARTE = 'size-full object-contain'

const FUNDO_SEM_CAPA =
  'bg-[linear-gradient(135deg,color-mix(in_srgb,var(--brand)_55%,var(--card)),var(--card))]'

export type FormatoDaFileira = 'vertical' | 'horizontal'

/**
 * Formato único para os cartões de uma fileira (todos com a mesma altura de capa, nomes na mesma
 * linha): 2:3 quando todo curso com capa tem a vertical; senão, 16:9.
 */
export function formatoDaFileira(
  cursos: CursoParaCartaoLume[],
): FormatoDaFileira {
  const comCapa = cursos.filter((c) => c.capaVertical || c.capaHorizontal)
  return comCapa.length > 0 && comCapa.every((c) => c.capaVertical)
    ? 'vertical'
    : 'horizontal'
}

/**
 * Capa do curso na vitrine, com o nome e o progresso embaixo. As capas da escola trazem o título
 * na própria arte: nada de texto por cima e nada de cortar. O formato vem da fileira
 * (`formatoDaFileira`): 2:3 com a capa vertical, 16:9 com a horizontal.
 */
export function PosterCard({
  curso,
  formato,
}: {
  curso: CursoParaCartaoLume
  formato: FormatoDaFileira
}) {
  const vertical = formato === 'vertical'
  const url = urlDaImagem(
    vertical
      ? (curso.capaVertical ?? curso.capaHorizontal)
      : (curso.capaHorizontal ?? curso.capaVertical),
  )
  const rotulo = rotuloDoProgresso(curso)
  return (
    <li
      className={
        vertical
          ? 'w-[clamp(140px,12.5vw,200px)] lume-cel:w-[132px]'
          : 'w-[clamp(240px,20vw,320px)] lume-cel:w-[72vw]'
      }
    >
      <Link
        to="/cursos/$cursoId"
        params={{ cursoId: curso.id }}
        className="group grid grid-cols-[minmax(0,1fr)] gap-2 no-underline"
      >
        <div
          className={cn(
            'lume-capa relative overflow-hidden rounded-[var(--lume-capa)] bg-muted ring-1 ring-border',
            ELEVACAO,
            vertical ? 'aspect-[2/3]' : 'aspect-video',
            !url && FUNDO_SEM_CAPA,
          )}
        >
          {url ? (
            <img src={url} alt="" loading="lazy" className={ARTE} />
          ) : (
            MARCADOR_SEM_CAPA
          )}
        </div>
        {/* Duas linhas reservadas: as barras de progresso da fileira ficam na mesma altura. */}
        <span className="line-clamp-2 text-[15px] lume-tela:min-h-[2lh] leading-snug font-semibold text-foreground [overflow-wrap:anywhere]">
          {curso.nome}
        </span>
        {curso.total === 0 ? (
          <span className="text-[13px] text-muted-foreground">
            Ainda sem aulas
          </span>
        ) : (
          <div className="flex items-center gap-2.5 text-[13px] font-semibold text-muted-foreground">
            <BarraLume
              pct={curso.percentual}
              feitas={curso.feitas}
              label={`Progresso em ${curso.nome}`}
              className="min-w-0 flex-1"
            />
            <span
              className={cn(
                'shrink-0 whitespace-nowrap tabular-nums',
                rotulo.tipo === 'concluido' && 'text-success-texto',
              )}
            >
              {rotulo.texto}
            </span>
          </div>
        )}
      </Link>
    </li>
  )
}

/** Cartão 16:9 de curso em andamento: a arte inteira, progresso na borda e textos embaixo. */
export function ContinueCard({ curso }: { curso: CursoParaCartaoLume }) {
  if (!curso.proxima) return null
  const url = urlDaImagem(curso.capaHorizontal ?? curso.capaVertical)
  return (
    <li className="w-[clamp(240px,20vw,320px)] lume-cel:w-[72vw]">
      <Link
        to="/aulas/$aulaId"
        params={{ aulaId: curso.proxima.aulaId }}
        className="group grid grid-cols-[minmax(0,1fr)] gap-2 no-underline"
      >
        <div
          className={cn(
            'lume-capa relative aspect-video overflow-hidden rounded-[var(--lume-capa)] bg-muted ring-1 ring-border',
            ELEVACAO,
            !url && FUNDO_SEM_CAPA,
          )}
        >
          {url ? (
            <img src={url} alt="" loading="lazy" className={ARTE} />
          ) : (
            MARCADOR_SEM_CAPA
          )}
          <span className="absolute bottom-3 left-2.5 grid size-7 place-items-center rounded-full bg-destaque-veu/70 text-destaque-tinta backdrop-blur-sm">
            <Play className="size-3" fill="currentColor" aria-hidden="true" />
          </span>
          <span
            role="progressbar"
            aria-label="Progresso no curso"
            aria-valuenow={curso.percentual}
            aria-valuemin={0}
            aria-valuemax={100}
            className="absolute inset-x-0 bottom-0 h-1 bg-destaque-veu/25"
          >
            <span
              className="block h-full bg-brand"
              style={{
                width: `${larguraDaBarra(curso.percentual, curso.feitas)}%`,
              }}
            />
          </span>
        </div>
        <span className="grid min-w-0">
          <span className="truncate text-[15px] leading-snug font-semibold text-foreground">
            {curso.proxima.titulo}
          </span>
          <span className="flex min-w-0 gap-1 text-[13px] text-muted-foreground">
            <span className="truncate">{curso.nome}</span>
            {curso.total > 0 && (
              <span className="shrink-0 whitespace-nowrap tabular-nums">
                · {curso.feitas} de {curso.total}{' '}
                {curso.total === 1 ? 'aula' : 'aulas'}
              </span>
            )}
          </span>
        </span>
      </Link>
    </li>
  )
}
