import { Link, useNavigate } from '@tanstack/react-router'
import {
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  FileText,
  Lock,
  Play,
  ThumbsUp,
  X,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { BarraLume } from '#/components/casca-lume/barra'
import { AvaliacaoDaAula } from '#/components/conteudo/avaliacao-da-aula'
import { BotaoFavorito } from '#/components/conteudo/botao-favorito'
import { Cadeado } from '#/components/conteudo/cadeado'
import { CartaoDoFimDoVideo } from '#/components/conteudo/cartao-do-fim-do-video'
import { ComentariosDaAula } from '#/components/conteudo/comentarios-da-aula'
import { ConclusaoDoMarco } from '#/components/conteudo/conclusao'
import { Materiais } from '#/components/conteudo/materiais-da-aula'
import { PlayerDaAula } from '#/components/conteudo/player-da-aula'
import { QuizDaAula } from '#/components/conteudo/quiz-da-aula'
import { TextoDaAula } from '#/components/conteudo/texto-da-aula'
import { type DadosDaAula, useAula } from '#/components/conteudo/use-aula'
import { Button } from '#/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '#/components/ui/tabs'
import { urlDaImagem } from '#/lib/imagens'
import { querMenosMovimento } from '#/lib/menos-movimento'
import { cn } from '#/lib/utils'
import { textoDosColegas } from '#/regras/colegas'
import { materiaisForaDoTexto } from '#/regras/materiais-no-texto'
import { rotuloDoProgresso } from '#/regras/meus-cursos'
import { personalizarTexto } from '#/regras/nome-na-aula'

type Modulos = DadosDaAula['modulos']

/** Playlist do curso: um bloco por módulo (o da aula atual aberto), com a atual destacada. */
function Playlist({
  modulos,
  moduloAtualId,
  aulaAtualId,
  concluidas,
  situacoes,
  comoBusca,
}: {
  modulos: Modulos
  moduloAtualId: string
  aulaAtualId: string
  concluidas: string[]
  situacoes: DadosDaAula['situacoes']['aulas']
  comoBusca: { como?: string }
}) {
  const [abertos, setAbertos] = useState<string[]>([moduloAtualId])
  // Ao trocar de módulo (próxima aula), o novo abre sem fechar os que o aluno abriu.
  useEffect(() => {
    setAbertos((a) => (a.includes(moduloAtualId) ? a : [...a, moduloAtualId]))
  }, [moduloAtualId])
  const feitas = new Set(concluidas)
  let numero = 0
  return (
    <div>
      {modulos.map((m, mi) => {
        const aberto = abertos.includes(m.id)
        const feitasDoModulo = m.aulas.filter((a) => feitas.has(a.id)).length
        const base = numero
        numero += m.aulas.length
        return (
          <div key={m.id} className={cn(mi > 0 && 'border-t')}>
            <h3>
              <button
                type="button"
                aria-expanded={aberto}
                aria-controls={`modulo-${m.id}`}
                onClick={() =>
                  setAbertos((a) =>
                    aberto ? a.filter((x) => x !== m.id) : [...a, m.id],
                  )
                }
                className="group/modulo flex w-full items-center justify-between gap-3 px-(--aula-painel-recuo) py-3.5 text-left outline-none hover:bg-(--aula-modulo-hover) focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
              >
                <span className="grid min-w-0 gap-0.5">
                  <span className="font-display text-[15px] break-words group-hover/modulo:text-(color:--aula-modulo-titulo-hover)">
                    {mi + 1}. {m.nome}
                  </span>
                  <span className="text-[13px] font-normal text-muted-foreground tabular-nums">
                    {m.aulas.length === 0
                      ? 'Sem aulas ainda'
                      : `${feitasDoModulo}/${m.aulas.length} ${m.aulas.length === 1 ? 'concluída' : 'concluídas'}`}
                  </span>
                </span>
                <ChevronDown
                  className={cn(
                    'size-[18px] shrink-0 text-muted-foreground transition-transform duration-200 motion-reduce:transition-none',
                    aberto && 'rotate-180',
                  )}
                  aria-hidden="true"
                />
              </button>
            </h3>
            {aberto && (
              <ol
                id={`modulo-${m.id}`}
                className="px-(--aula-lista-recuo) pb-2.5"
              >
                {m.aulas.length === 0 && (
                  <li className="p-2.5 text-sm text-muted-foreground">
                    Este módulo ainda não tem aulas.
                  </li>
                )}
                {m.aulas.map((a, i) => {
                  const atual = a.id === aulaAtualId
                  const feita = feitas.has(a.id)
                  const situacao = situacoes[a.id]
                  const travada = situacao?.tipo === 'cadeado'
                  const Icone = a.temVideo ? Play : FileText
                  return (
                    <li key={a.id}>
                      <Link
                        to="/aulas/$aulaId"
                        params={{ aulaId: a.id }}
                        search={comoBusca}
                        aria-current={atual ? 'page' : undefined}
                        className={cn(
                          'grid grid-cols-[24px_minmax(0,1fr)_auto] items-start gap-3 rounded-lg px-(--aula-item-recuo) py-2.5 text-sm text-muted-foreground no-underline outline-none hover:bg-(--aula-item-hover) hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring',
                          atual &&
                            'bg-(--aula-atual-fundo) font-semibold text-(--aula-atual-tinta) hover:bg-(--aula-atual-fundo) hover:text-(--aula-atual-tinta)',
                          travada && 'opacity-60',
                        )}
                      >
                        <span
                          aria-hidden="true"
                          className={cn(
                            'grid size-6 place-items-center rounded-full bg-foreground/10 text-xs font-semibold text-muted-foreground tabular-nums',
                            atual && 'bg-brand text-brand-foreground',
                            feita && 'bg-success text-background',
                          )}
                        >
                          {feita ? (
                            <Check className="size-3" strokeWidth={3.5} />
                          ) : travada ? (
                            <Lock className="size-3" />
                          ) : atual ? (
                            <Icone
                              className="size-2.5"
                              fill={a.temVideo ? 'currentColor' : 'none'}
                              strokeWidth={a.temVideo ? 2 : 3}
                            />
                          ) : (
                            base + i + 1
                          )}
                        </span>
                        <span className="min-w-0 pt-px [overflow-wrap:anywhere]">
                          {a.titulo}
                          {feita && (
                            <span className="sr-only"> (concluída)</span>
                          )}
                          {atual && (
                            <span className="sr-only"> (aula atual)</span>
                          )}
                          <Cadeado situacao={situacao} className="mt-1" />
                        </span>
                        <Icone
                          className="mt-0.5 size-3 text-muted-foreground"
                          aria-hidden="true"
                        />
                      </Link>
                    </li>
                  )
                })}
              </ol>
            )}
          </div>
        )
      })}
    </div>
  )
}

// Abas na régua: sem recuo, o texto da primeira começa na mesma borda do título. O traço da aba ativa
// é da marca (item ativo); no celular as quatro cabem sem rolar.
const ABA =
  'h-10 flex-none rounded-none border-0 px-0 text-[15px] font-semibold after:bg-brand focus-visible:ring-inset data-[state=active]:text-foreground toque:h-11 lume-cel:text-sm'

// Texto da aula (no cartão da aula sem vídeo e na aba Sobre): títulos em `font-display` e sem o
// respiro de cima no primeiro elemento, que somava com o do cartão.
const TEXTO_NA_LUME =
  '[&_h2]:font-display [&_h2]:tracking-[-0.01em] [&_h3]:font-display [&>div>:first-child]:mt-0'

type QuizDaPagina = NonNullable<DadosDaAula['quiz']>

/** A partir daqui o texto da aula empurra as abas para fora da tela: a chamada do quiz se repete no fim. */
const TEXTO_LONGO = 600

/** Em que pé está o quiz para a aluna, e o que a chamada diz e oferece em cada caso. */
function situacaoDoQuiz(quiz: QuizDaPagina, travaAConclusao: boolean) {
  const n = quiz.perguntas.length
  const perguntas = n === 1 ? '1 pergunta' : `${n} perguntas`
  // Quiz em conversa é uma pesquisa: sem nota nem acerto, e a chamada fala assim.
  if (quiz.formato === 'conversa') {
    if (quiz.aprovado || quiz.aguardandoCorrecao) {
      return {
        texto: 'Pesquisa enviada.',
        acao: 'Ver a pesquisa',
        pendente: false,
      }
    }
    return {
      texto: travaAConclusao
        ? 'Para concluir esta aula, responda a pesquisa.'
        : `Esta aula tem uma pesquisa com ${perguntas}.`,
      acao: 'Responder a pesquisa',
      pendente: true,
    }
  }
  if (quiz.aprovado) {
    return {
      texto: 'Exercício aprovado.',
      acao: 'Ver o exercício',
      pendente: false,
    }
  }
  if (quiz.aguardandoCorrecao) {
    return {
      texto: 'Exercício enviado. A equipe está corrigindo.',
      acao: 'Ver o que enviei',
      pendente: false,
    }
  }
  if (!quiz.podeEnviar) {
    return {
      texto: 'As tentativas do exercício acabaram.',
      acao: 'Ver o exercício',
      pendente: false,
    }
  }
  if (quiz.tentativas.length > 0) {
    return {
      texto: 'O exercício ainda não foi aprovado.',
      acao: 'Tentar de novo',
      pendente: true,
    }
  }
  return {
    texto: travaAConclusao
      ? 'Para concluir esta aula, seja aprovado no exercício.'
      : `Esta aula tem um exercício com ${perguntas}.`,
    acao: 'Responder o exercício',
    pendente: true,
  }
}

/**
 * Chamada do quiz, logo abaixo das ações da aula: a aba "Quiz" sozinha passava despercebida. Diz em
 * que pé o quiz está e leva até ele. Sem caixa (página de revista): um fio em cima e o texto no papel.
 * O botão é vinho só quando o quiz trava a conclusão da aula (aí ele é a ação principal da tela).
 */
function ChamadaDoQuiz({
  quiz,
  travaAConclusao,
  naAbaDoQuiz,
  aoAbrir,
}: {
  quiz: QuizDaPagina
  travaAConclusao: boolean
  naAbaDoQuiz: boolean
  aoAbrir: () => void
}) {
  const { texto, acao, pendente } = situacaoDoQuiz(quiz, travaAConclusao)
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2.5 border-t border-border pt-4">
      <p
        id={travaAConclusao ? 'aviso-quiz-concluir' : undefined}
        className={cn(
          'flex min-w-0 items-start gap-2 text-[15px] leading-snug font-semibold text-foreground',
          quiz.aprovado && 'text-success-texto',
        )}
      >
        {quiz.aprovado ? (
          <Check
            className="mt-0.5 size-4 shrink-0"
            strokeWidth={3}
            aria-hidden="true"
          />
        ) : (
          <ClipboardList
            className="mt-px size-[18px] shrink-0"
            aria-hidden="true"
          />
        )}
        {texto}
      </p>
      {!naAbaDoQuiz && (
        <button
          type="button"
          onClick={aoAbrir}
          className={cn(
            'inline-flex h-10 items-center justify-center gap-1.5 rounded-full px-4 text-sm font-semibold whitespace-nowrap outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background toque:h-11',
            pendente && travaAConclusao
              ? 'bg-brand text-brand-foreground hover:bg-brand-hover'
              : 'border bg-card text-foreground hover:bg-foreground/[.06]',
          )}
        >
          {acao}
          <ChevronRight className="size-4" aria-hidden="true" />
        </button>
      )}
    </div>
  )
}

