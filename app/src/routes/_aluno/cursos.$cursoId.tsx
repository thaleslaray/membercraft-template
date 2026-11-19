import { createFileRoute, Link, notFound } from '@tanstack/react-router'
import { CheckCircle2, FileText, PlayCircle } from 'lucide-react'
import { useState } from 'react'
import { Voltar } from '#/components/casca/voltar'
import { CursoLume } from '#/components/casca-lume/curso-lume'
import { CaminhoDoCertificado } from '#/components/certificados/caminho-do-certificado'
import {
  CertificadoDoTopo,
  FolhaDoCertificado,
  previaDisponivel,
} from '#/components/certificados/certificado-do-curso'
import { BotaoFavorito } from '#/components/conteudo/botao-favorito'
import { Cadeado } from '#/components/conteudo/cadeado'
import {
  AnelDoCurso,
  FaixaDaCartela,
  tingimentoDoCabecalho,
  useCartela,
} from '#/components/conteudo/cartela'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '#/components/ui/accordion'
import { Button } from '#/components/ui/button'
import { EsqueletoDoCursoDaCasca } from '#/components/vazio/esqueletos'
import { TelaVazia } from '#/components/vazio/tela-vazia'
import { appConfig } from '#/config/app'
import { useAparencia } from '#/lib/aparencia-queries'
import { nomeDaCapa } from '#/lib/capa'
import { botaoDoCurso, modulosAbertos } from '#/lib/curso-tela'
import { urlDaImagem } from '#/lib/imagens'
import { paginaDoCursoFn } from '#/lib/paginas-fns'
import { cn } from '#/lib/utils'

// Página do curso: capa, percentual concluído, um botão principal ("Continuar: <aula>", "Começar: <aula>",
// "Ver certificado" ou "Rever o curso"), a situação do certificado, a descrição e os módulos com as aulas.
export const Route = createFileRoute('/_aluno/cursos/$cursoId')({
  // `como`: a equipe vê o curso como aluno de uma turma ("ver como aluno").
  // `modulo`: id do módulo escolhido na casca Lume (voltar e recarregar caem no mesmo módulo).
  validateSearch: (
    search: Record<string, unknown>,
  ): { como?: string; modulo?: string; q?: string } => ({
    ...(typeof search.como === 'string' && search.como
      ? { como: search.como }
      : {}),
    ...(typeof search.q === 'string' && search.q.trim()
      ? { q: search.q.slice(0, 100) }
      : {}),
    ...(typeof search.modulo === 'string' && search.modulo
      ? { modulo: search.modulo }
      : {}),
  }),
  loaderDeps: ({ search }) => ({ como: search.como }),
  // UMA chamada ao servidor traz o curso, o passo, os favoritos e o certificado.
  loader: async ({ params, deps }) => {
    const pagina = await paginaDoCursoFn({
      data: { id: params.cursoId, como: deps.como },
    })
    if (!pagina) throw notFound()
    return pagina
  },
  head: ({ loaderData }) => ({
    meta: [
      {
        title: loaderData
          ? `${loaderData.curso.nome} · ${appConfig.name}`
          : appConfig.name,
      },
    ],
  }),
  pendingComponent: EsqueletoDoCursoDaCasca,
  component: PaginaDoCurso,
})

function PaginaDoCurso() {
  const { casca } = useAparencia()
  return casca === 'lume' ? <CursoDoLume /> : <PaginaDoCursoClassica />
}

function CursoDoLume() {
  const pagina = Route.useLoaderData()
  const { como, modulo, q } = Route.useSearch()
  return (
    <CursoLume pagina={pagina} como={como} moduloId={modulo} termoDaBusca={q} />
  )
}

