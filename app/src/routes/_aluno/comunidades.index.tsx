import { createFileRoute, useRouterState } from '@tanstack/react-router'
import { Search } from 'lucide-react'
import { type FormEvent, useCallback, useEffect, useRef, useState } from 'react'
import {
  BOTAO_FORTE,
  PAGINA_NA_REGUA,
  TITULO_DA_PAGINA,
  VAO_DA_LEITURA,
} from '#/components/casca-lume/pagina-lume'
import { AbasDaComunidade } from '#/components/comunidade/abas-da-comunidade'
import {
  CartaoDePublicacao,
  type ItemDoMural,
} from '#/components/comunidade/cartao-de-publicacao'
import { CompositorDoMural } from '#/components/comunidade/compositor-do-mural'
import { RankingDaComunidade } from '#/components/comunidade/ranking-da-comunidade'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { EsqueletoDaComunidade } from '#/components/vazio/esqueletos'
import { TelaVazia } from '#/components/vazio/tela-vazia'
import { appConfig } from '#/config/app'
import { useFlip } from '#/hooks/use-flip'
import { type AbaDaComunidade, abaDaBusca } from '#/lib/aba-da-comunidade'
import { pendingMsDaRota, useCarregandoRota } from '#/lib/carregamento-da-rota'
import { comunidadesFn, publicacoesFn } from '#/lib/comunidade-fns'
import { exigirComunidadeLigada } from '#/lib/guardas'
import { atualizarDados, inserirNoTopo, mesclarPaginas } from '#/lib/mural'
import { rankingFn } from '#/lib/pontos-fns'
import { toast } from '#/lib/toast'
import { cn } from '#/lib/utils'

// Comunidade como mural: as publicações de todas as comunidades que a pessoa enxerga, fixadas
// primeiro e depois a atividade mais recente. A comunidade, "Sem resposta", "Resolvidas" e a busca
// são filtros e moram na URL, então o link de um mural filtrado se compartilha. A aba Ranking
// (`?aba=ranking`, com `curso` para o ranking de um curso) troca o conteúdo abaixo das abas.
interface Busca {
  aba?: AbaDaComunidade
  curso?: string
  comunidade?: string
  status?: 'sem-resposta' | 'resolvidas'
  q?: string
}

export const Route = createFileRoute('/_aluno/comunidades/')({
  beforeLoad: ({ context }) => exigirComunidadeLigada(context),
  head: () => ({ meta: [{ title: `Comunidade · ${appConfig.name}` }] }),
  validateSearch: (search: Record<string, unknown>): Busca => ({
    ...(abaDaBusca(search.aba) ? { aba: 'ranking' as const } : {}),
    ...(typeof search.curso === 'string' && search.curso
      ? { curso: search.curso }
      : {}),
    ...(typeof search.comunidade === 'string' && search.comunidade
      ? { comunidade: search.comunidade }
      : {}),
    ...(search.status === 'sem-resposta' || search.status === 'resolvidas'
      ? { status: search.status }
      : {}),
    ...(typeof search.q === 'string' && search.q.trim()
      ? { q: search.q.trim().slice(0, 100) }
      : {}),
  }),
  loaderDeps: ({ search }) => search,
  loader: async ({ deps }) => {
    if (deps.aba === 'ranking') {
      return {
        aba: 'ranking' as const,
        ranking: await rankingFn({ data: { cursoId: deps.curso } }),
      }
    }
    const [menu, lista] = await Promise.all([
      comunidadesFn(),
      publicacoesFn({ data: dadosDaLista(deps, 1) }),
    ])
    return { aba: 'mural' as const, menu, lista }
  },
  pendingComponent: EsqueletoDaComunidade,
  // Só o primeiro carregamento mostra o esqueleto; trocar filtro ou página apaga o conteúdo antigo.
  get pendingMs() {
    return pendingMsDaRota('/_aluno/comunidades/')
  },
  component: PaginaDaComunidade,
})

const dadosDaLista = (busca: Busca, pagina: number) => ({
  visao: 'inicio' as const,
  comunidadeId: busca.comunidade,
  status: busca.status ?? ('todas' as const),
  ordem: 'mais-ativas' as const,
  busca: busca.q,
  pagina,
})

