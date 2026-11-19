import { useNavigate, useRouterState } from '@tanstack/react-router'
import {
  BookOpen,
  Folder,
  Lock,
  PlayCircle,
  Quote,
  Search,
  Star,
  X,
} from 'lucide-react'
import { Dialog as DialogPrimitive } from 'radix-ui'
import {
  type KeyboardEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'
import { Button } from '#/components/ui/button'
import { Kbd } from '#/components/ui/kbd'
import { TelaVazia } from '#/components/vazio/tela-vazia'
import { buscaRapidaFn, ultimasAulasAbertasFn } from '#/lib/busca-rapida-fns'
import { cn } from '#/lib/utils'
import {
  type GrupoDaBuscaRapida,
  type ItemDaBuscaRapida,
  MINIMO_DA_BUSCA_RAPIDA,
  minutoDoVideo,
  ORDEM_DOS_GRUPOS,
  type RespostaDaBuscaRapida,
  type UltimaAulaAberta,
} from '#/regras/busca-rapida-tipos'

const ESPERA_DA_DIGITACAO = 150

const ROTULOS: Record<GrupoDaBuscaRapida | 'ultimas', string> = {
  cursos: 'Cursos',
  modulos: 'Módulos',
  aulas: 'Aulas',
  falados: 'Falado no vídeo',
  ultimas: 'Últimas aulas abertas',
}
const ICONES = {
  cursos: BookOpen,
  modulos: Folder,
  aulas: PlayCircle,
  falados: Quote,
  ultimas: PlayCircle,
}

interface Linha {
  id: string
  grupo: GrupoDaBuscaRapida | 'ultimas'
  titulo: string
  detalhe: string
  favorita: boolean
  tempo: number | null
  bloqueio: string | null
  cursoId: string
  aulaId: string | null
}

function linhaDoItem(i: ItemDaBuscaRapida, n: number): Linha {
  return {
    id: `busca-${i.grupo}-${n}`,
    grupo: i.grupo,
    titulo: i.titulo,
    detalhe: [i.grupo === 'cursos' ? null : i.moduloNome, i.cursoNome]
      .filter(Boolean)
      .join(' · '),
    favorita: i.favorita,
    tempo: i.tempo,
    bloqueio: i.bloqueio,
    cursoId: i.cursoId,
    aulaId: i.aulaId,
  }
}

function linhaDaUltima(u: UltimaAulaAberta, n: number): Linha {
  return {
    id: `busca-ultimas-${n}`,
    grupo: 'ultimas',
    titulo: u.titulo,
    detalhe: `${u.moduloNome} · ${u.cursoNome}`,
    favorita: false,
    tempo: null,
    bloqueio: u.bloqueio,
    cursoId: u.cursoId,
    aulaId: u.aulaId,
  }
}

function linhasDaJanela(
  resposta: RespostaDaBuscaRapida | null,
  ultimas: UltimaAulaAberta[] | null,
  procurando: boolean,
): Linha[] {
  if (!procurando) return (ultimas ?? []).map(linhaDaUltima)
  if (!resposta) return []
  return ORDEM_DOS_GRUPOS.flatMap((g) => resposta.grupos[g].map(linhaDoItem))
}

/** `⌘K` no Mac e no iPhone, `Ctrl K` no resto. */
export function useRotuloDoAtalho(): string {
  const [rotulo, setRotulo] = useState('Ctrl K')
  useEffect(() => {
    if (/Mac|iPhone|iPad/.test(navigator.platform)) setRotulo('⌘K')
  }, [])
  return rotulo
}

function campoDeTexto(alvo: EventTarget | null): boolean {
  if (!(alvo instanceof HTMLElement)) return false
  return (
    alvo.isContentEditable ||
    ['INPUT', 'TEXTAREA', 'SELECT'].includes(alvo.tagName)
  )
}

// Busca rápida (#100): ⌘K / Ctrl+K ou o campo do topo abrem a janela. Resultados a partir de 2 letras,
// agrupados; Enter abre a aula no minuto. Só a última consulta vale: os resultados antigos ficam
// apagados enquanto chegam os novos, sem a lista pular.
export function BuscaRapida({
  aberto,
  aoMudar,
  origem,
  painelSolido = false,
}: {
  aberto: boolean
  aoMudar: (aberto: boolean) => void
  /** O gatilho visível (campo no computador, lupa no celular): de onde a janela nasce e para onde o foco volta. */
  origem: () => HTMLElement | null
  /** Casca Lume: janela de fundo cheio (`--popover`), sem o material translúcido da clássica. */
  painelSolido?: boolean
}) {
  const navegar = useNavigate()
  // "Ver como aluno" (Equipe): a busca segue as regras da turma que a página aberta está vendo.
  const comoDaPagina = useRouterState({
    select: (s) => (s.location.search as { como?: unknown }).como,
  })
  const como =
    typeof comoDaPagina === 'string' && comoDaPagina ? comoDaPagina : undefined
  const [termo, setTermo] = useState('')
  const [resposta, setResposta] = useState<RespostaDaBuscaRapida | null>(null)
  const [ultimas, setUltimas] = useState<UltimaAulaAberta[] | null>(null)
  const [pendente, setPendente] = useState(false)
  const [erro, setErro] = useState(false)
  const [ativoId, setAtivoId] = useState<string | null>(null)
  const sequencia = useRef(0)
  const sequenciaDasUltimas = useRef(0)
  const lista = useRef<HTMLDivElement>(null)
  const campo = useRef<HTMLInputElement>(null)

  const limpo = termo.trim()
  const procurando = limpo.length >= MINIMO_DA_BUSCA_RAPIDA

  // Atalho global: não dispara dentro de campos de texto.
  useEffect(() => {
    function aoTeclar(e: globalThis.KeyboardEvent) {
      if (e.key.toLowerCase() !== 'k' || !(e.metaKey || e.ctrlKey)) return
      if (e.altKey || e.shiftKey || e.defaultPrevented) return
      if (aberto || campoDeTexto(e.target)) return
      e.preventDefault()
      aoMudar(true)
    }
    window.addEventListener('keydown', aoTeclar)
    return () => window.removeEventListener('keydown', aoTeclar)
  }, [aberto, aoMudar])

  // Abriu: começa limpo e traz as últimas aulas abertas.
  useEffect(() => {
    if (!aberto) return
    setTermo('')
    setResposta(null)
    setErro(false)
    setAtivoId(null)
    const minha = ++sequenciaDasUltimas.current
    ultimasAulasAbertasFn({ data: { como } })
      .then((r) => {
        if (minha === sequenciaDasUltimas.current) setUltimas(r)
      })
      .catch(() => {
        if (minha === sequenciaDasUltimas.current) setUltimas([])
      })
  }, [aberto, como])

  // Digitou: espera um instante e busca; só a última consulta vale.
  useEffect(() => {
    if (!aberto) return
    if (!procurando) {
      sequencia.current++
      setPendente(false)
      setErro(false)
      return
    }
    const minha = ++sequencia.current
    setPendente(true)
    const espera = setTimeout(() => {
      buscaRapidaFn({ data: { termo: limpo, como } })
        .then((r) => {
          if (minha !== sequencia.current) return
          setResposta(r)
          setErro(false)
          setPendente(false)
        })
        .catch(() => {
          if (minha !== sequencia.current) return
          setErro(true)
          setPendente(false)
        })
    }, ESPERA_DA_DIGITACAO)
    return () => clearTimeout(espera)
  }, [aberto, procurando, limpo, como])

  const linhas = linhasDaJanela(resposta, ultimas, procurando)
  const navegaveis = linhas.filter((l) => !l.bloqueio)
  const ativa =
    navegaveis.find((l) => l.id === ativoId) ?? navegaveis[0] ?? null

  // Mantém a linha selecionada à vista (sem animação).
  useEffect(() => {
    if (!ativa) return
    lista.current
      ?.querySelector(`#${ativa.id}`)
      ?.scrollIntoView({ block: 'nearest' })
  }, [ativa])

  const abrir = useCallback(
    (l: Linha) => {
      if (l.bloqueio) return
      aoMudar(false)
      if (l.aulaId) {
        navegar({
          to: '/aulas/$aulaId',
          params: { aulaId: l.aulaId },
          search: {
            ...(l.tempo !== null ? { t: l.tempo } : {}),
            ...(como ? { como } : {}),
          },
        })
      } else {
        navegar({
          to: '/cursos/$cursoId',
          params: { cursoId: l.cursoId },
          search: como ? { como } : {},
        })
      }
    },
    [aoMudar, navegar, como],
  )

  const verTodos = useCallback(() => {
    if (!procurando) return
    aoMudar(false)
    navegar({
      to: '/busca',
      search: { q: limpo, filtro: 'todos', ...(como ? { como } : {}) },
    })
  }, [aoMudar, limpo, navegar, procurando, como])

  function aoTeclarNoCampo(e: KeyboardEvent<HTMLInputElement>) {
    if (e.nativeEvent.isComposing) return
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      if (navegaveis.length === 0) return
      const atual = ativa ? navegaveis.indexOf(ativa) : 0
      const passo = e.key === 'ArrowDown' ? 1 : -1
      const proximo = (atual + passo + navegaveis.length) % navegaveis.length
      setAtivoId(navegaveis[proximo].id)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (ativa) abrir(ativa)
      else verTodos()
    }
  }

  function posicionar(el: HTMLElement | null) {
    const alvo = origem()
    if (!el || !alvo) return
    const o = alvo.getBoundingClientRect()
    const c = el.getBoundingClientRect()
    el.style.setProperty('--origem-x', `${o.left + o.width / 2 - c.left}px`)
    el.style.setProperty('--origem-y', `${o.top + o.height / 2 - c.top}px`)
  }

  const semResultado =
    procurando &&
    resposta !== null &&
    resposta.termo === limpo &&
    linhas.length === 0
  const grupos: { grupo: GrupoDaBuscaRapida | 'ultimas'; linhas: Linha[] }[] =
    []
  for (const l of linhas) {
    const g = grupos.find((x) => x.grupo === l.grupo)
    if (g) g.linhas.push(l)
    else grupos.push({ grupo: l.grupo, linhas: [l] })
  }

  return (
    <DialogPrimitive.Root open={aberto} onOpenChange={aoMudar}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="busca-fundo fixed inset-0 z-50 bg-black/30" />
        <DialogPrimitive.Content
          ref={posicionar}
          aria-describedby={undefined}
          onCloseAutoFocus={(e) => {
            // Esc devolve o foco ao campo (ou à lupa) de onde a janela nasceu.
            e.preventDefault()
            origem()?.focus()
          }}
          className={cn(
            'busca-janela bg-popover fixed inset-0 z-50 flex flex-col overflow-hidden outline-none lume-tela:inset-x-0 lume-tela:top-[12vh] lume-tela:bottom-auto lume-tela:mx-auto lume-tela:max-h-[70vh] lume-tela:w-[min(40rem,calc(100%-2rem))] lume-tela:rounded-xl lume-tela:border lume-tela:shadow-lg',
            !painelSolido && 'lume-tela:material-painel',
          )}
        >
          <DialogPrimitive.Title className="sr-only">
            Busca rápida
          </DialogPrimitive.Title>
          <div className="flex h-16 shrink-0 items-center gap-3 border-b px-4 focus-within:ring-2 focus-within:ring-ring focus-within:ring-inset lume-tela:h-14">
            <Search
              aria-hidden="true"
              className="size-4 shrink-0 text-muted-foreground"
            />
            <input
              ref={campo}
              type="text"
              name="busca"
              role="combobox"
              aria-label="Buscar nos seus cursos"
              aria-expanded={linhas.length > 0}
              aria-controls="busca-lista"
              aria-activedescendant={ativa?.id}
              aria-autocomplete="list"
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              enterKeyHint="search"
              placeholder="Pesquisar aulas, cursos…"
              value={termo}
              onChange={(e) => setTermo(e.target.value)}
              onKeyDown={aoTeclarNoCampo}
              className="h-10 min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground lume-tela:text-sm"
            />
            <DialogPrimitive.Close
              aria-label="Fechar a busca"
              className="pressiona-botao grid size-11 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-accent lume-tela:hidden"
            >
              <X className="size-5" />
            </DialogPrimitive.Close>
            <Kbd className="text-foreground/70 sem-ponteiro-fino:hidden">
              Esc
            </Kbd>
          </div>

          <div
            ref={lista}
            id="busca-lista"
            {...(linhas.length > 0
              ? { role: 'listbox', 'aria-label': 'Resultados' }
              : {})}
            data-pendente={pendente}
            aria-busy={pendente}
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2 transition-opacity duration-base ease-saida data-[pendente=true]:opacity-50 lume-tela:min-h-40"
          >
            {grupos.map((g) => {
              const Icone = ICONES[g.grupo]
              return (
                // biome-ignore lint/a11y/useSemanticElements: grupo dentro de um listbox, não de formulário.
                <div
                  key={g.grupo}
                  role="group"
                  aria-label={ROTULOS[g.grupo]}
                  className="pb-2"
                >
                  <div className="px-2 py-1.5 text-xs font-medium text-foreground/70">
                    {ROTULOS[g.grupo]}
                  </div>
                  {g.linhas.map((l) => (
                    // biome-ignore lint/a11y/useKeyWithClickEvents: o teclado vai pelo campo (combobox).
                    <div
                      key={l.id}
                      id={l.id}
                      role="option"
                      tabIndex={-1}
                      aria-selected={ativa?.id === l.id}
                      aria-disabled={l.bloqueio ? true : undefined}
                      onMouseMove={() => !l.bloqueio && setAtivoId(l.id)}
                      onClick={() => abrir(l)}
                      className="group pressiona-linha flex h-14 cursor-pointer items-center gap-3 rounded-lg px-2 aria-disabled:cursor-default aria-disabled:opacity-60 aria-selected:bg-accent"
                    >
                      <span className="grid size-9 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground">
                        <Icone className="size-4" aria-hidden="true" />
                      </span>
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate text-sm font-medium">
                          {l.titulo}
                        </span>
                        <span className="truncate text-xs text-foreground/70">
                          {l.detalhe}
                        </span>
                      </span>
                      {l.favorita && (
                        <Star
                          role="img"
                          aria-label="salva"
                          className="size-3.5 shrink-0 fill-current text-primary"
                        />
                      )}
                      {l.tempo !== null && (
                        <span className="shrink-0 text-xs text-foreground/70 tabular-nums">
                          aos {minutoDoVideo(l.tempo)}
                        </span>
                      )}
                      {l.bloqueio && (
                        <span className="flex shrink-0 items-center gap-1 text-xs text-foreground/70">
                          <Lock className="size-3.5" aria-hidden="true" />
                          {l.bloqueio}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )
            })}
            {semResultado && (
              <TelaVazia
                ilustracao="cartela"
                titulo={`Nada encontrado para “${limpo}”`}
                texto="A busca olha os cursos em que você tem matrícula."
                compacta
                className="[&_h2]:[overflow-wrap:anywhere] [&_[data-slot=empty-description]]:text-foreground/70"
                acao={
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setTermo('')
                      campo.current?.focus()
                    }}
                  >
                    Limpar a busca
                  </Button>
                }
              />
            )}
            {erro && <Aviso>Não deu para buscar agora. Tente de novo.</Aviso>}
            {!procurando && ultimas?.length === 0 && (
              <Aviso>
                Digite ao menos 2 letras para buscar nos títulos, textos e
                vídeos dos seus cursos.
              </Aviso>
            )}
          </div>

          <div
            role="status"
            aria-live="polite"
            data-testid="busca-status"
            className="sr-only"
          >
            {erro
              ? 'Erro na busca.'
              : pendente
                ? 'Buscando…'
                : semResultado
                  ? `Nenhum resultado para ${limpo}`
                  : procurando && resposta?.termo === limpo
                    ? `${linhas.length} ${linhas.length === 1 ? 'resultado' : 'resultados'}`
                    : ''}
          </div>

          <div className="flex h-12 shrink-0 items-center justify-between gap-3 border-t px-4 text-xs text-foreground/70 lume-cel:pb-[env(safe-area-inset-bottom)]">
            <span className="flex items-center gap-2 sem-ponteiro-fino:hidden">
              <Kbd className="text-foreground/70">↑</Kbd>
              <Kbd className="text-foreground/70">↓</Kbd> navegar{' '}
              <Kbd className="text-foreground/70">↵</Kbd> abrir
            </span>
            <button
              type="button"
              disabled={!procurando}
              onClick={verTodos}
              className="pressiona-botao ml-auto rounded-md px-2 py-1.5 text-sm font-medium toque:min-h-11 text-foreground hover:bg-accent disabled:pointer-events-none disabled:opacity-40"
            >
              Ver todos os resultados
            </button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

function Aviso({ children }: { children: ReactNode }) {
  return (
    <p className="px-3 py-8 text-center text-sm text-foreground/70">
      {children}
    </p>
  )
}
