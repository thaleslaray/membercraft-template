import {
  createFileRoute,
  Link,
  notFound,
  useNavigate,
  useRouter,
} from '@tanstack/react-router'
import {
  Bell,
  BellOff,
  Check,
  CheckCircle2,
  Download,
  Lock,
  LockOpen,
  MessageSquare,
  Pencil,
  Pin,
  PinOff,
  Trash2,
} from 'lucide-react'
import { useRef, useState } from 'react'
import { Voltar } from '#/components/casca/voltar'
import {
  PAGINA_NA_REGUA,
  TITULO_DE_CONTEUDO,
} from '#/components/casca-lume/pagina-lume'
import { FormularioDeComentario } from '#/components/comunidade/formulario-de-comentario'
import { FormularioDePublicacao } from '#/components/comunidade/formulario-de-publicacao'
import { IconeDaComunidade } from '#/components/comunidade/icone-da-comunidade'
import {
  dataEHora,
  tamanhoLegivel,
  tempoRelativo,
} from '#/components/comunidade/tempo'
import { TextoDaPublicacao } from '#/components/comunidade/texto-da-publicacao'
import {
  AvatarDaPessoa,
  CartaoDePessoa,
  NomeDaPessoa,
} from '#/components/pessoa/pessoa'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog'
import { EsqueletoDaPublicacao } from '#/components/vazio/esqueletos'
import { appConfig } from '#/config/app'
import { useFlip } from '#/hooks/use-flip'
import { useFusoDoAluno } from '#/lib/auth-queries'
import {
  bloquearComentariosFn,
  editarPublicacaoFn,
  excluirComentarioFn,
  excluirPublicacaoFn,
  fixarPublicacaoFn,
  melhorRespostaFn,
  publicacaoFn,
  seguirPublicacaoFn,
} from '#/lib/comunidade-fns'
import { exigirComunidadeLigada } from '#/lib/guardas'
import { toast } from '#/lib/toast'
import type { ComentarioDaTela, PublicacaoDaTela } from '#/regras/publicacoes'

export const Route = createFileRoute(
  '/_aluno/comunidades/publicacoes/$publicacaoId',
)({
  beforeLoad: ({ context }) => exigirComunidadeLigada(context),
  head: () => ({ meta: [{ title: `Publicação · ${appConfig.name}` }] }),
  validateSearch: (search: Record<string, unknown>): { pagina?: number } => {
    const pagina = Math.floor(Number(search.pagina))
    return pagina > 1 ? { pagina } : {}
  },
  loaderDeps: ({ search }) => ({ pagina: search.pagina ?? 1 }),
  loader: async ({ params, deps }) => {
    const publicacao = await publicacaoFn({
      data: { id: params.publicacaoId, pagina: deps.pagina },
    })
    if (!publicacao) throw notFound()
    return publicacao
  },
  pendingComponent: EsqueletoDaPublicacao,
  component: PaginaDaPublicacao,
})