// O que já foi carregado de cada filtro. Voltar de uma publicação reabre o mural com as mesmas
// páginas, e assim a restauração de rolagem do roteador cai no mesmo ponto. Só existe no navegador.
interface EstadoDoMural {
  itens: ItemDoMural[]
  pagina: number
  total: number
}
const MAX_NO_CACHE = 8
const cacheDoMural = new Map<string, EstadoDoMural>()
function guardarNoCache(chave: string, estado: EstadoDoMural) {
  cacheDoMural.delete(chave)
  cacheDoMural.set(chave, estado)
  const primeira = cacheDoMural.keys().next().value
  if (cacheDoMural.size > MAX_NO_CACHE && primeira !== undefined)
    cacheDoMural.delete(primeira)
}

function PaginaDaComunidade() {
  const carregando = useCarregandoRota()
  const dados = Route.useLoaderData()
  const busca = Route.useSearch()
  const navegar = Route.useNavigate()
  const { session } = Route.useRouteContext()
  return (
    <main
      aria-busy={carregando}
      data-pendente={carregando}
      className={`transition-opacity duration-base ease-saida data-[pendente=true]:opacity-50 mx-auto flex w-full max-w-[49rem] flex-1 flex-col gap-5 px-4 pt-6 pb-8 md:px-8 md:py-14 ${PAGINA_NA_REGUA}`}
    >
      <div className="flex flex-col gap-1">
        <h1
          className={`text-2xl leading-8 font-semibold tracking-[-0.01em] ${TITULO_DA_PAGINA}`}
        >
          Comunidade
        </h1>
        <p className="text-muted-foreground">
          Troque ideias e tire dúvidas com outras alunas.
        </p>
      </div>

      <AbasDaComunidade aba={busca.aba} />

      {dados.aba === 'ranking' ? (
        <RankingDaComunidade
          dados={dados.ranking}
          eu={{
            id: session.user.id,
            nome: session.user.name,
            imagem: session.user.image ?? null,
          }}
          aoEscolherCurso={(curso) =>
            navegar({ search: { aba: 'ranking', curso } })
          }
        />
      ) : (
        <Mural menu={dados.menu} lista={dados.lista} />
      )}
    </main>
  )
}

