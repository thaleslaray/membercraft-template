import { createFileRoute, Link, notFound } from '@tanstack/react-router'
import {
  ChevronLeft,
  ChevronRight,
  Ellipsis,
  ListVideo,
  Lock,
  ThumbsUp,
} from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Voltar } from '#/components/casca/voltar'
import { AulaLume } from '#/components/casca-lume/aula-lume'
import { AvaliacaoDaAula } from '#/components/conteudo/avaliacao-da-aula'
import { BotaoFavorito } from '#/components/conteudo/botao-favorito'
import { CartaoDoFimDoVideo } from '#/components/conteudo/cartao-do-fim-do-video'
import { ComentariosDaAula } from '#/components/conteudo/comentarios-da-aula'
import { ConclusaoDoMarco } from '#/components/conteudo/conclusao'
import { ListaDeAulas } from '#/components/conteudo/lista-de-aulas'
import { MarcaDeConcluida } from '#/components/conteudo/marca-de-concluida'
import { Materiais } from '#/components/conteudo/materiais-da-aula'
import {
  LARGURA_DO_VIDEO,
  PlayerDaAula,
} from '#/components/conteudo/player-da-aula'
import { QuizDaAula } from '#/components/conteudo/quiz-da-aula'
import { TextoDaAula } from '#/components/conteudo/texto-da-aula'
import { useAula } from '#/components/conteudo/use-aula'
import { Button } from '#/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog'
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from '#/components/ui/drawer'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '#/components/ui/dropdown-menu'
import { Kbd } from '#/components/ui/kbd'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '#/components/ui/tooltip'
import { appConfig } from '#/config/app'
import { useAparencia } from '#/lib/aparencia-queries'
import {
  avaliacaoDaAulaQuery,
  comentariosDaAulaQuery,
} from '#/lib/aula-queries'
import { urlDaImagem } from '#/lib/imagens'
import { paginaDaAulaFn } from '#/lib/paginas-fns'
import { cn } from '#/lib/utils'
import { listaAbertaInicial } from '#/regras/aula-nova'
import { textoDosColegas } from '#/regras/colegas'
import { materiaisForaDoTexto } from '#/regras/materiais-no-texto'
import { personalizarTexto } from '#/regras/nome-na-aula'

const CHAVE_DA_LISTA = 'lista-de-aulas'
const ID_DA_LISTA = 'painel-da-lista'

function lerLista(): boolean {
  let guardado: string | null = null
  try {
    guardado = window.localStorage.getItem(CHAVE_DA_LISTA)
  } catch {
    // Sem armazenamento (janela privada): vale o padrão.
  }
  return listaAbertaInicial(guardado, window.innerWidth)
}

function guardarLista(aberta: boolean) {
  try {
    window.localStorage.setItem(CHAVE_DA_LISTA, aberta ? 'aberta' : 'fechada')
  } catch {
    // Sem armazenamento: a escolha só vale nesta visita.
  }
}

const NO_DESKTOP = '(min-width: 1024px)'

// Aula (#95): o vídeo em foco, o título colado embaixo, os materiais como itens e os comentários, numa
// coluna de leitura. A lista do curso é um painel só (botão ou tecla L), que encolhe o vídeo sem cobri-lo.

// A aula de vídeo se conclui em silêncio aos 90%; a de texto, pelo botão no fim do conteúdo.
/** Ações abaixo do título: fantasmas iguais, ícone de 16 px e rótulo no tom secundário. */
const ACAO_DA_AULA =
  'h-8 gap-1.5 px-2.5 font-normal text-muted-foreground transition-colors hover:text-foreground [&_svg]:size-4'

