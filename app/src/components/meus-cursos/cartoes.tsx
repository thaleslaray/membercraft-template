import { Link } from '@tanstack/react-router'
import { BookOpen, Lock, Play } from 'lucide-react'
import type { CSSProperties, ReactNode, Ref } from 'react'
import {
  BarraDaCartela,
  useCartelaAoEntrar,
} from '#/components/conteudo/cartela'
import { buttonVariants } from '#/components/ui/button'
import { TRILHOS_DA_BARRA } from '#/lib/cartela'
import { urlDaImagem } from '#/lib/imagens'
import type { GrupoDaVitrine } from '#/regras/conteudo'
import type { CursoDoCartao, DestaqueDeMeusCursos } from '#/regras/meus-cursos'

export type CursoDeMeusCursos = CursoDoCartao<GrupoDaVitrine['cursos'][number]>

/** Elemento compartilhado da transição de tela: a mesma capa em duas telas leva o mesmo nome. */
function nomeNaTransicao(nome: string | undefined): CSSProperties | undefined {
  return nome ? { viewTransitionName: nome } : undefined
}

/**
 * Capa (2:1), com a barra de progresso fina por cima da borda de baixo quando o curso já tem aula
 * concluída. Sem imagem, um ícone no lugar.
 */
export function Capa({
  url,
  percentual,
  bloqueado = false,
  cor,
  capaRef,
  nomeDaCapa,
  className = 'aspect-[2/1]',
}: {
  url: string | null | undefined
  percentual?: number
  bloqueado?: boolean
  /** Primeira cor da cartela da capa; sem ela, a barra fica na cor da marca. */
  cor?: string
  capaRef?: Ref<HTMLDivElement>
  nomeDaCapa?: string
  className?: string
}) {
  return (
    <div
      ref={capaRef}
      style={nomeNaTransicao(nomeDaCapa)}
      className={`relative overflow-hidden rounded-lg bg-muted ${className}`}
    >
      {url ? (
        <img
          src={url}
          alt=""
          className={`size-full object-cover ${bloqueado ? 'grayscale' : ''}`}
        />
      ) : (
        <div className="grid size-full place-items-center text-muted-foreground">
          <BookOpen className="size-8" aria-hidden="true" />
        </div>
      )}
      {bloqueado && (
        <span className="absolute top-2 right-2 grid size-8 place-items-center rounded-full bg-background text-foreground shadow">
          <Lock className="size-4" aria-hidden="true" />
        </span>
      )}
      {/* A barra só aparece com progresso: em 0% a trilha vazia parecia um risco na imagem. */}
      {percentual !== undefined && percentual > 0 && (
        <div className="absolute inset-x-2 bottom-2">
          <BarraDaCartela
            value={percentual}
            cor={cor}
            trilho={TRILHOS_DA_BARRA.sobreCapa}
            aria-label="Progresso do curso"
            className="h-1.5 bg-white/80 shadow-sm dark:bg-black/50"
          />
        </div>
      )}
    </div>
  )
}

function TextoDoCartao({
  titulo,
  detalhe,
}: {
  titulo: string
  detalhe?: ReactNode
}) {
  return (
    <div className="mt-3 flex flex-col gap-0.5">
      <div className="text-base leading-6 font-medium tracking-[-0.01em] text-foreground [overflow-wrap:anywhere]">
        {titulo}
      </div>
      {detalhe ? (
        <div className="flex flex-col text-[13px] leading-5 tracking-[0.01em] text-muted-foreground tabular-nums [overflow-wrap:anywhere] [&>*]:line-clamp-2">
          {detalhe}
        </div>
      ) : null}
    </div>
  )
}

function textoDoProgresso(c: CursoDeMeusCursos): ReactNode {
  if (c.total === 0) return null
  if (c.feitas >= c.total) {
    return (
      <span>
        Concluído · {c.total} {c.total === 1 ? 'aula' : 'aulas'}
      </span>
    )
  }
  const aulas = `${c.total} ${c.total === 1 ? 'aula' : 'aulas'}`
  // Curso não iniciado: "0 de 54 aulas" não diz nada; basta o tamanho.
  const quanto = c.feitas === 0 ? aulas : `${c.feitas} de ${aulas}`
  return (
    <>
      {c.proxima && (
        <span>
          {c.feitas === 0 ? 'Começar' : 'Próxima'}: {c.proxima.titulo}
        </span>
      )}
      <span>{quanto}</span>
    </>
  )
}

