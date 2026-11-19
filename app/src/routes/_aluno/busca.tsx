import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { Lock, Search, Star } from 'lucide-react'
import {
  APOIO_NA_REGUA,
  BOTAO_FORTE,
  CARD_DE_LEITURA,
  TITULO_DE_APOIO,
  VAO_DA_LEITURA,
} from '#/components/casca-lume/pagina-lume'
import { MostrarMais, useMostrarMais } from '#/components/painel/mostrar-mais'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import { Card } from '#/components/ui/card'
import { Input } from '#/components/ui/input'
import { EsqueletoDaBusca } from '#/components/vazio/esqueletos'
import { TelaVazia } from '#/components/vazio/tela-vazia'
import { appConfig } from '#/config/app'
import { pendingMsDaRota, useCarregandoRota } from '#/lib/carregamento-da-rota'
import { buscaFn } from '#/lib/favoritos-fns'
import { FILTROS_DA_BUSCA, type FiltroDaBusca } from '#/regras/busca-filtros'

const ROTULOS: Record<FiltroDaBusca, string> = {
  todos: 'Todos',
  cursos: 'Cursos',
  modulos: 'Módulos',
  aulas: 'Aulas',
  favoritos: 'Favoritos',
}

const TIPOS = { curso: 'Curso', modulo: 'Módulo', aula: 'Aula' } as const

function minutos(segundos: number) {
  const m = Math.floor(segundos / 60)
  const s = String(segundos % 60).padStart(2, '0')
  return `${m}:${s}`
}

// Busca do aluno: títulos e textos dos cursos em que ele tem matrícula, com filtros e a
// contagem de cada um.
export const Route = createFileRoute('/_aluno/busca')({
  validateSearch: (
    search: Record<string, unknown>,
  ): { q: string; filtro: FiltroDaBusca; como?: string } => ({
    q: typeof search.q === 'string' ? search.q : '',
    filtro: (FILTROS_DA_BUSCA as readonly unknown[]).includes(search.filtro)
      ? (search.filtro as FiltroDaBusca)
      : ('todos' as FiltroDaBusca),
    // `como`: a equipe busca como aluno de uma turma ("ver como aluno").
    ...(typeof search.como === 'string' && search.como
      ? { como: search.como }
      : {}),
  }),
  loaderDeps: ({ search }) => ({
    q: search.q,
    filtro: search.filtro,
    como: search.como,
  }),
  loader: ({ deps }) =>
    buscaFn({ data: { termo: deps.q, filtro: deps.filtro, como: deps.como } }),
  head: () => ({ meta: [{ title: `Busca · ${appConfig.name}` }] }),
  pendingComponent: EsqueletoDaBusca,
  // Só o primeiro carregamento mostra o esqueleto; trocar filtro ou página apaga o conteúdo antigo.
  get pendingMs() {
    return pendingMsDaRota('/_aluno/busca')
  },
  component: PaginaDeBusca,
})

