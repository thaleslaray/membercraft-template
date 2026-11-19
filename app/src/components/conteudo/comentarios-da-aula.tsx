import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query'
import { Ellipsis, MessageSquareOff, Pin, PinOff } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useConfirmar } from '#/components/confirmar'
import {
  AvatarDaPessoa,
  CartaoDePessoa,
  NomeDaPessoa,
  type PessoaNaTela,
} from '#/components/pessoa/pessoa'
import { Button } from '#/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '#/components/ui/dropdown-menu'
import { Textarea } from '#/components/ui/textarea'
import { comentariosDaAulaQuery } from '#/lib/aula-queries'
import { useFusoDoAluno } from '#/lib/auth-queries'
import {
  alterarComentariosFn,
  criarComentarioFn,
  editarComentarioFn,
  excluirComentarioFn,
  fixarComentarioFn,
} from '#/lib/comentarios-fns'
import { formatarDataHoraNoFuso } from '#/lib/datas'
import { toast } from '#/lib/toast'
import { cn } from '#/lib/utils'
import type { ComentarioDaLista } from '#/regras/comentarios'

const LIMITE = 2000

function erroDe(erro: unknown, padrao: string) {
  return erro instanceof Error ? erro.message : padrao
}

// Comentários da aula (#47): conversa com os colegas da mesma turma, resposta de um nível, texto
// simples. O autor edita e exclui o que é dele; a Equipe também fixa, modera e desliga. Componente
// próprio, que a página da aula só encaixa embaixo do conteúdo.
/**
 * `embutido`: dentro de uma aba "Comentários" (casca Lume), sem o traço de cima e com o título só para
 * leitor de tela, porque a aba já diz o nome. A casca clássica usa o padrão.
 */