// Aula (casca Lume): o vídeo em foco numa coluna larga, título, "Aula X de Y", Concluir e Próxima aula,
// abas (Sobre, Materiais, Quiz, Comentários) e a playlist do curso ao lado (no celular, abaixo). A lógica
// é a mesma da casca clássica (`useAula`); aqui só muda a aparência. Sem anotações com tempo: não há backend.
export function AulaLume({
  dados,
  como,
  tempoInicial,
  nomeDoAluno,
  proximaAulaSozinha,
  abaDaUrl,
}: {
  dados: DadosDaAula
  como: string | undefined
  tempoInicial: number | undefined
  nomeDoAluno: string
  proximaAulaSozinha: boolean | null | undefined
  /** Aba aberta, vinda de `?aba=` na URL (voltar e recarregar caem na mesma aba). */
  abaDaUrl?: string
}) {
  const navegar = useNavigate({ from: '/aulas/$aulaId' })
  const {
    aula,
    curso,
    modulo,
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
  // O anexo que o texto já cita por link não se repete na lista.
  const materiais = materiaisForaDoTexto(dados.materiais, aula.textoHtml)
  const a = useAula({ dados, como, proximaAulaSozinha })
  const {
    comoBusca,
    fuso,
    concluida,
    faltaAprovar,
    salvando,
    despachar,
    textoVisivel,
  } = a

  const aulas = modulos.flatMap((m) => m.aulas)
  const total = aulas.length
  const pct = total ? Math.round((concluidas.length / total) * 100) : 0
  const rotulo = rotuloDoProgresso({
    feitas: concluidas.length,
    total,
    percentual: pct,
  })
  const ehVideo = !!aula.vimeoId
  const abas = [
    ...(ehVideo && textoVisivel
      ? [{ id: 'sobre', rotulo: 'Sobre a aula' }]
      : []),
    ...(materiais.length > 0
      ? [{ id: 'materiais', rotulo: `Materiais (${materiais.length})` }]
      : []),
    ...(quiz
      ? [
          {
            id: 'quiz',
            rotulo: quiz.formato === 'conversa' ? 'Pesquisa' : 'Exercício',
          },
        ]
      : []),
    { id: 'comentarios', rotulo: 'Comentários' },
  ]
  const travaAConclusao = faltaAprovar && !concluida
  const quizPendente = !!quiz && situacaoDoQuiz(quiz, travaAConclusao).pendente
  const abaInicial = quiz?.soQuiz ? 'quiz' : (abas[0]?.id ?? 'comentarios')
  // A aba ativa vive na URL; os links para outra aula não a levam, então cada aula abre na inicial.
  const abaValida = abas.some((x) => x.id === abaDaUrl)
    ? (abaDaUrl as string)
    : abaInicial
  const setAba = (id: string) =>
    void navegar({
      search: (atual) => ({ ...atual, aba: id }),
      replace: true,
      resetScroll: false,
    })
  // Abre a aba do quiz e leva a tela até ela; o foco vai para a aba, para o teclado seguir dali.
  const abrirOQuiz = () => {
    setAba('quiz')
    requestAnimationFrame(() => {
      const aba = document.getElementById('aba-quiz')
      aba?.scrollIntoView({
        block: 'start',
        behavior: querMenosMovimento() ? 'auto' : 'smooth',
      })
      aba?.focus({ preventScroll: true })
    })
  }

  if (situacao.tipo === 'cadeado') {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
        <div className="grid size-14 place-items-center rounded-full bg-foreground/10">
          <Lock className="size-6 text-muted-foreground" aria-hidden="true" />
        </div>
        <p className="text-sm text-muted-foreground">
          {curso.nome} · {modulo.nome}
        </p>
        <h1 className="font-display text-2xl break-words">{aula.titulo}</h1>
        <p className="text-muted-foreground" role="status">
          {a.textoDoCadeado(situacao, fuso)}
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

  const botaoConcluir = (
    <button
      type="button"
      aria-disabled={salvando || (faltaAprovar && !concluida)}
      aria-describedby={
        faltaAprovar && !concluida ? 'aviso-quiz-concluir' : undefined
      }
      aria-pressed={concluida}
      aria-busy={salvando}
      title={concluida ? 'Clique para desmarcar' : undefined}
      onClick={a.alternarConclusao}
      className={cn(
        'inline-flex h-11 items-center justify-center gap-2 rounded-full px-5 text-[15px] font-semibold whitespace-nowrap outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background aria-disabled:cursor-not-allowed aria-disabled:opacity-50 lume-cel:flex-auto lume-cel:px-4',
        concluida
          ? 'border-[1.5px] border-success text-success-texto hover:bg-success/10'
          : 'bg-brand text-brand-foreground hover:bg-brand-hover',
      )}
    >
      <Check className="size-4" strokeWidth={3} aria-hidden="true" />
      {salvando ? 'Salvando…' : concluida ? 'Aula concluída' : 'Concluir aula'}
    </button>
  )

  return (
    <main className="relative flex w-full max-w-[2000px] flex-1 flex-col overflow-x-clip px-(--pad) pt-4 pb-20 lume-cel:px-0 lume-cel:pt-0">
      {/* Voltar pequeno, com o nome do módulo (proposta C, escolhida em 17/11/2026): o curso já está na
          lista ao lado, e o "Aula X de Y · Módulo N" confundia o "Módulo 1" do nome com a posição. */}
      <Link
        to="/cursos/$cursoId"
        params={{ cursoId: curso.id }}
        search={comoBusca}
        className="mb-1.5 inline-flex w-max max-w-full min-w-0 items-center gap-1 text-sm text-muted-foreground no-underline hover:text-foreground lume-cel:mx-4 lume-cel:mt-3 lume-cel:max-w-[calc(100%-2rem)]"
      >
        <ChevronLeft className="size-4 shrink-0" aria-hidden="true" />
        <span className="truncate">{modulo.nome}</span>
        <span className="sr-only">, voltar para {curso.nome}</span>
      </Link>

      <div className="grid grid-cols-[minmax(0,1fr)_380px] items-start gap-8 max-lg:grid-cols-1 max-lg:gap-6">
        <div className="flex min-w-0 flex-col gap-6">
          {ehVideo && (
            // Celular deitado (tela baixa): o vídeo inteiro cabe abaixo do topo e do link do curso, sem empurrar
            // o título e o "Concluir" para fora da tela.
            <div
              ref={a.areaDoPlayer}
              className="lume-cel:[&>div]:rounded-none [@media(max-height:520px)]:w-full [@media(max-height:520px)]:max-w-[calc((100svh-var(--lume-topo)-4.5rem)*16/9)] lume-cel:[@media(max-height:520px)]:max-w-[calc((100svh-var(--lume-topo)-7rem-env(safe-area-inset-bottom))*16/9)]"
            >
              <PlayerDaAula
                key={`${aula.id}-${tempoInicial ?? 0}`}
                larguraLivre
                aulaId={aula.id}
                titulo={aula.titulo}
                vimeoId={aula.vimeoId as string}
                vimeoHash={aula.vimeoHash}
                posicaoInicial={progresso?.ultimaPosicao ?? 0}
                tempoInicial={tempoInicial}
                aoConcluir={a.aoConcluirVideo}
                aoTerminar={a.aoTerminarVideo}
              >
                {a.fim && (
                  <CartaoDoFimDoVideo
                    aulaId={aula.id}
                    aulaTitulo={aula.titulo}
                    modo={a.modoDoCartao}
                    proxima={
                      proxima && a.modoDoCartao !== 'sem-proxima'
                        ? {
                            titulo: proxima.titulo,
                            capa:
                              urlDaImagem(a.aulaDaProxima?.miniatura) ??
                              urlDaImagem(curso.capaHorizontal),
                          }
                        : null
                    }
                    motivoDoCadeado={
                      a.situacaoDaProxima?.tipo === 'cadeado'
                        ? a.textoDoCadeado(a.situacaoDaProxima, fuso)
                        : null
                    }
                    aoAssistir={a.irParaAProxima}
                    aoFicar={a.ficarAqui}
                  />
                )}
              </PlayerDaAula>
            </div>
          )}

          {/* Sem vídeo, o cabeçalho tem a largura do texto: o Concluir e o Próxima ficam junto dele, e não
              soltos na ponta da coluna larga do vídeo. */}
          <div
            className={cn(
              'flex min-w-0 flex-col gap-6 lume-cel:px-4',
              !ehVideo && 'max-w-3xl',
            )}
          >
            <div className="min-w-0">
              <h1 className="[font-family:var(--aula-titulo-fonte)] [font-size:var(--aula-titulo-tamanho)] [font-weight:var(--aula-titulo-peso)] [letter-spacing:var(--aula-titulo-espaco)] leading-tight text-balance [overflow-wrap:anywhere]">
                {aula.titulo}
              </h1>
              {colegas !== null && (
                <p
                  className="mt-1.5 text-sm text-muted-foreground"
                  data-testid="colegas-da-semana"
                >
                  {textoDosColegas(colegas)}
                </p>
              )}
            </div>

            {/* Uma linha só de ações, à esquerda: Concluir e Próxima e, depois de um fio, favoritar e avaliar
                só com ícone. A aula anterior fica na lista ao lado e nas setas do teclado. */}
            <div className="-mt-2 flex flex-wrap items-center gap-2.5 text-sm text-muted-foreground">
              {botaoConcluir}
              {proxima && (
                <Link
                  to="/aulas/$aulaId"
                  params={{ aulaId: proxima.id }}
                  search={comoBusca}
                  className="inline-flex h-11 items-center justify-center gap-1.5 rounded-full border bg-card px-5 text-[15px] font-semibold whitespace-nowrap text-foreground no-underline outline-none transition-colors hover:bg-foreground/[.06] focus-visible:ring-2 focus-visible:ring-ring lume-cel:px-4"
                >
                  Próxima aula
                  <ChevronRight className="size-4" aria-hidden="true" />
                </Link>
              )}
              <span
                className="mx-1 h-6 w-px bg-border lume-cel:hidden"
                aria-hidden="true"
              />
              <BotaoFavorito
                key={aula.id}
                compacto
                className="size-11 rounded-full border bg-card text-foreground hover:bg-foreground/[.06] [&_svg]:size-[18px]!"
                aulaId={aula.id}
                titulo={aula.titulo}
                favoritaInicial={favoritas.includes(aula.id)}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Avaliar a aula"
                title="Avaliar a aula"
                className="size-11 rounded-full border bg-card text-foreground hover:bg-foreground/[.06] [&_svg]:size-[18px]!"
                onClick={() => despachar({ tipo: 'abrirAvaliacao' })}
              >
                <ThumbsUp />
              </Button>
              {ehVideo && (
                <label className="ml-auto flex cursor-pointer items-center gap-2 rounded-full px-3 py-2 hover:text-foreground toque:min-h-11 lume-cel:ml-0">
                  <input
                    type="checkbox"
                    checked={a.sozinha}
                    onChange={(e) => void a.mudarSozinha(e.target.checked)}
                    className="size-4 accent-[var(--brand)]"
                  />
                  Tocar a próxima sozinha
                </label>
              )}
            </div>

            {quiz && (
              <ChamadaDoQuiz
                quiz={quiz}
                travaAConclusao={travaAConclusao}
                naAbaDoQuiz={abaValida === 'quiz'}
                aoAbrir={abrirOQuiz}
              />
            )}

            {!ehVideo && textoVisivel && (
              <div
                className={cn(
                  'max-w-3xl rounded-(--aula-texto-raio) border border-(--aula-texto-contorno) border-t-border bg-(--aula-texto-fundo) px-(--aula-texto-recuo) pt-(--aula-texto-recuo-topo) pb-(--aula-texto-recuo) shadow-(--aula-texto-sombra) lume-cel:px-(--aula-texto-recuo-cel) lume-cel:pt-(--aula-texto-recuo-cel-topo) lume-cel:pb-(--aula-texto-recuo-cel)',
                  TEXTO_NA_LUME,
                )}
              >
                <TextoDaAula
                  html={personalizarTexto(aula.textoHtml, nomeDoAluno)}
                  cursoId={curso.id}
                />
              </div>
            )}

            {a.semConteudo && (
              <p className="text-sm text-muted-foreground">
                Esta aula não tem vídeo nem texto. Deixe sua nota e seu
                comentário logo abaixo.
              </p>
            )}

            <Tabs value={abaValida} onValueChange={setAba} className="gap-0">
              <TabsList
                variant="line"
                aria-label="Detalhes da aula"
                className={cn(
                  'h-auto w-full justify-start gap-6 overflow-x-auto toque:group-data-[orientation=horizontal]/tabs:h-[53px] rounded-none border-b px-0.5 pt-1 pb-[5px] [scrollbar-width:none] lume-cel:gap-5 [&::-webkit-scrollbar]:hidden',
                  abas.length < 2 && 'sr-only',
                )}
              >
                {abas.map((x) => (
                  <TabsTrigger
                    key={x.id}
                    id={`aba-${x.id}`}
                    value={x.id}
                    className={cn(
                      ABA,
                      'scroll-mt-[calc(var(--lume-topo)+1rem)]',
                    )}
                  >
                    {x.rotulo}
                    {x.id === 'quiz' && quizPendente && (
                      <>
                        <span
                          aria-hidden="true"
                          className="ponto-pulsa ml-1.5 size-2 rounded-full bg-brand"
                        />
                        <span className="sr-only">(para responder)</span>
                      </>
                    )}
                  </TabsTrigger>
                ))}
              </TabsList>
              {ehVideo && textoVisivel && (
                <TabsContent
                  value="sobre"
                  className={cn('max-w-3xl pt-6', TEXTO_NA_LUME)}
                >
                  <TextoDaAula
                    html={personalizarTexto(aula.textoHtml, nomeDoAluno)}
                    cursoId={curso.id}
                  />
                  {quiz &&
                    quizPendente &&
                    aula.textoHtml.length > TEXTO_LONGO && (
                      <div className="mt-8">
                        <ChamadaDoQuiz
                          quiz={quiz}
                          travaAConclusao={false}
                          naAbaDoQuiz={false}
                          aoAbrir={abrirOQuiz}
                        />
                      </div>
                    )}
                </TabsContent>
              )}
              {materiais.length > 0 && (
                <TabsContent value="materiais" className="max-w-3xl pt-6">
                  <Materiais materiais={materiais} />
                </TabsContent>
              )}
              {quiz && (
                <TabsContent value="quiz" className="max-w-4xl pt-6">
                  <QuizDaAula
                    key={`quiz-${aula.id}`}
                    aulaId={aula.id}
                    quiz={quiz}
                    nomeDoAluno={nomeDoAluno}
                  />
                </TabsContent>
              )}
              <TabsContent value="comentarios" className="max-w-3xl pt-6">
                <ComentariosDaAula
                  key={`comentarios-${aula.id}`}
                  aulaId={aula.id}
                  embutido={abas.length > 1}
                />
              </TabsContent>
            </Tabs>
          </div>
        </div>

        <aside
          aria-label="Aulas do curso"
          className="sticky top-[calc(var(--lume-topo)+1rem)] flex max-h-[calc(100svh-var(--lume-topo)-2rem)] flex-col overflow-hidden rounded-(--aula-painel-raio) border border-(--aula-painel-contorno) border-t-(--aula-painel-fio) bg-(--aula-painel-fundo) max-lg:static max-lg:max-h-none lume-cel:mx-4"
        >
          <div className="grid gap-2.5 border-b px-(--aula-painel-recuo) py-4">
            <h2 className="font-display text-base">Seu progresso</h2>
            <BarraLume
              pct={pct}
              feitas={concluidas.length}
              label="Progresso do curso"
            />
            <p className="text-sm text-muted-foreground tabular-nums">
              {concluidas.length} de {total} {total === 1 ? 'aula' : 'aulas'} ·{' '}
              {rotulo.texto}
            </p>
          </div>
          <div className="min-h-0 overflow-y-auto overscroll-contain">
            <Playlist
              modulos={modulos}
              moduloAtualId={modulo.id}
              aulaAtualId={aula.id}
              concluidas={concluidas}
              situacoes={situacoes.aulas}
              comoBusca={comoBusca}
            />
          </div>
        </aside>
      </div>

      <Dialog
        open={a.avaliando}
        onOpenChange={(aberto) => {
          if (!aberto) despachar({ tipo: 'fechar' })
        }}
      >
        <DialogContent
          className="max-w-[calc(100%-2rem)]"
          showCloseButton={false}
        >
          {/* Fechar com área de 44 px e o X no mesmo lugar de antes (16 px a 16 px do canto). */}
          <DialogClose className="absolute top-0.5 right-0.5 grid size-11 place-items-center rounded-full opacity-70 outline-none transition-opacity hover:opacity-100 focus-visible:ring-2 focus-visible:ring-ring">
            <X className="size-4" aria-hidden="true" />
            <span className="sr-only">Fechar</span>
          </DialogClose>
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
        marco={a.celebracao?.marco ?? null}
        aoFechar={() => despachar({ tipo: 'fechar' })}
        cursoId={curso.id}
        cursoNome={curso.nome}
        modulos={a.celebracao?.anel ?? []}
        cores={a.cores}
        percentual={a.celebracao?.percentual ?? 0}
        proximaAulaId={proxima?.id ?? null}
        busca={comoBusca}
        cascaLume
      />
    </main>
  )
}