function Mural({
  menu,
  lista,
}: {
  menu: Awaited<ReturnType<typeof comunidadesFn>>
  lista: { itens: ItemDoMural[]; total: number; pagina: number }
}) {
  const busca = Route.useSearch()
  const navegar = Route.useNavigate()
  const { session } = Route.useRouteContext()
  const carregando = useRouterState({ select: (s) => s.isLoading })
  const [termo, setTermo] = useState(busca.q ?? '')
  // "Pergunte ou compartilhe algo" da tela vazia abre o compositor lá de cima.
  const [pedidoDeAbrir, setPedidoDeAbrir] = useState(0)
  const chaveDosFiltros = JSON.stringify(busca)
  const podePublicar = menu.comunidades.filter((c) => c.podePublicar)

  const mudar = (novo: Partial<Busca>) =>
    navegar({ search: (antigo) => ({ ...antigo, ...novo }) })

  function buscar(e: FormEvent) {
    e.preventDefault()
    mudar({ q: termo.trim() || undefined })
  }

  const alternar = (status: 'sem-resposta' | 'resolvidas') =>
    mudar({ status: busca.status === status ? undefined : status })

  const filtrando = Boolean(busca.comunidade || busca.status || busca.q)
  const user = session.user

  return (
    <>
      {podePublicar.length > 0 && (
        <CompositorDoMural
          comunidades={podePublicar}
          comunidadeDoFiltro={busca.comunidade}
          pedidoDeAbrir={pedidoDeAbrir}
          autor={{
            id: user.id,
            nome: user.name,
            imagem: user.image ?? null,
            bio: (user as { bio?: string | null }).bio ?? null,
            daEquipe: user.perfil !== 'aluno',
          }}
          {...ganchosDoMural()}
        />
      )}

      {/* Sem nenhuma comunidade não há o que pesquisar nem filtrar: fica só o aviso da lista. */}
      <div
        className="flex flex-col gap-3"
        hidden={menu.comunidades.length === 0 && !filtrando}
      >
        <search>
          <form onSubmit={buscar} className="flex gap-2">
            <Input
              type="search"
              aria-label="Pesquisar publicações"
              placeholder="Pesquisar publicações…"
              value={termo}
              onChange={(e) => setTermo(e.target.value)}
            />
            <Button
              type="submit"
              variant="outline"
              aria-label="Buscar"
              className="toque:h-11 toque:min-w-11"
            >
              <Search />
            </Button>
          </form>
        </search>
        <div className="flex flex-wrap items-center gap-2">
          {menu.comunidades.length > 1 && (
            <select
              aria-label="Comunidade"
              value={busca.comunidade ?? ''}
              onChange={(e) =>
                mudar({ comunidade: e.target.value || undefined })
              }
              className="h-9 toque:h-11 max-w-full min-w-0 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
            >
              <option value="">Todas as comunidades</option>
              {menu.comunidades.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
          )}
          <Button
            variant={busca.status === 'sem-resposta' ? 'default' : 'outline'}
            size="sm"
            aria-pressed={busca.status === 'sem-resposta'}
            className={
              busca.status === 'sem-resposta'
                ? `${BOTAO_FORTE} toque:h-11`
                : 'toque:h-11'
            }
            onClick={() => alternar('sem-resposta')}
          >
            Sem resposta
          </Button>
          <Button
            variant={busca.status === 'resolvidas' ? 'default' : 'outline'}
            size="sm"
            aria-pressed={busca.status === 'resolvidas'}
            className={
              busca.status === 'resolvidas'
                ? `${BOTAO_FORTE} toque:h-11`
                : 'toque:h-11'
            }
            onClick={() => alternar('resolvidas')}
          >
            Resolvidas
          </Button>
        </div>
      </div>

      <div
        className={cn(
          'flex flex-col gap-3 transition-opacity duration-base ease-saida',
          carregando && 'opacity-60',
        )}
        aria-busy={carregando}
      >
        <ListaDoMural
          key={chaveDosFiltros}
          chave={chaveDosFiltros}
          busca={busca}
          primeiraPagina={lista}
          semComunidade={menu.comunidades.length === 0}
          filtrando={filtrando}
          aoPerguntar={
            podePublicar.length > 0
              ? () => setPedidoDeAbrir((n) => n + 1)
              : undefined
          }
          aoLimparFiltros={() => {
            setTermo('')
            navegar({ search: {} })
          }}
        />
      </div>
    </>
  )
}

// A lista fica num componente à parte porque seu estado (páginas já carregadas, itens recém-
// publicados) é por filtro: trocar de filtro recria a lista (`key`), voltar de uma publicação não.
// O otimismo do compositor precisa mexer nessa lista; os dois conversam por esta ponte.
const ponte: {
  otimista: (i: ItemDoMural) => void
  confirmar: (chave: string, id: string) => void
  falhar: (chave: string) => void
} = { otimista: () => {}, confirmar: () => {}, falhar: () => {} }

function ganchosDoMural() {
  return {
    aoOtimista: (i: ItemDoMural) => ponte.otimista(i),
    aoConfirmar: (c: string, id: string) => ponte.confirmar(c, id),
    aoFalhar: (c: string) => ponte.falhar(c),
  }
}

function ListaDoMural({
  chave,
  busca,
  primeiraPagina,
  semComunidade,
  filtrando,
  aoPerguntar,
  aoLimparFiltros,
}: {
  chave: string
  busca: Busca
  primeiraPagina: { itens: ItemDoMural[]; total: number; pagina: number }
  semComunidade: boolean
  filtrando: boolean
  aoPerguntar?: () => void
  aoLimparFiltros: () => void
}) {
  const [estado, setEstado] = useState<EstadoDoMural>(
    () =>
      cacheDoMural.get(chave) ?? {
        itens: primeiraPagina.itens,
        pagina: 1,
        total: primeiraPagina.total,
      },
  )
  const [carregandoMais, setCarregandoMais] = useState(false)
  const emVoo = useRef(false)
  const { ref, medir } = useFlip<HTMLUListElement>(
    estado.itens.map((i) => i.chave ?? i.id).join('|'),
  )

  // Dados novos da primeira página (voltar de uma publicação, invalidação) entram nos itens já na
  // tela sem reordenar; o que o servidor trouxe de novo e ainda não está aqui entra no topo.
  const ultimaPrimeira = useRef(primeiraPagina)
  useEffect(() => {
    if (ultimaPrimeira.current === primeiraPagina) return
    ultimaPrimeira.current = primeiraPagina
    setEstado((e) => ({
      ...e,
      total: primeiraPagina.total,
      itens: atualizarDados(e.itens, primeiraPagina.itens),
    }))
  }, [primeiraPagina])

  useEffect(() => {
    guardarNoCache(chave, estado)
  }, [chave, estado])

  const temMais = estado.itens.length < estado.total

  const carregarMais = useCallback(async () => {
    if (emVoo.current) return
    emVoo.current = true
    setCarregandoMais(true)
    try {
      const proxima = await publicacoesFn({
        data: dadosDaLista(busca, estado.pagina + 1),
      })
      setEstado((e) => ({
        itens: mesclarPaginas(e.itens, proxima.itens),
        pagina: proxima.pagina,
        total: proxima.total,
      }))
    } catch (erro) {
      toast.error(
        erro instanceof Error ? erro.message : 'Não deu para carregar mais.',
      )
    } finally {
      emVoo.current = false
      setCarregandoMais(false)
    }
  }, [busca, estado.pagina])

  // "Carregar mais" sozinho perto do fim; o botão fica de reserva.
  const sentinela = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const alvo = sentinela.current
    if (!alvo || !temMais || typeof IntersectionObserver === 'undefined') return
    const observador = new IntersectionObserver(
      (entradas) => {
        if (entradas.some((e) => e.isIntersecting)) void carregarMais()
      },
      { rootMargin: '0px 0px 400px 0px' },
    )
    observador.observe(alvo)
    return () => observador.disconnect()
  }, [temMais, carregarMais])

  // Ponte do compositor: a publicação nova entra no topo na hora e as outras descem com FLIP.
  useEffect(() => {
    ponte.otimista = (item) => {
      medir()
      setEstado((e) => ({
        ...e,
        total: e.total + 1,
        itens: inserirNoTopo(e.itens, item),
      }))
    }
    ponte.confirmar = (c, id) => {
      setEstado((e) => ({
        ...e,
        itens: e.itens.map((i) =>
          i.chave === c ? { ...i, id, estado: 'publicada' } : i,
        ),
      }))
      window.setTimeout(
        () =>
          setEstado((e) => ({
            ...e,
            itens: e.itens.map((i) =>
              i.chave === c ? { ...i, estado: undefined } : i,
            ),
          })),
        4000,
      )
    }
    ponte.falhar = (c) => {
      medir()
      setEstado((e) => ({
        ...e,
        total: Math.max(0, e.total - 1),
        itens: e.itens.filter((i) => i.chave !== c),
      }))
    }
    return () => {
      ponte.otimista = () => {}
      ponte.confirmar = () => {}
      ponte.falhar = () => {}
    }
  }, [medir])

  if (estado.itens.length === 0) {
    // Três casos: filtro ou busca sem resultado, sem comunidade e mural vazio.
    const { titulo, texto } = filtrando
      ? {
          titulo: 'Nenhuma conversa com esses filtros',
          texto: 'Tente outra palavra ou limpe os filtros.',
        }
      : semComunidade
        ? {
            titulo: 'Você ainda não participa de nenhuma comunidade',
            texto:
              'Quando a equipe liberar uma comunidade para você, as conversas aparecem aqui.',
          }
        : {
            titulo: 'Ainda não há publicações',
            texto: 'Seja a primeira a perguntar ou compartilhar algo.',
          }
    return (
      <TelaVazia
        ilustracao="agulha"
        titulo={titulo}
        texto={texto}
        acao={
          filtrando ? (
            <Button className={BOTAO_FORTE} onClick={aoLimparFiltros}>
              Limpar filtros
            </Button>
          ) : aoPerguntar ? (
            <Button className={BOTAO_FORTE} onClick={aoPerguntar}>
              Pergunte ou compartilhe algo
            </Button>
          ) : undefined
        }
      />
    )
  }

  return (
    <>
      <h2 className="sr-only">Publicações</h2>
      <ul ref={ref} className={`flex flex-col gap-3 ${VAO_DA_LEITURA}`}>
        {estado.itens.map((p) => (
          <CartaoDePublicacao key={p.chave ?? p.id} publicacao={p} />
        ))}
      </ul>
      {temMais && (
        <div ref={sentinela} className="flex justify-center pt-2">
          <Button
            variant="outline"
            size="sm"
            className="toque:h-11"
            disabled={carregandoMais}
            onClick={() => void carregarMais()}
          >
            {carregandoMais ? 'Carregando…' : 'Carregar mais'}
          </Button>
        </div>
      )}
    </>
  )
}