export const Route = createFileRoute('/_aluno/aulas/$aulaId')({
  // `t`: segundo do vídeo em que abrir (resultado da busca nas transcrições).
  // `como`: a equipe vê a aula como aluno de uma turma ("ver como aluno").
  // `aba`: aba aberta na casca Lume (sobre, materiais, quiz ou comentarios).
  validateSearch: (
    search: Record<string, unknown>,
  ): { t?: number; como?: string; aba?: string } => {
    const t = Math.floor(Number(search.t))
    const como =
      typeof search.como === 'string' && search.como ? search.como : undefined
    const aba =
      typeof search.aba === 'string' &&
      ['sobre', 'materiais', 'quiz', 'comentarios'].includes(search.aba)
        ? search.aba
        : undefined
    return {
      ...(t > 0 && t < 86_400 ? { t } : {}),
      ...(como ? { como } : {}),
      ...(aba ? { aba } : {}),
    }
  },
  loaderDeps: ({ search }) => ({ como: search.como }),
  // UMA chamada ao servidor traz tudo (aula, progresso, passo, favoritos, quiz, nota e comentários).
  // A nota e os comentários vão para o cache do TanStack Query, de onde os componentes os leem.
  loader: async ({ params, deps, context }) => {
    const pagina = await paginaDaAulaFn({
      data: { id: params.aulaId, como: deps.como },
    })
    if (!pagina) throw notFound()
    const { avaliacao, comentarios, ...resto } = pagina
    if (comentarios) {
      context.queryClient.setQueryData(
        avaliacaoDaAulaQuery(params.aulaId).queryKey,
        avaliacao,
      )
      context.queryClient.setQueryData(
        comentariosDaAulaQuery(params.aulaId).queryKey,
        { pages: [comentarios], pageParams: [1] },
      )
    }
    return resto
  },
  head: ({ loaderData }) => ({
    meta: [
      {
        title: loaderData
          ? `${loaderData.aula.titulo} · ${appConfig.name}`
          : appConfig.name,
      },
    ],
    // O player do Vimeo é um iframe de player.vimeo.com (único endereço liberado em `frame-src`): abrir a
    // conexão já com a página poupa a ida e volta do TLS quando o vídeo aparece. A CSP não restringe `preconnect`.
    links: loaderData?.aula.vimeoId
      ? [{ rel: 'preconnect', href: 'https://player.vimeo.com' }]
      : [],
  }),
  component: PaginaDaAula,
})

function PaginaDaAula() {
  const { casca } = useAparencia()
  return casca === 'lume' ? <AulaDoLume /> : <PaginaDaAulaClassica />
}

function AulaDoLume() {
  const dados = Route.useLoaderData()
  const { t, como, aba } = Route.useSearch()
  const { session } = Route.useRouteContext()
  return (
    <AulaLume
      dados={dados}
      como={como}
      abaDaUrl={aba}
      tempoInicial={t}
      nomeDoAluno={session.user.name}
      proximaAulaSozinha={session.user.proximaAulaSozinha}
    />
  )
}

