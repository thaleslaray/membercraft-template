import { getRouteApi } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { TEMPO_DE_RESPOSTA } from '#/components/atendimento/fio'
import { AbasDaComunidade } from '#/components/comunidade/abas-da-comunidade'
import { Card } from '#/components/ui/card'
import { Skeleton } from '#/components/ui/skeleton'
import { useAparencia } from '#/lib/aparencia-queries'

// Esqueletos do aluno (#107): o que a rota mostra enquanto os dados chegam, só depois de
// 300 ms (carregamento lento) e por no mínimo 500 ms, para não piscar (`defaultPendingMs` e
// `defaultPendingMinMs` em src/router.tsx).
// Ficam parados (sem pulso, só o esmaecimento de entrada de `.esqueleto`). Cada um repete o `<main>`, o
// título e o texto de apoio da página pronta, e só troca os dados por blocos das mesmas medidas, então o
// conteúdo chega sem a tela pular. Ao mexer na página, mexa aqui: o e2e `telas-vazias.spec.ts` confere.

/** Contêiner de um esqueleto: ocupado para leitores de tela, com um aviso que só eles ouvem. */
function Carregando({
  className,
  children,
}: {
  className: string
  children: ReactNode
}) {
  return (
    <main className={className} aria-busy="true" data-esqueleto="">
      <p role="status" className="sr-only">
        Carregando…
      </p>
      {children}
    </main>
  )
}

function Cabecalho({
  titulo,
  texto,
  classeDoTitulo = 'text-2xl leading-8 font-semibold',
}: {
  titulo: string
  texto?: ReactNode
  classeDoTitulo?: string
}) {
  return (
    <div className="flex flex-col gap-1">
      <h1 className={classeDoTitulo}>{titulo}</h1>
      {texto && <p className="text-muted-foreground">{texto}</p>}
    </div>
  )
}

const PAGINA_65 =
  'flex flex-1 flex-col gap-6 mx-auto w-full max-w-[65rem] px-4 pt-6 pb-8 md:px-8 md:py-14'

const repetir = (n: number) => Array.from({ length: n }, (_, i) => i)

// ---------- Meus cursos ----------

// Mesma grade de `GrupoDeCursos` em routes/_aluno/index.tsx.
const LISTA_DE_CURSOS =
  '-mx-4 flex snap-x snap-mandatory scroll-px-4 gap-4 overflow-x-auto px-4 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:mx-0 md:grid md:grid-cols-2 md:gap-5 md:overflow-visible md:px-0 md:pb-0 lg:grid-cols-3 2xl:grid-cols-[repeat(4,minmax(0,28rem))]'

export function EsqueletoDeMeusCursos() {
  return (
    <Carregando className="flex flex-1 flex-col gap-10 px-4 py-6 md:px-8 md:py-8 xl:px-16">
      <h1 className="text-3xl leading-9 font-semibold tracking-[-0.02em] [overflow-wrap:anywhere]">
        Meus cursos
      </h1>
      <div className="grid max-w-5xl gap-4 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] md:items-center md:gap-8">
        <Skeleton className="aspect-[2/1] rounded-lg" />
        <div className="flex min-w-0 flex-col gap-2">
          <Skeleton className="h-5 w-1/3" />
          <Skeleton className="h-8 w-4/5 md:h-9" />
          <Skeleton className="h-5 w-3/5" />
          <Skeleton className="mt-2 h-11 w-36" />
        </div>
      </div>
      <section className="flex flex-col gap-5">
        <Skeleton className="h-7 w-40" />
        <ul className={LISTA_DE_CURSOS}>
          {repetir(4).map((i) => (
            <li key={i} className="w-[72%] shrink-0 snap-start md:w-auto">
              <Skeleton className="aspect-[2/1] rounded-lg" />
              <div className="mt-3 flex flex-col gap-1">
                <Skeleton className="h-6 w-4/5" />
                <Skeleton className="h-5 w-1/2" />
              </div>
            </li>
          ))}
        </ul>
      </section>
    </Carregando>
  )
}

// ---------- Favoritos ----------

function LinhasDeLista({ quantas }: { quantas: number }) {
  return (
    <Card className="gap-0 py-0">
      <ul className="divide-y">
        {repetir(quantas).map((i) => (
          <li key={i} className="flex items-center gap-2 pr-2">
            <div className="flex flex-1 flex-col gap-0.5 px-4 py-3">
              <Skeleton className="my-0.5 h-5 w-2/3" />
              <Skeleton className="my-0.5 h-3 w-1/2" />
            </div>
          </li>
        ))}
      </ul>
    </Card>
  )
}