function PaginaDoCursoClassica() {
  const { curso, modulos, passo, favoritas, situacoes, certificado } =
    Route.useLoaderData()
  const { como } = Route.useSearch()
  const comoBusca = como ? { como } : {}
  const totalDeAulas = modulos.reduce((n, m) => n + m.aulas.length, 0)
  const concluidas = passo?.concluidas ?? []
  const percentual = passo?.percentual ?? 0
  const [certificadoAberto, setCertificadoAberto] = useState(false)
  const botao = botaoDoCurso({
    modulos,
    passo,
    certificadoPronto: previaDisponivel(certificado),
  })
  // O "próxima aula" da lista segue o passo; curso terminado não marca nenhuma.
  const destino = passo?.proximaAulaId ?? null
  // A cartela da capa colore o anel: cada módulo um arco na sua cor.
  const cores = useCartela(urlDaImagem(curso.capaHorizontal))
  const feitas = new Set(concluidas)
  const totalFeitas = modulos.reduce(
    (n, m) => n + m.aulas.filter((a) => feitas.has(a.id)).length,
    0,
  )
  // Abertos de início: os módulos não concluídos e sempre o da próxima aula.
  const abertos = modulosAbertos(modulos, concluidas, destino)
  const capa = urlDaImagem(curso.capaHorizontal)
  // Sobre o cabeçalho tingido, o texto de apoio precisa de mais contraste que o cinza padrão.
  const mudo = cores.length > 0 ? 'text-foreground/75' : 'text-muted-foreground'

  return (
    // Medidas da área antiga (Memberkit, tema Classic, medido em 12/11/2026): fundo slate-50, bloco de
    // 1152 px centrado com a coluna do resumo de 352 px, 48 px de vão e os módulos em cartões brancos.
    <main
      className="relative isolate flex flex-1 flex-col gap-6 bg-surface px-4 py-8 md:px-8 md:py-12"
      style={tingimentoDoCabecalho(cores)}
    >
      {cores.length > 0 && (
        <>
          {/* Faixa de blocos chapados no topo; o cabeçalho (aside) leva o tingimento. */}
          <FaixaDaCartela cores={cores} className="absolute inset-x-0 top-0" />
        </>
      )}
      <div className="mx-auto w-full max-w-6xl">
        <Voltar destino={{ to: '/' }}>Meus cursos</Voltar>
      </div>
      {como && (
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-3 rounded-md border bg-muted px-4 py-2 text-sm">
          <span>
            Você está vendo este curso como aluno, com as regras de liberação de
            uma turma.
          </span>
          <Link
            to="/cursos/$cursoId"
            params={{ cursoId: curso.id }}
            search={{}}
            className="ml-auto"
          >
            Sair
          </Link>
        </div>
      )}
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 lg:grid lg:grid-cols-[22rem_minmax(0,1fr)] lg:items-start lg:gap-12">
        <aside
          className={cn(
            'flex flex-col lg:sticky lg:top-24 lg:pt-6',
            // Cabeçalho tingido de leve com a primeira cor da capa, envolvendo título, anel e botão.
            cores.length > 0 &&
              'rounded-lg bg-[color-mix(in_srgb,var(--tinta)_8%,transparent)] p-5 lg:pt-5 dark:bg-[color-mix(in_srgb,var(--tinta)_6%,transparent)]',
          )}
        >
          {capa && (
            // A capa do cartão de Meus cursos vira o topo daqui: o mesmo nome na transição entre telas.
            <img
              src={capa}
              alt=""
              className="mb-4 aspect-video w-full rounded-md object-cover"
              style={{ viewTransitionName: nomeDaCapa(curso.id) }}
            />
          )}
          <h1 className="text-xl leading-7 font-medium tracking-[-0.01em]">
            {curso.nome}
          </h1>
          {/* A descrição curta faz de subtítulo, como na área antiga. */}
          {curso.descricao && curso.descricao.trim() !== curso.nome && (
            <p className={cn('mt-1 whitespace-pre-line text-base', mudo)}>
              {curso.descricao}
            </p>
          )}
          <p
            className={cn(
              'mt-2 flex flex-wrap gap-x-3 text-[13px] leading-5 font-medium',
              mudo,
            )}
          >
            {curso.cargaHoraria !== null && <span>{curso.cargaHoraria}h</span>}
            <span>
              {totalDeAulas} {totalDeAulas === 1 ? 'conteúdo' : 'conteúdos'}
            </span>
          </p>
          <div className="mt-5 flex items-center gap-4">
            <AnelDoCurso
              modulos={modulos.map((m) => ({
                total: m.aulas.length,
                feitas: m.aulas.filter((a) => feitas.has(a.id)).length,
              }))}
              cores={cores}
              rotulo={`Progresso do curso: ${percentual}%, ${totalFeitas} de ${totalDeAulas} aulas`}
            >
              <span className="text-base leading-6 font-medium tabular-nums">
                {percentual}%
              </span>
            </AnelDoCurso>
            <div className="flex flex-col gap-0.5 text-sm">
              <span className="font-medium">
                {percentual === 100
                  ? 'Curso concluído'
                  : percentual === 0
                    ? 'Ainda não começou'
                    : 'Em andamento'}
              </span>
              <span className={cn('tabular-nums', mudo)}>
                {totalFeitas} de {totalDeAulas} aulas · {modulos.length}{' '}
                {modulos.length === 1 ? 'módulo' : 'módulos'}
              </span>
            </div>
          </div>
          {botao && (
            <Button
              asChild={botao.tipo === 'aula'}
              size="lg"
              className="mt-6 h-11 w-full min-w-0 whitespace-nowrap"
              onClick={
                botao.tipo === 'certificado'
                  ? () => setCertificadoAberto(true)
                  : undefined
              }
            >
              {botao.tipo === 'aula' ? (
                <Link
                  to="/aulas/$aulaId"
                  params={{ aulaId: botao.aulaId }}
                  search={comoBusca}
                >
                  {/* Uma linha só: o nome da aula perde o fim com reticências; o texto inteiro segue no DOM. */}
                  <span className="min-w-0 truncate">{botao.rotulo}</span>
                </Link>
              ) : (
                botao.rotulo
              )}
            </Button>
          )}

          <div className="mt-6 empty:hidden">
            <CertificadoDoTopo
              situacao={certificado}
              aoAbrir={() => setCertificadoAberto(true)}
            />
          </div>
          {certificado.tipo !== 'emitido' && (
            <CaminhoDoCertificado cursoId={curso.id} className="mt-6" />
          )}
        </aside>

        <section className="flex flex-col gap-6" aria-label="Módulos">
          {modulos.length === 0 && (
            <TelaVazia
              ilustracao="tecido"
              titulo="Este curso ainda não tem aulas"
              texto="Assim que a equipe publicar, elas aparecem aqui."
            />
          )}
          <Accordion
            key={curso.id}
            type="multiple"
            defaultValue={abertos}
            className="flex flex-col gap-6"
          >
            {modulos.map((m, i) => (
              <AccordionItem
                key={m.id}
                value={m.id}
                className="overflow-hidden rounded-lg border bg-card shadow-xs last:border-b"
              >
                <AccordionTrigger
                  seta="inicio"
                  nivel={2}
                  className="h-20 items-center gap-2 rounded-none px-6 py-0 text-base leading-6 font-medium hover:bg-accent/40"
                >
                  <span
                    aria-hidden="true"
                    className="size-2.5 shrink-0 rounded-full"
                    style={{
                      background: cores.length
                        ? cores[i % cores.length]
                        : 'var(--primary)',
                    }}
                  />
                  <span className="min-w-0 flex-1">{m.nome}</span>
                  <span className="shrink-0 text-[13px] font-normal text-muted-foreground tabular-nums">
                    {m.aulas.filter((a) => feitas.has(a.id)).length}/
                    {m.aulas.length}
                  </span>
                  <Cadeado situacao={situacoes.modulos[m.id]} />
                </AccordionTrigger>
                <AccordionContent className="p-0">
                  {m.aulas.length > 0 && (
                    <ul>
                      {m.aulas.map((a) => {
                        const travada =
                          situacoes.aulas[a.id]?.tipo === 'cadeado'
                        const miniatura = urlDaImagem(a.miniatura)
                        const Icone = a.temVideo ? PlayCircle : FileText
                        const proxima = a.id === destino
                        return (
                          <li
                            key={a.id}
                            className="flex items-center gap-3 border-t border-border/50 py-4 pr-5 pl-6"
                          >
                            <Link
                              to="/aulas/$aulaId"
                              params={{ aulaId: a.id }}
                              search={comoBusca}
                              className={`flex min-w-0 flex-1 items-center gap-3 text-base leading-6 no-underline hover:text-primary ${travada ? 'text-muted-foreground' : 'text-foreground'}`}
                            >
                              {miniatura ? (
                                <img
                                  src={miniatura}
                                  alt=""
                                  loading="lazy"
                                  className="-my-1 aspect-video w-12 shrink-0 rounded object-cover"
                                />
                              ) : (
                                <Icone
                                  className="size-5 shrink-0 text-muted-foreground/60"
                                  aria-hidden="true"
                                />
                              )}
                              <span className="min-w-0 flex-1 truncate">
                                {a.titulo}
                                {proxima && (
                                  <small className="ml-1 text-[11.2px] leading-none text-primary">
                                    <span aria-hidden="true">- </span>
                                    próxima aula
                                  </small>
                                )}
                              </span>
                              <Cadeado situacao={situacoes.aulas[a.id]} />
                              {concluidas.includes(a.id) && (
                                <CheckCircle2
                                  className="size-5 shrink-0 text-primary"
                                  role="img"
                                  aria-label="Concluída"
                                />
                              )}
                            </Link>
                            <BotaoFavorito
                              compacto
                              className="-my-1.5"
                              aulaId={a.id}
                              titulo={a.titulo}
                              favoritaInicial={favoritas.includes(a.id)}
                            />
                          </li>
                        )
                      })}
                    </ul>
                  )}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </section>
      </div>
      {previaDisponivel(certificado) && (
        <FolhaDoCertificado
          emitido={certificado}
          aberta={certificadoAberto}
          aoMudar={setCertificadoAberto}
        />
      )}
    </main>
  )
}