function PaginaDaPublicacao() {
  const fuso = useFusoDoAluno()
  const p = Route.useLoaderData()
  const router = useRouter()
  const navegar = useNavigate()
  const [editando, setEditando] = useState(false)
  const [excluindo, setExcluindo] = useState(false)
  const [ocupado, setOcupado] = useState(false)
  const podeMexer = p.eu.souAutor || p.eu.souEquipe
  const botaoEditarRef = useRef<HTMLButtonElement>(null)
  const tituloDosComentariosRef = useRef<HTMLHeadingElement>(null)

  // Ao fechar o formulário o botão "Editar" volta a existir; devolve o foco a ele
  // (senão o foco cai no body).
  function fecharEdicao() {
    setEditando(false)
    requestAnimationFrame(() => botaoEditarRef.current?.focus())
  }

  async function acao(fazer: () => Promise<unknown>, sucesso?: string) {
    setOcupado(true)
    try {
      await fazer()
      if (sucesso) toast.success(sucesso)
      await router.invalidate()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Não deu certo.')
    } finally {
      setOcupado(false)
    }
  }

  // O comentário excluído some e leva o foco junto; manda para o título da seção.
  function focarTituloDosComentarios() {
    requestAnimationFrame(() => tituloDosComentariosRef.current?.focus())
  }

  // Melhor resposta otimista: muda na hora e volta se o servidor recusar. `undefined` = o que o servidor diz.
  const [melhorOtimista, setMelhorOtimista] = useState<
    string | null | undefined
  >(undefined)
  const todos = [
    ...(p.melhorResposta ? [p.melhorResposta] : []),
    ...p.comentarios,
  ]
  const melhorId =
    melhorOtimista !== undefined
      ? melhorOtimista
      : (p.melhorResposta?.id ?? null)
  const melhor = melhorId
    ? (todos.find((c) => c.id === melhorId) ?? null)
    : null
  const demais = todos
    .filter((c) => c.id !== melhorId)
    .sort((a, b) => a.criadoEm.getTime() - b.criadoEm.getTime())
  const { ref: secaoDosComentarios, medir } = useFlip<HTMLElement>(melhorId)

  async function marcarMelhor(comentarioId: string | null) {
    const anterior = p.melhorResposta?.id ?? null
    medir()
    setMelhorOtimista(comentarioId)
    try {
      await melhorRespostaFn({
        data: { publicacaoId: p.id, comentarioId },
      })
      if (comentarioId) {
        toast.comDesfazer(
          'Melhor resposta marcada.',
          () => void marcarMelhor(anterior),
        )
      }
      await router.invalidate()
    } catch (e) {
      medir()
      toast.error(e instanceof Error ? e.message : 'Não deu certo.')
    } finally {
      setMelhorOtimista(undefined)
    }
  }

  const silenciada = p.situacaoDoSeguidor === 'silenciada'
  const seguindo = p.situacaoDoSeguidor === 'seguindo'

  return (
    <main
      className={`flex flex-1 flex-col gap-6 mx-auto w-full max-w-[59rem] px-4 pt-6 pb-8 md:px-8 md:py-14 ${PAGINA_NA_REGUA}`}
    >
      <Voltar destino={{ to: '/comunidades' }}>Comunidade</Voltar>
      <Link
        to="/comunidades"
        search={{ comunidade: p.comunidade.id }}
        className="inline-flex items-center gap-2 text-sm text-muted-foreground no-underline hover:text-foreground"
      >
        <IconeDaComunidade
          icone={p.comunidade.icone}
          cor={p.comunidade.cor}
          className="size-5 rounded [&_svg]:size-3"
        />
        {p.comunidade.nome}
      </Link>

      {editando ? (
        <section aria-label="Editar publicação">
          <FormularioDePublicacao
            inicial={{
              titulo: p.titulo,
              textoHtml: p.textoHtml,
              anexos: p.anexos,
            }}
            rotuloDoBotao="Salvar"
            aoCancelar={fecharEdicao}
            aoEnviar={async (dados) => {
              await editarPublicacaoFn({
                data: {
                  id: p.id,
                  titulo: dados.titulo,
                  textoHtml: dados.textoHtml,
                  anexos: dados.anexos,
                },
              })
              await router.invalidate()
              fecharEdicao()
            }}
          />
        </section>
      ) : (
        <article className="flex flex-col gap-4">
          <header className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <h1
                className={`text-2xl leading-8 font-semibold [overflow-wrap:anywhere] ${TITULO_DE_CONTEUDO}`}
              >
                {p.titulo}
              </h1>
              {p.fixada && (
                <Badge variant="outline">
                  <Pin aria-hidden="true" />
                  Fixada
                </Badge>
              )}
              {melhorId !== null ? (
                <Badge variant="secondary">
                  <CheckCircle2 aria-hidden="true" />
                  Resolvida
                </Badge>
              ) : (
                <Badge variant="outline">Em aberto</Badge>
              )}
              {p.comentariosBloqueados && (
                <Badge variant="outline">
                  <Lock aria-hidden="true" />
                  Comentários bloqueados
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              <CartaoDePessoa
                pessoa={p.autor}
                rotulo={`${p.autor.nome}, ver perfil`}
              >
                <AvatarDaPessoa pessoa={p.autor} />
              </CartaoDePessoa>
              <div className="flex flex-col">
                <CartaoDePessoa pessoa={p.autor}>
                  <NomeDaPessoa pessoa={p.autor} />
                </CartaoDePessoa>
                <span title={dataEHora(p.criadoEm, fuso)}>
                  {tempoRelativo(p.criadoEm, fuso)}
                  {p.editadoEm && ' · editada'}
                </span>
              </div>
            </div>
          </header>

          <TextoDaPublicacao html={p.textoHtml} />

          {p.anexos.length > 0 && (
            <ul aria-label="Anexos" className="flex flex-col gap-1.5">
              {p.anexos.map((a) => (
                <li key={a.id}>
                  <a
                    href={`/api/comunidade/anexos/${a.id}`}
                    download
                    className="inline-flex items-center gap-2 rounded-md border bg-surface px-3 py-1.5 text-sm text-foreground no-underline hover:bg-accent"
                  >
                    <Download className="size-4" aria-hidden="true" />
                    {a.nome}
                    <span className="text-xs text-muted-foreground">
                      ({tamanhoLegivel(a.tamanho)})
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          )}

          <div className="flex flex-wrap gap-2 border-t pt-4">
            <Button
              variant="outline"
              size="sm"
              className="toque:h-11"
              disabled={ocupado}
              onClick={() =>
                acao(
                  () =>
                    seguirPublicacaoFn({
                      data: {
                        id: p.id,
                        situacao: seguindo ? 'silenciada' : 'seguindo',
                      },
                    }),
                  seguindo
                    ? 'Publicação silenciada. Você não receberá avisos.'
                    : 'Você vai receber os comentários novos no sininho.',
                )
              }
            >
              {seguindo ? <BellOff /> : <Bell />}
              {seguindo
                ? 'Silenciar'
                : silenciada
                  ? 'Voltar a seguir'
                  : 'Seguir'}
            </Button>
            {podeMexer && (
              <>
                <Button
                  ref={botaoEditarRef}
                  variant="outline"
                  size="sm"
                  className="toque:h-11"
                  onClick={() => setEditando(true)}
                >
                  <Pencil />
                  Editar
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="toque:h-11"
                  onClick={() => setExcluindo(true)}
                >
                  <Trash2 />
                  Excluir
                </Button>
              </>
            )}
            {p.eu.souEquipe && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  className="toque:h-11"
                  disabled={ocupado}
                  onClick={() =>
                    acao(() =>
                      fixarPublicacaoFn({
                        data: { id: p.id, fixada: !p.fixada },
                      }),
                    )
                  }
                >
                  {p.fixada ? <PinOff /> : <Pin />}
                  {p.fixada ? 'Desafixar' : 'Fixar'}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="toque:h-11"
                  disabled={ocupado}
                  onClick={() =>
                    acao(() =>
                      bloquearComentariosFn({
                        data: {
                          id: p.id,
                          bloqueados: !p.comentariosBloqueados,
                        },
                      }),
                    )
                  }
                >
                  {p.comentariosBloqueados ? <LockOpen /> : <Lock />}
                  {p.comentariosBloqueados
                    ? 'Liberar comentários'
                    : 'Bloquear comentários'}
                </Button>
              </>
            )}
          </div>
        </article>
      )}

      <section
        ref={secaoDosComentarios}
        aria-label="Comentários"
        className="flex flex-col gap-4"
      >
        <h2
          ref={tituloDosComentariosRef}
          tabIndex={-1}
          className="flex items-center gap-2 text-lg font-semibold outline-none"
        >
          <MessageSquare className="size-5" aria-hidden="true" />
          {p.totalDeComentarios}{' '}
          {p.totalDeComentarios === 1 ? 'comentário' : 'comentários'}
        </h2>

        {melhor && (
          <div
            data-flip={melhor.id}
            className="flex flex-col gap-2 rounded-[var(--radius-card)] border-2 border-primary/40 bg-surface p-3"
          >
            <p className="flex items-center gap-1.5 text-sm font-medium text-primary">
              <CheckCircle2 className="size-4" aria-hidden="true" />
              Melhor resposta
            </p>
            <Comentario
              comentario={melhor}
              publicacao={p}
              aoExcluir={focarTituloDosComentarios}
              aoMarcar={marcarMelhor}
              melhor
            />
          </div>
        )}

        {demais.length === 0 && !melhor && (
          <p className="text-sm text-muted-foreground">
            Ninguém comentou ainda.
          </p>
        )}
        <ul className="flex flex-col gap-4">
          {demais.map((c) => (
            <li key={c.id} data-flip={c.id}>
              <Comentario
                comentario={c}
                publicacao={p}
                aoExcluir={focarTituloDosComentarios}
                aoMarcar={marcarMelhor}
              />
            </li>
          ))}
        </ul>

        {p.totalDePaginas > 1 && (
          <nav
            aria-label="Páginas de comentários"
            className="flex items-center justify-between gap-3"
          >
            {p.pagina > 1 ? (
              <Button
                asChild
                variant="outline"
                size="sm"
                className="toque:h-11"
              >
                <Link
                  to="."
                  search={{
                    pagina: p.pagina - 1 > 1 ? p.pagina - 1 : undefined,
                  }}
                >
                  Página anterior
                </Link>
              </Button>
            ) : (
              <Button
                variant="outline"
                size="sm"
                className="toque:h-11"
                disabled
              >
                Página anterior
              </Button>
            )}
            <span className="text-sm text-muted-foreground">
              Página {p.pagina} de {p.totalDePaginas}
            </span>
            {p.pagina < p.totalDePaginas ? (
              <Button
                asChild
                variant="outline"
                size="sm"
                className="toque:h-11"
              >
                <Link to="." search={{ pagina: p.pagina + 1 }}>
                  Próxima página
                </Link>
              </Button>
            ) : (
              <Button
                variant="outline"
                size="sm"
                className="toque:h-11"
                disabled
              >
                Próxima página
              </Button>
            )}
          </nav>
        )}

        {p.podeComentar ? (
          <div className="border-t pt-4">
            <FormularioDeComentario
              publicacaoId={p.id}
              rotulo="Escreva um comentário"
              aoConcluir={() => router.invalidate()}
            />
          </div>
        ) : (
          <p className="flex items-center gap-2 border-t pt-4 text-sm text-muted-foreground">
            <Lock className="size-4" aria-hidden="true" />A equipe bloqueou os
            comentários desta publicação.
          </p>
        )}
      </section>

      <Dialog open={excluindo} onOpenChange={setExcluindo}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Excluir esta publicação?</DialogTitle>
            <DialogDescription>
              A publicação e os comentários somem das comunidades.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setExcluindo(false)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              disabled={ocupado}
              onClick={() =>
                acao(async () => {
                  await excluirPublicacaoFn({ data: { id: p.id } })
                  await navegar({ to: '/comunidades' })
                }, 'Publicação excluída.')
              }
            >
              Excluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  )
}

function Comentario({
  comentario: c,
  publicacao: p,
  aoExcluir,
  aoMarcar,
  melhor = false,
  resposta = false,
}: {
  comentario: ComentarioDaTela
  publicacao: PublicacaoDaTela
  aoExcluir: () => void
  aoMarcar?: (comentarioId: string | null) => void
  melhor?: boolean
  resposta?: boolean
}) {
  const fuso = useFusoDoAluno()
  const router = useRouter()
  const [respondendo, setRespondendo] = useState(false)
  const [editando, setEditando] = useState(false)
  const [excluindo, setExcluindo] = useState(false)
  const [ocupado, setOcupado] = useState(false)
  const botaoEditarRef = useRef<HTMLButtonElement>(null)
  const dele = c.autor.id === p.eu.id
  const podeMexer = dele || p.eu.souEquipe
  const podeMarcar = (p.eu.souAutor || p.eu.souEquipe) && !resposta

  async function acao(fazer: () => Promise<unknown>) {
    setOcupado(true)
    try {
      await fazer()
      await router.invalidate()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Não deu certo.')
    } finally {
      setOcupado(false)
    }
  }

  // Ao fechar o formulário de edição, devolve o foco ao "Editar" que o abriu.
  function fecharEdicao() {
    setEditando(false)
    requestAnimationFrame(() => botaoEditarRef.current?.focus())
  }

  return (
    <article
      aria-label={`Comentário de ${c.autor.nome}`}
      className="flex gap-3"
    >
      <span className="shrink-0">
        <CartaoDePessoa pessoa={c.autor} rotulo={`${c.autor.nome}, ver perfil`}>
          <AvatarDaPessoa pessoa={c.autor} />
        </CartaoDePessoa>
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex flex-wrap items-baseline gap-x-2 text-sm">
          <CartaoDePessoa pessoa={c.autor}>
            <NomeDaPessoa pessoa={c.autor} />
          </CartaoDePessoa>
          <span
            className="text-xs text-muted-foreground"
            title={dataEHora(c.criadoEm, fuso)}
          >
            {tempoRelativo(c.criadoEm, fuso)}
            {c.editadoEm && ' · editado'}
          </span>
        </div>

        {editando ? (
          <FormularioDeComentario
            publicacaoId={p.id}
            editarId={c.id}
            textoInicial={c.texto}
            rotulo="Editar comentário"
            rotuloDoBotao="Salvar"
            aoConcluir={async () => {
              await router.invalidate()
              fecharEdicao()
            }}
            aoCancelar={fecharEdicao}
          />
        ) : (
          <p className="text-[15px] leading-relaxed break-words whitespace-pre-wrap">
            {c.texto}
          </p>
        )}

        {!editando && (
          <div className="flex flex-wrap gap-1 text-xs">
            {!resposta && p.podeComentar && (
              <Button
                variant="ghost"
                size="xs"
                className="toque:h-11"
                aria-expanded={respondendo}
                onClick={() => setRespondendo((v) => !v)}
              >
                Responder
              </Button>
            )}
            {podeMarcar && (
              <Button
                variant="ghost"
                size="xs"
                className="toque:h-11"
                onClick={() => aoMarcar?.(melhor ? null : c.id)}
              >
                <Check />
                {melhor ? 'Desmarcar melhor resposta' : 'Melhor resposta'}
              </Button>
            )}
            {podeMexer && (
              <>
                <Button
                  ref={botaoEditarRef}
                  variant="ghost"
                  size="xs"
                  className="toque:h-11"
                  onClick={() => setEditando(true)}
                >
                  <Pencil />
                  Editar
                </Button>
                <Button
                  variant="ghost"
                  size="xs"
                  className="toque:h-11"
                  onClick={() => setExcluindo(true)}
                >
                  <Trash2 />
                  Excluir
                </Button>
              </>
            )}
          </div>
        )}

        {c.respostas.length > 0 && (
          <ul className="flex flex-col gap-3 border-l-2 pl-4">
            {c.respostas.map((r) => (
              <li key={r.id}>
                <Comentario
                  comentario={r}
                  publicacao={p}
                  aoExcluir={aoExcluir}
                  resposta
                />
              </li>
            ))}
          </ul>
        )}

        {respondendo && (
          <div className="border-l-2 pl-4">
            <FormularioDeComentario
              publicacaoId={p.id}
              paiId={c.id}
              rotulo={`Responder a ${c.autor.nome}`}
              rotuloDoBotao="Responder"
              aoConcluir={async () => {
                setRespondendo(false)
                await router.invalidate()
              }}
              aoCancelar={() => setRespondendo(false)}
            />
          </div>
        )}
      </div>

      <Dialog open={excluindo} onOpenChange={setExcluindo}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Excluir este comentário?</DialogTitle>
            <DialogDescription>
              {resposta
                ? 'O comentário some da publicação.'
                : 'O comentário e as respostas a ele somem da publicação.'}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setExcluindo(false)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              disabled={ocupado}
              onClick={() =>
                acao(async () => {
                  await excluirComentarioFn({ data: { id: c.id } })
                  setExcluindo(false)
                  aoExcluir()
                })
              }
            >
              Excluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </article>
  )
}