export function EsqueletoDeFavoritos() {
  return (
    <Carregando className={PAGINA_65}>
      <Cabecalho
        titulo="Favoritos"
        texto="As aulas que você marcou com a estrela."
      />
      <LinhasDeLista quantas={6} />
    </Carregando>
  )
}

// ---------- Certificados ----------

export function EsqueletoDeCertificados() {
  return (
    <Carregando className={PAGINA_65}>
      <Cabecalho
        titulo="Certificados"
        texto="Os certificados dos cursos que você concluiu. Eles ficam aqui mesmo depois que o seu acesso termina."
      />
      <ul className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {repetir(2).map((i) => (
          <li key={i}>
            <Skeleton className="aspect-[1.6/1] w-full rounded-lg" />
          </li>
        ))}
      </ul>
    </Carregando>
  )
}

// ---------- Meus pontos ----------

export function EsqueletoDePontos() {
  return (
    <Carregando className={PAGINA_65}>
      <Cabecalho
        titulo="Meus pontos"
        texto="Tudo o que você ganhou ou perdeu."
      />
      <Card className="flex-row items-center gap-3 px-6 py-5">
        <Skeleton className="size-11 rounded-full" />
        <div className="flex flex-col gap-1">
          <p className="text-sm text-muted-foreground">Total</p>
          <Skeleton className="h-8 w-20" />
        </div>
      </Card>
      <Card className="py-0">
        <ul className="divide-y">
          {repetir(8).map((i) => (
            <li key={i} className="flex h-12 items-center gap-4 px-4">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 flex-1" />
              <Skeleton className="h-4 w-10" />
            </li>
          ))}
        </ul>
      </Card>
    </Carregando>
  )
}

// ---------- Busca ----------

export function EsqueletoDaBusca() {
  const { q } = getRouteApi('/_aluno/busca').useSearch()
  return (
    <Carregando className="flex flex-1 flex-col gap-6 mx-auto w-full max-w-[58rem] px-4 pt-6 pb-8 md:px-8 md:py-14">
      <Cabecalho
        titulo="Busca"
        texto={
          q.trim()
            ? `Resultados para “${q.trim()}” nos seus cursos.`
            : 'Digite uma palavra para buscar nos títulos, textos e vídeos dos seus cursos.'
        }
      />
      <Skeleton className="h-11 max-w-xl rounded-md" />
      <div className="flex flex-wrap gap-2">
        {repetir(5).map((i) => (
          <Skeleton key={i} className="h-7 w-24 rounded-full" />
        ))}
      </div>
      <ul className="flex flex-col gap-3">
        {repetir(4).map((i) => (
          <li key={i}>
            <Skeleton className="h-24 w-full rounded-lg" />
          </li>
        ))}
      </ul>
    </Carregando>
  )
}

// ---------- Atendimento ----------

export function EsqueletoDoAtendimento() {
  return (
    <Carregando className="mx-auto flex w-full max-w-[49rem] flex-1 flex-col px-4 md:px-8">
      <header className="flex flex-col gap-1 pt-6 pb-4 md:pt-10">
        <h1 className="text-2xl leading-8 font-semibold tracking-[-0.01em]">
          Falar com a equipe
        </h1>
        <p className="text-sm text-muted-foreground">{TEMPO_DE_RESPOSTA}</p>
      </header>
      <div className="flex flex-1 flex-col justify-end gap-3 pb-4">
        <Skeleton className="h-14 w-3/5 self-start rounded-2xl" />
        <Skeleton className="h-10 w-2/5 self-end rounded-2xl" />
        <Skeleton className="h-16 w-1/2 self-start rounded-2xl" />
      </div>
      <div className="material-barra sticky bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-20 -mx-4 px-4 py-3 md:bottom-0 md:-mx-8 md:px-8">
        <Skeleton className="h-11 w-full rounded-md" />
      </div>
    </Carregando>
  )
}

// ---------- Comunidade ----------

const PAGINA_49 =
  'mx-auto flex w-full max-w-[49rem] flex-1 flex-col gap-5 px-4 pt-6 pb-8 md:px-8 md:py-14'