/** Cartão de um curso da aluna (ou, no fim, de um que ela ainda não tem, com cadeado). */
export function CartaoDoCurso({
  c,
  nomeDaCapa,
}: {
  c: CursoDeMeusCursos
  nomeDaCapa?: string
}) {
  const url = urlDaImagem(c.capaHorizontal ?? c.capaVertical)
  const [ref, cores] = useCartelaAoEntrar<HTMLDivElement>(url)
  if (c.bloqueado) {
    const conteudo = (
      <>
        <Capa url={url} bloqueado capaRef={ref} />
        <TextoDoCartao
          titulo={c.nome}
          detalhe={
            <span>{c.expirado ? 'Acesso expirado' : 'Conheça o curso'}</span>
          }
        />
      </>
    )
    // Cadeado: leva à página de vendas, se o curso tiver uma.
    return c.urlDeVendas ? (
      <a
        href={c.urlDeVendas}
        target="_blank"
        rel="noopener noreferrer"
        className="group no-underline pressiona-cartao"
      >
        {conteudo}
      </a>
    ) : (
      <div>{conteudo}</div>
    )
  }
  return (
    <Link
      to="/cursos/$cursoId"
      params={{ cursoId: c.id }}
      className="group no-underline pressiona-cartao"
    >
      <Capa
        url={url}
        percentual={c.percentual}
        cor={cores[0]}
        capaRef={ref}
        nomeDaCapa={nomeDaCapa}
      />
      <TextoDoCartao titulo={c.nome} detalhe={textoDoProgresso(c)} />
    </Link>
  )
}

function textoFaltam(faltam: number, modulo: string) {
  return faltam === 1
    ? `Falta 1 aula para fechar ${modulo}`
    : `Faltam ${faltam} aulas para fechar ${modulo}`
}

/**
 * A próxima aula no topo: o que importa é a aula, não a capa. A capa vem menor, ao lado; o título da
 * aula, o módulo, quanto falta para fecha-lo (em palavras e numa barra legível) e o "Continuar", que
 * abre a aula onde a aluna parou. O cartão inteiro é o link.
 */
export function DestaqueContinuar({
  d,
  nomeDaCapa,
}: {
  d: DestaqueDeMeusCursos<GrupoDaVitrine['cursos'][number]>
  nomeDaCapa?: string
}) {
  const url = urlDaImagem(d.curso.capaHorizontal ?? d.curso.capaVertical)
  const [ref, cores] = useCartelaAoEntrar<HTMLDivElement>(url)
  return (
    <section aria-label="Continuar de onde parou">
      <Link
        to="/aulas/$aulaId"
        params={{ aulaId: d.aulaId }}
        data-testid="destaque-continuar"
        className="group grid max-w-5xl gap-4 no-underline pressiona-cartao md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] md:items-center md:gap-8"
      >
        <Capa url={url} capaRef={ref} nomeDaCapa={nomeDaCapa} />
        <div className="flex min-w-0 flex-col gap-2">
          <span className="text-sm leading-5 text-muted-foreground [overflow-wrap:anywhere]">
            {d.curso.nome} · {d.moduloNome}
          </span>
          <span className="text-2xl leading-8 font-semibold tracking-[-0.02em] text-foreground [overflow-wrap:anywhere] md:text-3xl md:leading-9">
            {d.aulaTitulo}
          </span>
          <div className="mt-1 flex max-w-sm flex-col gap-1.5">
            <BarraDaCartela
              value={d.curso.percentual}
              cor={cores[0]}
              trilho={TRILHOS_DA_BARRA.modulo}
              aria-label="Progresso do curso"
              className="h-1.5"
            />
            <span className="text-sm leading-5 tracking-[0.01em] text-muted-foreground tabular-nums [overflow-wrap:anywhere]">
              {textoFaltam(d.faltam, 'o módulo')}
            </span>
          </div>
          <span className={`${buttonVariants({ size: 'lg' })} mt-2 self-start`}>
            <Play className="size-4" aria-hidden="true" />
            Continuar
          </span>
        </div>
      </Link>
    </section>
  )
}