function PaginaDeBusca() {
  const carregando = useCarregandoRota()
  const { q, como } = Route.useSearch()
  const comoBusca = como ? { como } : {}
  const { termo, filtro, contagem, resultados } = Route.useLoaderData()
  const navegar = useNavigate()
  const { visiveis, aoMostrarMais } = useMostrarMais(
    resultados.length,
    `${q}|${filtro}`,
  )

  return (
    <main
      aria-busy={carregando}
      data-pendente={carregando}
      className={`transition-opacity duration-base ease-saida data-[pendente=true]:opacity-50 flex flex-1 flex-col gap-6 mx-auto w-full max-w-[58rem] px-4 pt-6 pb-8 md:px-8 md:py-14 ${APOIO_NA_REGUA}`}
    >
      <div className="flex flex-col gap-1">
        <h1 className={`text-2xl leading-8 font-semibold ${TITULO_DE_APOIO}`}>
          Busca
        </h1>
        <p className="text-muted-foreground">
          {q.trim()
            ? `Resultados para “${q.trim()}” nos seus cursos.`
            : 'Digite uma palavra para buscar nos títulos, textos e vídeos dos seus cursos.'}
        </p>
      </div>

      {/* Campo da própria página: refina a busca sem voltar ao topo (e é a busca do celular). */}
      <search className="relative max-w-xl">
        <form
          className="relative"
          onSubmit={(e) => {
            e.preventDefault()
            const novo = String(
              new FormData(e.currentTarget).get('q') ?? '',
            ).trim()
            if (novo)
              navegar({
                to: '/busca',
                search: { q: novo, filtro, ...comoBusca },
              })
          }}
        >
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            key={q}
            type="search"
            name="q"
            defaultValue={q}
            aria-label="Buscar nos seus cursos"
            placeholder="Buscar aulas e vídeos…"
            className="h-11 pl-9"
          />
        </form>
      </search>

      <nav aria-label="Filtros da busca" className="flex flex-wrap gap-2">
        {FILTROS_DA_BUSCA.map((f) => (
          <Link
            key={f}
            to="/busca"
            search={{ q, filtro: f, ...comoBusca }}
            aria-current={f === filtro ? 'true' : undefined}
            className={`rounded-full border px-3 py-1 text-sm no-underline ${f === filtro ? `border-primary bg-primary text-primary-foreground in-data-[casca=lume]:border-(color:--botao-forte) ${BOTAO_FORTE}` : 'text-foreground hover:bg-accent'}`}
          >
            {ROTULOS[f]} ({contagem[f]})
          </Link>
        ))}
      </nav>

      {termo && resultados.length === 0 && (
        <TelaVazia
          ilustracao="cartela"
          titulo="Nada encontrado"
          texto="Tente outra palavra ou outro filtro."
          acao={
            filtro !== 'todos' ? (
              <Button asChild className={BOTAO_FORTE}>
                <Link to="/busca" search={{ q, filtro: 'todos', ...comoBusca }}>
                  Ver todos os resultados
                </Link>
              </Button>
            ) : (
              <Button asChild className={BOTAO_FORTE}>
                <Link
                  to="/busca"
                  search={{ q: '', filtro: 'todos', ...comoBusca }}
                >
                  Limpar a busca
                </Link>
              </Button>
            )
          }
        />
      )}

      <ul
        className={`flex flex-col gap-3 ${VAO_DA_LEITURA}`}
        aria-label="Resultados"
      >
        {resultados.slice(0, visiveis).map((r) => {
          const miolo = (
            <Card
              className={`gap-1 p-4 ${CARD_DE_LEITURA} in-data-[casca=lume]:px-[calc(1rem*var(--leitura-recuo))]`}
            >
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">{TIPOS[r.tipo]}</Badge>
                <span className="font-medium text-card-foreground">
                  {r.titulo}
                </span>
                {r.favorita && (
                  <Star
                    className="size-4 fill-current text-primary"
                    role="img"
                    aria-label="Favorita"
                  />
                )}
                {r.bloqueio && (
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Lock className="size-3.5" aria-hidden="true" />
                    {r.bloqueio}
                  </span>
                )}
              </div>
              <div className="text-xs text-muted-foreground">
                {r.cursoNome}
                {r.moduloNome && r.tipo === 'aula' ? ` · ${r.moduloNome}` : ''}
                {r.tempo !== null
                  ? ` · falado no vídeo, aos ${minutos(r.tempo)}`
                  : ''}
              </div>
              {r.trecho && (
                <p className="text-sm text-muted-foreground">{r.trecho}</p>
              )}
            </Card>
          )
          return (
            <li key={`${r.tipo}-${r.aulaId ?? r.moduloId ?? r.cursoId}`}>
              {r.bloqueio ? (
                miolo
              ) : r.aulaId ? (
                <Link
                  to="/aulas/$aulaId"
                  params={{ aulaId: r.aulaId }}
                  search={{
                    ...(r.tempo !== null ? { t: r.tempo } : {}),
                    ...comoBusca,
                  }}
                  className="no-underline"
                >
                  {miolo}
                </Link>
              ) : (
                <Link
                  to="/cursos/$cursoId"
                  params={{ cursoId: r.cursoId }}
                  search={comoBusca}
                  className="no-underline"
                >
                  {miolo}
                </Link>
              )}
            </li>
          )
        })}
      </ul>
      <MostrarMais
        visiveis={visiveis}
        total={resultados.length}
        aoMostrarMais={aoMostrarMais}
      />
    </main>
  )
}