export function EsqueletoDaComunidade() {
  const { aba } = getRouteApi('/_aluno/comunidades/').useSearch()
  return (
    <Carregando className={PAGINA_49}>
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl leading-8 font-semibold tracking-[-0.01em]">
          Comunidade
        </h1>
        <p className="text-muted-foreground">
          Troque ideias e tire dúvidas com outras alunas.
        </p>
      </div>
      <AbasDaComunidade aba={aba} />
      <Skeleton className="h-[4.25rem] rounded-[var(--radius-card)]" />
      <div className="flex flex-col gap-3">
        <Skeleton className="h-9 w-full rounded-md" />
        <div className="flex gap-2">
          <Skeleton className="h-9 w-40 rounded-md" />
          <Skeleton className="h-8 w-28 rounded-md" />
          <Skeleton className="h-8 w-24 rounded-md" />
        </div>
      </div>
      <ul className="flex flex-col gap-3">
        {repetir(3).map((i) => (
          <li key={i}>
            <Skeleton className="h-36 w-full rounded-[var(--radius-card)]" />
          </li>
        ))}
      </ul>
    </Carregando>
  )
}

export function EsqueletoDeNovaPublicacao() {
  return (
    <Carregando className="flex flex-1 flex-col gap-6 mx-auto w-full max-w-[49rem] px-4 pt-6 pb-8 md:px-8 md:py-14">
      <Skeleton className="h-7 w-28" />
      <Cabecalho titulo="Nova publicação" />
      <Skeleton className="h-9 w-full rounded-md" />
      <Skeleton className="h-64 w-full rounded-md" />
    </Carregando>
  )
}

export function EsqueletoDaPublicacao() {
  return (
    <Carregando className="flex flex-1 flex-col gap-6 mx-auto w-full max-w-[59rem] px-4 pt-6 pb-8 md:px-8 md:py-14">
      <Skeleton className="h-7 w-28" />
      <Skeleton className="h-5 w-32" />
      <div className="flex flex-col gap-4">
        <Skeleton className="h-8 w-3/4" />
        <div className="flex items-center gap-3">
          <Skeleton className="size-10 rounded-full" />
          <Skeleton className="h-8 w-40" />
        </div>
        <Skeleton className="h-40 w-full rounded-md" />
      </div>
      <ul className="flex flex-col gap-4">
        {repetir(2).map((i) => (
          <li key={i}>
            <Skeleton className="h-24 w-full rounded-md" />
          </li>
        ))}
      </ul>
    </Carregando>
  )
}

// ---------- Curso ----------

export function EsqueletoDoCurso() {
  return (
    <Carregando className="flex flex-1 flex-col gap-6 px-4 pt-4 pb-8 md:px-8">
      <div className="mx-auto w-full max-w-6xl">
        <Skeleton className="h-7 w-28" />
      </div>
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 lg:grid lg:grid-cols-[22rem_minmax(0,1fr)] lg:items-start lg:gap-12">
        <aside className="flex flex-col gap-3 lg:pt-6">
          <Skeleton className="aspect-video w-full rounded-md" />
          <Skeleton className="h-7 w-4/5" />
          <Skeleton className="h-5 w-1/3" />
          <div className="mt-2 flex items-center gap-4">
            <Skeleton className="size-16 rounded-full" />
            <Skeleton className="h-10 w-40" />
          </div>
          <Skeleton className="mt-3 h-11 w-full rounded-md" />
        </aside>
        <section className="flex flex-col gap-6">
          {repetir(3).map((i) => (
            <Skeleton key={i} className="h-20 w-full rounded-lg" />
          ))}
        </section>
      </div>
    </Carregando>
  )
}