function PaginaDaAulaClassica() {
  const dados = Route.useLoaderData()
  const {
    aula,
    curso,
    modulo,
    anterior,
    proxima,
    modulos,
    progresso,
    concluidas,
    favoritas,
    quiz,
    situacao,
    situacoes,
    colegas,
  } = dados
  const materiais = materiaisForaDoTexto(dados.materiais, aula.textoHtml)
  const { t, como } = Route.useSearch()
  const { session } = Route.useRouteContext()
  // Lista do curso: painel à direita no desktop (lembrado no aparelho), gaveta "Aulas" no celular.
  const [lista, setLista] = useState(false)
  const [gaveta, setGaveta] = useState(false)
  useEffect(() => setLista(lerLista()), [])
  // biome-ignore lint/correctness/useExhaustiveDependencies: fecha a gaveta a cada aula aberta
  useEffect(() => setGaveta(false), [aula.id])
  const alternarLista = useCallback(() => {
    if (window.matchMedia(NO_DESKTOP).matches) {
      setLista((aberta) => {
        guardarLista(!aberta)
        return !aberta
      })
    } else {
      setGaveta((aberta) => !aberta)
    }
  }, [])
  const {
    fuso,
    comoBusca,
    salvando,
    celebracao,
    despachar,
    fim,
    avaliando,
    sozinha,
    mudarSozinha,
    areaDoPlayer,
    cores,
    concluida,
    faltaAprovar,
    situacaoDoMod,
    aulaDaProxima,
    situacaoDaProxima,
    modoDoCartao,
    irParaAProxima,
    ficarAqui,
    alternarConclusao,
    textoVisivel,
    semConteudo,
    concluiPeloBotao,
    textoDoCadeado,
    aoConcluirVideo,
    aoTerminarVideo,
  } = useAula({
    dados,
    como,
    proximaAulaSozinha: session.user.proximaAulaSozinha,
    aoTeclarL: alternarLista,
  })

  if (situacao.tipo === 'cadeado') {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
        <div className="grid size-14 place-items-center rounded-full bg-muted">
          <Lock className="size-6 text-muted-foreground" aria-hidden="true" />
        </div>
        <div className="text-xs text-muted-foreground">
          {curso.nome} · {modulo.nome}
        </div>
        <h1 className="text-xl font-semibold">{aula.titulo}</h1>
        <p className="text-muted-foreground" role="status">
          {textoDoCadeado(situacao, fuso)}
        </p>
        <Button variant="outline" asChild>
          <Link
            to="/cursos/$cursoId"
            params={{ cursoId: curso.id }}
            search={comoBusca}
          >
            Voltar ao curso
          </Link>
        </Button>
      </main>
    )
  }

  const listaDeAulas = (
    <ListaDeAulas
      cursoNome={curso.nome}
      modulos={modulos}
      moduloAtualId={modulo.id}
      aulaAtualId={aula.id}
      concluidas={concluidas}
      situacoes={situacoes.aulas}
      busca={comoBusca}
    />
  )

  const iconeDeNavegacao = 'size-9'

  return (
    <main className="relative mx-auto flex w-full flex-1 flex-col overflow-x-clip px-4 pb-16 md:px-6">
      <div
        className={cn(
          'mx-auto flex w-full flex-col',
          aula.vimeoId
            ? lista
              ? 'max-w-[96rem]'
              : 'max-w-[80rem]'
            : lista
              ? 'max-w-[71.5rem]'
              : 'max-w-3xl',
        )}
      >
        {/* Barra mínima da aula: voltar ao curso, aula anterior e próxima, e a lista. */}
        <div
          className={cn(
            'flex h-12 items-center justify-between gap-2',
            aula.vimeoId && !lista && LARGURA_DO_VIDEO,
          )}
        >
          <div className="min-w-0 flex-1">
            <Voltar
              destino={{
                to: '/cursos/$cursoId',
                params: { cursoId: curso.id },
                search: comoBusca,
              }}
            >
              {curso.nome}
            </Voltar>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {anterior ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    asChild
                    className={iconeDeNavegacao}
                  >
                    <Link
                      to="/aulas/$aulaId"
                      params={{ aulaId: anterior.id }}
                      search={comoBusca}
                      aria-label="Anterior"
                      aria-keyshortcuts="ArrowLeft"
                    >
                      <ChevronLeft />
                    </Link>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  Aula anterior <Kbd>←</Kbd>
                </TooltipContent>
              </Tooltip>
            ) : null}
            {proxima ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    asChild
                    className={iconeDeNavegacao}
                  >
                    <Link
                      to="/aulas/$aulaId"
                      params={{ aulaId: proxima.id }}
                      search={comoBusca}
                      aria-label="Próxima"
                      aria-keyshortcuts="ArrowRight"
                    >
                      <ChevronRight />
                    </Link>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  Próxima aula <Kbd>→</Kbd>
                </TooltipContent>
              </Tooltip>
            ) : null}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={alternarLista}
                  aria-keyshortcuts="L"
                  aria-expanded={lista || gaveta}
                  aria-controls={ID_DA_LISTA}
                  className="h-9 px-3"
                >
                  <ListVideo />
                  Aulas
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                Lista de aulas <Kbd>L</Kbd>
              </TooltipContent>
            </Tooltip>
          </div>
        </div>

        <div
          className={cn(
            'relative grid items-start gap-x-6',
            lista && 'lg:grid-cols-[minmax(0,1fr)_22rem]',
          )}
        >
          <div className="flex min-w-0 flex-col gap-6">
            {aula.vimeoId && (
              <div ref={areaDoPlayer}>
                <PlayerDaAula
                  key={`${aula.id}-${t ?? 0}`}
                  aulaId={aula.id}
                  titulo={aula.titulo}
                  vimeoId={aula.vimeoId}
                  vimeoHash={aula.vimeoHash}
                  posicaoInicial={progresso?.ultimaPosicao ?? 0}
                  tempoInicial={t}
                  aoConcluir={aoConcluirVideo}
                  aoTerminar={aoTerminarVideo}
                >
                  {fim && (
                    <CartaoDoFimDoVideo
                      aulaId={aula.id}
                      aulaTitulo={aula.titulo}
                      modo={modoDoCartao}
                      proxima={
                        proxima && modoDoCartao !== 'sem-proxima'
                          ? {
                              titulo: proxima.titulo,
                              capa:
                                urlDaImagem(aulaDaProxima?.miniatura) ??
                                urlDaImagem(curso.capaHorizontal),
                            }
                          : null
                      }
                      motivoDoCadeado={
                        situacaoDaProxima?.tipo === 'cadeado'
                          ? textoDoCadeado(situacaoDaProxima, fuso)
                          : null
                      }
                      aoAssistir={irParaAProxima}
                      aoFicar={ficarAqui}
                    />
                  )}
                </PlayerDaAula>
              </div>
            )}

            <div
              className={cn(
                'flex flex-col gap-3',
                aula.vimeoId && LARGURA_DO_VIDEO,
              )}
            >
              <div className="min-w-0">
                <h1 className="text-2xl leading-tight font-semibold tracking-[-0.01em] text-balance md:text-3xl">
                  {aula.titulo}
                </h1>
                <p className="mt-1.5 text-sm text-muted-foreground">
                  {modulo.nome}
                  {situacaoDoMod.texto ? ` · ${situacaoDoMod.texto}` : ''}
                  {colegas !== null && (
                    <span data-testid="colegas-da-semana">
                      {` · ${textoDosColegas(colegas)}`}
                    </span>
                  )}
                </p>
              </div>
              {/* Ações à vista, numa linha discreta: concluir (na aula de vídeo; sem vídeo o botão
                  fica no fim do conteúdo), favoritar e avaliar. O ⋯ guarda só a preferência. */}
              <div className="-ml-2.5 flex items-center gap-1">
                {!concluiPeloBotao && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    aria-disabled={salvando || (faltaAprovar && !concluida)}
                    aria-describedby={
                      faltaAprovar && !concluida
                        ? 'aviso-quiz-concluir'
                        : undefined
                    }
                    aria-pressed={concluida}
                    title={concluida ? 'Clique para desmarcar' : undefined}
                    onClick={alternarConclusao}
                    className={cn(
                      ACAO_DA_AULA,
                      'aria-disabled:cursor-not-allowed aria-disabled:opacity-50',
                      concluida && 'text-primary hover:text-primary',
                    )}
                  >
                    <MarcaDeConcluida concluida={concluida} />
                    {concluida ? 'Concluída' : 'Concluir aula'}
                  </Button>
                )}
                <BotaoFavorito
                  key={aula.id}
                  discreto
                  className={ACAO_DA_AULA}
                  aulaId={aula.id}
                  titulo={aula.titulo}
                  favoritaInicial={favoritas.includes(aula.id)}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className={ACAO_DA_AULA}
                  onClick={() => despachar({ tipo: 'abrirAvaliacao' })}
                >
                  <ThumbsUp />
                  Avaliar
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Mais opções da aula"
                      className="ml-auto text-muted-foreground hover:text-foreground"
                    >
                      <Ellipsis />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-64">
                    <DropdownMenuCheckboxItem
                      checked={sozinha}
                      onCheckedChange={(v) => void mudarSozinha(v === true)}
                    >
                      Tocar a próxima sozinha
                    </DropdownMenuCheckboxItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                      {curso.nome} › {modulo.nome}
                    </DropdownMenuLabel>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>

            {/* Tudo abaixo do vídeo sai da mesma margem do título; o texto fica em até 48 rem. */}
            <div className={cn('w-full', aula.vimeoId && LARGURA_DO_VIDEO)}>
              <div className="mt-2 flex w-full max-w-3xl min-w-0 flex-col gap-8">
                {faltaAprovar && !concluida && (
                  <p
                    id="aviso-quiz-concluir"
                    className="text-sm text-muted-foreground"
                  >
                    Para concluir esta aula, seja aprovado no exercício.
                  </p>
                )}

                {quiz?.soQuiz && (
                  <QuizDaAula
                    key={`quiz-${aula.id}`}
                    aulaId={aula.id}
                    quiz={quiz}
                    nomeDoAluno={session.user.name}
                  />
                )}

                {semConteudo && (
                  <p className="text-sm text-muted-foreground">
                    Esta aula não tem vídeo nem texto. Deixe sua nota e seu
                    comentário logo abaixo.
                  </p>
                )}

                {materiais.length > 0 && !textoVisivel && (
                  <Materiais materiais={materiais} />
                )}

                {textoVisivel && (
                  <TextoDaAula
                    html={personalizarTexto(aula.textoHtml, session.user.name)}
                    cursoId={curso.id}
                  />
                )}

                {materiais.length > 0 && textoVisivel && (
                  <Materiais materiais={materiais} />
                )}

                {quiz && !quiz.soQuiz && (
                  <QuizDaAula
                    key={`quiz-${aula.id}`}
                    aulaId={aula.id}
                    quiz={quiz}
                    nomeDoAluno={session.user.name}
                  />
                )}

                {concluiPeloBotao && (
                  <div>
                    <Button
                      type="button"
                      variant={concluida ? 'outline' : 'default'}
                      aria-disabled={salvando || (faltaAprovar && !concluida)}
                      aria-describedby={
                        faltaAprovar && !concluida
                          ? 'aviso-quiz-concluir'
                          : undefined
                      }
                      onClick={alternarConclusao}
                      aria-pressed={concluida}
                      title={concluida ? 'Clique para desmarcar' : undefined}
                      className={cn('h-11 px-6', concluida && 'text-primary')}
                    >
                      <MarcaDeConcluida concluida={concluida} />
                      {concluida ? 'Concluída' : 'Concluir aula'}
                    </Button>
                  </div>
                )}

                <ComentariosDaAula
                  key={`comentarios-${aula.id}`}
                  aulaId={aula.id}
                />
              </div>
            </div>
          </div>

          {/* Painel da lista (desktop). Só `transform` e `opacity` animam: o vídeo encolhe de uma vez e o
              painel desliza para dentro; fechar volta pelo mesmo caminho e pode ser revertido no meio. */}
          <aside
            id={ID_DA_LISTA}
            data-state={lista ? 'open' : 'closed'}
            inert={!lista}
            className={cn(
              'material-painel max-lg:hidden flex w-[22rem] flex-col overflow-hidden rounded-xl border transition-[transform,opacity,visibility] duration-lento ease-saida motion-reduce:translate-x-0',
              lista
                ? 'sticky top-20 col-start-2 row-start-1 self-start max-h-[calc(100svh-6rem)] translate-x-0 opacity-100'
                : // O módulo aberto da lista força `visibility: visible`; fechado o painel, esconde junto.
                  'invisible absolute top-0 right-0 translate-x-[110%] opacity-0 [&_.recolhe]:invisible!',
            )}
          >
            {listaDeAulas}
          </aside>
        </div>
      </div>

      {/* Celular: a lista abre numa gaveta. */}
      <Drawer open={gaveta} onOpenChange={setGaveta}>
        <DrawerContent className="max-h-[85svh] lg:hidden">
          <DrawerHeader className="sr-only">
            <DrawerTitle>Aulas do curso</DrawerTitle>
            <DrawerDescription>
              Todos os módulos de {curso.nome}, com a aula atual marcada.
            </DrawerDescription>
          </DrawerHeader>
          {gaveta && listaDeAulas}
        </DrawerContent>
      </Drawer>

      <Dialog
        open={avaliando}
        onOpenChange={(aberto) => {
          if (!aberto) despachar({ tipo: 'fechar' })
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader className="sr-only">
            <DialogTitle>Avaliar a aula</DialogTitle>
            <DialogDescription>
              Dê uma nota de 1 a 5 para {aula.titulo}.
            </DialogDescription>
          </DialogHeader>
          <AvaliacaoDaAula key={`avaliacao-${aula.id}`} aulaId={aula.id} />
        </DialogContent>
      </Dialog>

      <ConclusaoDoMarco
        marco={celebracao?.marco ?? null}
        aoFechar={() => despachar({ tipo: 'fechar' })}
        cursoId={curso.id}
        cursoNome={curso.nome}
        modulos={celebracao?.anel ?? []}
        cores={cores}
        percentual={celebracao?.percentual ?? 0}
        proximaAulaId={proxima?.id ?? null}
        busca={comoBusca}
      />
    </main>
  )
}