export function ComentariosDaAula({
  aulaId,
  embutido = false,
}: {
  aulaId: string
  embutido?: boolean
}) {
  const queryClient = useQueryClient()
  const { queryKey: chave } = comentariosDaAulaQuery(aulaId)
  const {
    data,
    isPending,
    isError,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery(comentariosDaAulaQuery(aulaId))
  // Depois de excluir, o comentário some: o foco vai para o título da seção em vez de cair no body.
  const titulo = useRef<HTMLHeadingElement>(null)
  const recarregar = () => queryClient.invalidateQueries({ queryKey: chave })
  const paginas = data?.pages ?? []
  const situacao = paginas[0]
  const ehEquipe = situacao?.ehEquipe ?? false
  const comentarios = paginas.flatMap((p) => p.comentarios)

  async function alterarLigados(alvo: 'aula' | 'modulo', ligados: boolean) {
    try {
      await alterarComentariosFn({ data: { aulaId, alvo, ligados } })
      await recarregar()
      toast.success(
        ligados ? 'Comentários ligados.' : 'Comentários desligados.',
      )
    } catch (erro) {
      toast.error(erroDe(erro, 'Não foi possível alterar.'))
    }
  }

  return (
    <section
      aria-label="Comentários da aula"
      className={cn('flex flex-col gap-4', !embutido && 'border-t pt-6')}
    >
      <div className="flex items-center justify-between gap-2">
        <h2
          ref={titulo}
          tabIndex={-1}
          className={cn(
            'text-sm leading-5 font-medium text-muted-foreground outline-none',
            embutido && 'sr-only',
          )}
        >
          Comentários
        </h2>
        {situacao && ehEquipe && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Moderação dos comentários"
              >
                <Ellipsis />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onSelect={() =>
                  alterarLigados('aula', situacao.desligadosNaAula)
                }
              >
                {situacao.desligadosNaAula
                  ? 'Ligar comentários desta aula'
                  : 'Desligar comentários desta aula'}
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() =>
                  alterarLigados('modulo', situacao.desligadosNoModulo)
                }
              >
                {situacao.desligadosNoModulo
                  ? 'Ligar comentários do módulo'
                  : 'Desligar comentários do módulo'}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {isPending && (
        <p className="text-sm text-muted-foreground">Carregando comentários…</p>
      )}
      {isError && (
        <p className="text-sm text-destructive" role="alert">
          Não foi possível carregar os comentários.
        </p>
      )}

      {situacao && !situacao.ligados && (
        <p
          className="flex items-center gap-2 text-sm text-muted-foreground"
          role="status"
        >
          <MessageSquareOff className="size-4" aria-hidden="true" />
          Os comentários{' '}
          {situacao.desligadosNoModulo ? 'deste módulo' : 'desta aula'} estão
          desligados.
          {ehEquipe && ' Só a equipe vê o que já foi escrito.'}
        </p>
      )}

      {situacao?.ligados && (
        <Formulario
          rotulo="Escreva um comentário"
          botao="Comentar"
          compacto
          aoEnviar={async (texto, chaveDeEnvio) => {
            await criarComentarioFn({ data: { aulaId, texto, chaveDeEnvio } })
            await recarregar()
          }}
        />
      )}

      {situacao && comentarios.length === 0 && situacao.ligados && (
        <p className="text-sm text-muted-foreground">
          Seja a primeira a comentar.
        </p>
      )}

      <ul className="flex flex-col gap-4">
        {comentarios.map((c) => (
          <li key={c.id} className="flex flex-col gap-3">
            <Comentario
              comentario={c}
              ehEquipe={ehEquipe}
              aulaId={aulaId}
              podeResponder={situacao?.ligados ?? false}
              aoMudar={recarregar}
              aoExcluir={() => titulo.current?.focus()}
              aoEnviarResposta={async (texto, chaveDeEnvio) => {
                await criarComentarioFn({
                  data: { aulaId, texto, chaveDeEnvio, paiId: c.id },
                })
                await recarregar()
              }}
            />
            {c.respostas.length > 0 && (
              <ul className="ml-6 flex flex-col gap-3 border-l pl-4">
                {c.respostas.map((r) => (
                  <li key={r.id}>
                    <Comentario
                      comentario={r}
                      ehEquipe={ehEquipe}
                      aulaId={aulaId}
                      podeResponder={false}
                      aoMudar={recarregar}
                      aoExcluir={() => titulo.current?.focus()}
                    />
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>

      {hasNextPage && (
        <div>
          <Button
            type="button"
            variant="outline"
            disabled={isFetchingNextPage}
            onClick={() => fetchNextPage()}
          >
            Ver mais comentários
          </Button>
        </div>
      )}
    </section>
  )
}

// Texto + botão. A chave de envio nasce junto com o formulário e só troca depois do envio que deu
// certo: clique duplo e reenvio depois de erro de rede não criam comentário repetido.
function Formulario({
  rotulo,
  botao,
  inicial = '',
  aoEnviar,
  aoCancelar,
  focar = false,
  compacto = false,
}: {
  rotulo: string
  botao: string
  inicial?: string
  aoEnviar: (texto: string, chaveDeEnvio: string) => Promise<void>
  aoCancelar?: () => void
  /** Responder e Editar abrem a caixa com o cursor nela (e no fim do texto, ao editar). */
  focar?: boolean
  /** Caixa principal: uma linha só até a aluna clicar; o botão aparece quando há texto. */
  compacto?: boolean
}) {
  const [texto, setTexto] = useState(inicial)
  const [chaveDeEnvio, setChaveDeEnvio] = useState(() => crypto.randomUUID())
  const [enviando, setEnviando] = useState(false)
  const [focada, setFocada] = useState(false)
  const aberta = !compacto || focada || texto.length > 0
  // O contador só aparece perto do limite: antes disso é ruído.
  const pertoDoLimite = texto.length > LIMITE - 200

  async function enviar() {
    if (enviando || !texto.trim()) return
    setEnviando(true)
    try {
      await aoEnviar(texto, chaveDeEnvio)
      setTexto('')
      setChaveDeEnvio(crypto.randomUUID())
    } catch (erro) {
      toast.error(erroDe(erro, 'Não foi possível enviar.'))
    } finally {
      setEnviando(false)
    }
  }

  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault()
        void enviar()
      }}
    >
      <Textarea
        aria-label={rotulo}
        placeholder={rotulo}
        value={texto}
        maxLength={LIMITE}
        rows={aberta ? 3 : 1}
        autoFocus={focar}
        className={cn(
          compacto && (aberta ? 'min-h-24' : 'min-h-9 resize-none py-1.5'),
        )}
        onBlur={() => setFocada(false)}
        onFocus={(e) => {
          setFocada(true)
          if (focar) {
            const fim = e.currentTarget.value.length
            e.currentTarget.setSelectionRange(fim, fim)
          }
        }}
        onChange={(e) => setTexto(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && aoCancelar) aoCancelar()
        }}
      />
      {(!compacto || texto.trim().length > 0 || pertoDoLimite) && (
        <div className="flex items-center gap-2">
          <Button
            type="submit"
            size="sm"
            aria-disabled={enviando || !texto.trim()}
            className="aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
          >
            {botao}
          </Button>
          {aoCancelar && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={aoCancelar}
            >
              Cancelar
            </Button>
          )}
          {pertoDoLimite && (
            <span className="ml-auto text-xs text-muted-foreground tabular-nums">
              {texto.length}/{LIMITE}
            </span>
          )}
        </div>
      )}
    </form>
  )
}

function Comentario({
  comentario: c,
  ehEquipe,
  podeResponder,
  aoMudar,
  aoExcluir,
  aoEnviarResposta,
}: {
  comentario: ComentarioDaLista
  ehEquipe: boolean
  aulaId: string
  podeResponder: boolean
  aoMudar: () => Promise<unknown>
  aoExcluir?: () => void
  aoEnviarResposta?: (texto: string, chaveDeEnvio: string) => Promise<void>
}) {
  const [modo, setModo] = useState<'ler' | 'editar' | 'responder'>('ler')
  const confirmar = useConfirmar()
  const fuso = useFusoDoAluno()
  const podeMexer = c.seu || ehEquipe
  const botaoEditar = useRef<HTMLButtonElement>(null)
  const botaoResponder = useRef<HTMLButtonElement>(null)
  // Quem abriu o formulário recebe o foco de volta quando ele fecha (o textarea some ao salvar,
  // cancelar ou apertar Esc, e o foco iria para o body).
  const devolverFoco = useRef<'editar' | 'responder' | null>(null)

  useEffect(() => {
    if (modo !== 'ler' || !devolverFoco.current) return
    const botao =
      devolverFoco.current === 'editar' ? botaoEditar : botaoResponder
    devolverFoco.current = null
    botao.current?.focus()
  }, [modo])

  function fechar(de: 'editar' | 'responder') {
    devolverFoco.current = de
    setModo('ler')
  }

  async function executar(acao: () => Promise<unknown>, padrao: string) {
    try {
      await acao()
      await aoMudar()
      return true
    } catch (erro) {
      toast.error(erroDe(erro, padrao))
      return false
    }
  }

  const autor: PessoaNaTela = {
    nome: c.autorNome,
    imagem: c.autorImagem,
    bio: c.autorBio,
    daEquipe: c.autorEquipe,
  }

  return (
    <article
      className="flex flex-col gap-2 text-sm"
      aria-label={`Comentário de ${c.autorNome}`}
    >
      <header className="flex flex-wrap items-center gap-2">
        <CartaoDePessoa pessoa={autor}>
          <AvatarDaPessoa pessoa={autor} />
          <NomeDaPessoa pessoa={autor} />
        </CartaoDePessoa>
        {c.fixado && (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Pin className="size-3" aria-hidden="true" />
            Fixado
          </span>
        )}
        <time className="text-xs text-muted-foreground">
          {formatarDataHoraNoFuso(c.criadoEm, fuso)}
          {c.editado && ' · editado'}
        </time>
      </header>

      {modo === 'editar' ? (
        <Formulario
          rotulo="Editar comentário"
          botao="Salvar"
          inicial={c.texto}
          focar
          aoCancelar={() => fechar('editar')}
          aoEnviar={async (texto) => {
            await editarComentarioFn({
              data: { comentarioId: c.id, texto },
            })
            fechar('editar')
            await aoMudar()
          }}
        />
      ) : (
        <p className="whitespace-pre-wrap break-words">{c.texto}</p>
      )}

      {modo !== 'editar' && (
        <div className="flex flex-wrap gap-1 text-xs">
          {podeResponder && aoEnviarResposta && (
            <Button
              ref={botaoResponder}
              type="button"
              size="sm"
              variant="ghost"
              aria-expanded={modo === 'responder'}
              onClick={() =>
                setModo(modo === 'responder' ? 'ler' : 'responder')
              }
            >
              Responder
            </Button>
          )}
          {podeMexer && (
            <Button
              ref={botaoEditar}
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setModo('editar')}
            >
              Editar
            </Button>
          )}
          {podeMexer && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={async () => {
                const sim = await confirmar({
                  titulo:
                    c.respostas.length > 0
                      ? 'Excluir este comentário e as respostas dele?'
                      : 'Excluir este comentário?',
                  descricao: 'Não dá para desfazer.',
                  acao: 'Excluir',
                  perigo: true,
                })
                if (sim) {
                  const ok = await executar(
                    () => excluirComentarioFn({ data: { comentarioId: c.id } }),
                    'Não foi possível excluir.',
                  )
                  if (ok) aoExcluir?.()
                }
              }}
            >
              Excluir
            </Button>
          )}
          {ehEquipe && c.paiId === null && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() =>
                executar(
                  () =>
                    fixarComentarioFn({
                      data: { comentarioId: c.id, fixado: !c.fixado },
                    }),
                  'Não foi possível fixar.',
                )
              }
            >
              {c.fixado ? <PinOff /> : <Pin />}
              {c.fixado ? 'Desafixar' : 'Fixar'}
            </Button>
          )}
        </div>
      )}

      {modo === 'responder' && aoEnviarResposta && (
        <Formulario
          rotulo={`Responder ${c.autorNome}`}
          botao="Responder"
          focar
          aoCancelar={() => fechar('responder')}
          aoEnviar={async (texto, chave) => {
            await aoEnviarResposta(texto, chave)
            fechar('responder')
          }}
        />
      )}
    </article>
  )
}