// Curso da casca Lume: mesmas medidas da página pronta (destaque com a capa 16:9 à direita no computador,
// chips de módulo, lista de aulas e a coluna "Sobre o curso").
export function EsqueletoDoCursoLume() {
  return (
    <Carregando className="flex flex-1 flex-col">
      <section className="-mt-(--lume-topo) px-(--pad) pt-[calc(var(--lume-topo)+48px)] pb-10 lume-cel:pt-[calc(var(--lume-topo)+12px)] lume-cel:pb-8">
        <div className="grid max-w-[1400px] items-center gap-10 lume-tela:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lume-cel:gap-6">
          <Skeleton className="aspect-video w-full rounded-[calc(var(--lume-capa)*1.2)] lume-tela:order-2" />
          <div className="flex flex-col gap-3.5">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-[clamp(30px,3.6vw,48px)] w-4/5" />
            <Skeleton className="h-5 w-1/2" />
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="mt-2 h-11 w-44 rounded-full" />
          </div>
        </div>
      </section>
      <div className="grid grid-cols-[minmax(0,1fr)_340px] gap-12 px-(--pad) pt-2 pb-20 max-lg:grid-cols-1 2xl:grid-cols-[minmax(0,1fr)_380px]">
        <section>
          <div className="flex gap-2">
            {repetir(3).map((i) => (
              <Skeleton key={i} className="h-[38px] w-28 rounded-full" />
            ))}
          </div>
          <Skeleton className="mt-6 mb-3 h-8 w-56" />
          <ul className="xl:columns-2 xl:gap-x-10">
            {repetir(6).map((i) => (
              <li key={i} className="break-inside-avoid py-3.5 lume-cel:py-2.5">
                <div className="grid grid-cols-[200px_minmax(0,1fr)] items-center gap-5 lume-cel:grid-cols-[128px_minmax(0,1fr)] lume-cel:gap-3 lume-cel:max-[359px]:grid-cols-[88px_minmax(0,1fr)]">
                  <Skeleton className="aspect-video rounded-md" />
                  <Skeleton className="h-5 w-4/5" />
                </div>
              </li>
            ))}
          </ul>
        </section>
        <Skeleton className="hidden h-40 lg:mt-[62px] lg:block" />
      </div>
    </Carregando>
  )
}

/** O esqueleto do curso segue a casca escolhida na aparência (configuração de casca, não de tema). */
export function EsqueletoDoCursoDaCasca() {
  const { casca } = useAparencia()
  return casca === 'lume' ? <EsqueletoDoCursoLume /> : <EsqueletoDoCurso />
}

// Início da casca Lume: o destaque com a capa e duas fileiras de cartões, nas medidas da página pronta.
export function EsqueletoDoInicioLume() {
  return (
    <Carregando className="flex flex-1 flex-col">
      <section className="-mt-(--lume-topo) px-(--pad) pt-[calc(var(--lume-topo)+48px)] pb-10 lume-cel:pt-[calc(var(--lume-topo)+12px)] lume-cel:pb-8">
        <div className="grid max-w-[1400px] items-center gap-10 lume-tela:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lume-cel:gap-6">
          <Skeleton className="aspect-video w-full rounded-[calc(var(--lume-capa)*1.2)] lume-tela:order-2" />
          <div className="flex flex-col gap-3.5">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-[clamp(30px,3.6vw,48px)] w-4/5" />
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="mt-2 h-11 w-44 rounded-full" />
          </div>
        </div>
      </section>
      <div className="grid gap-11 pt-2 pb-20 lume-cel:gap-9">
        {repetir(2).map((fileira) => (
          <div key={fileira} className="grid gap-3.5">
            <Skeleton className="mx-(--pad) h-[22px] w-44" />
            <div className="flex gap-[22px] overflow-hidden px-(--pad) lume-cel:gap-3">
              {repetir(5).map((i) => (
                <Skeleton
                  key={i}
                  className="aspect-[2/3] w-40 shrink-0 rounded-[var(--lume-capa)] lume-cel:w-32"
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </Carregando>
  )
}

/** O esqueleto do Início segue a casca escolhida na aparência. */
export function EsqueletoDoInicioDaCasca() {
  const { casca } = useAparencia()
  return casca === 'lume' ? (
    <EsqueletoDoInicioLume />
  ) : (
    <EsqueletoDeMeusCursos />
  )
}

// ---------- Conta ----------

export function EsqueletoDaConta() {
  return (
    <Carregando className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 pb-10 md:px-8 md:pb-16">
      <div className="flex flex-col gap-1 pt-6 md:pt-12">
        <h1 className="text-2xl leading-8 font-semibold tracking-[-0.01em]">
          Sua conta
        </h1>
      </div>
      <section className="flex min-w-0 flex-col gap-6 rounded-lg border bg-card p-4 shadow-xs md:p-6">
        <div className="flex items-center gap-4">
          <Skeleton className="size-16 rounded-full" />
          <Skeleton className="h-9 w-32 rounded-md" />
        </div>
        <Skeleton className="h-9 w-full rounded-md" />
        <Skeleton className="h-24 w-full rounded-md" />
      </section>
      <Skeleton className="h-16 w-full rounded-lg" />
    </Carregando>
  )
}
