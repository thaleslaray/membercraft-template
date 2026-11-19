import { Link, useRouterState } from '@tanstack/react-router'
import { Search } from 'lucide-react'
import { type ReactNode, useEffect, useRef, useState } from 'react'
import { useBoasVindasDaCasca } from '#/components/casca/boas-vindas-da-casca'
import { BuscaRapida, useRotuloDoAtalho } from '#/components/casca/busca-rapida'
import {
  ICONES_DOS_DESTINOS,
  naPaginaDoDestino,
} from '#/components/casca/icones-dos-destinos'
import { Marca } from '#/components/casca/marca'
import { MenuDoAvatar } from '#/components/casca/menu-do-avatar'
import { Sininho } from '#/components/casca/sininho'
import { Button } from '#/components/ui/button'
import { Kbd } from '#/components/ui/kbd'
import { TooltipProvider } from '#/components/ui/tooltip'
import { useAparencia } from '#/lib/aparencia-queries'
import { destinoAtivo, destinosDoAluno } from '#/lib/destinos-da-casca'

// Casca do aluno (#93): barra de topo translúcida com a marca, os dois destinos, a busca, o sininho e o
// avatar; no celular os destinos vão para abas no pé da tela. O conteúdo rola por baixo das duas barras.
export function CascaAluno({
  children,
  linkDoEstudio = false,
}: {
  children: ReactNode
  /** Equipe e Proprietário ganham o atalho para o painel do Estúdio, no menu do avatar. */
  linkDoEstudio?: boolean
}) {
  const caminho = useRouterState({ select: (s) => s.location.pathname })
  const { mostrarComunidade } = useAparencia()
  const destinos = destinosDoAluno({ mostrarComunidade })
  const ativo = destinoAtivo(caminho, { mostrarComunidade })
  // Busca rápida (#100): o campo do topo (computador), a lupa (celular) e ⌘K abrem a mesma janela.
  const [buscaAberta, setBuscaAberta] = useState(false)
  const campoDaBusca = useRef<HTMLButtonElement>(null)
  const lupaDaBusca = useRef<HTMLButtonElement>(null)
  const atalho = useRotuloDoAtalho()
  // Esmaecimento da borda de baixo da barra: só aparece quando há conteúdo passando por baixo dela.
  const [rolou, setRolou] = useState(false)
  useEffect(() => {
    const ler = () => setRolou(window.scrollY > 2)
    ler()
    window.addEventListener('scroll', ler, { passive: true })
    return () => window.removeEventListener('scroll', ler)
  }, [])

  const { logoUrl } = useAparencia()

  const { reverBoasVindas, janela } = useBoasVindasDaCasca()

  return (
    // As páginas de dentro usam dicas (Tooltip); o provedor que vinha com o menu lateral agora mora aqui.
    <TooltipProvider delayDuration={0}>
      <div className="flex min-h-svh flex-col bg-surface">
        {/* Primeiro item do teclado: pula a barra e vai direto ao conteúdo da página. */}
        <a
          href="#conteudo"
          className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-md focus:border focus:bg-background focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:shadow-md"
        >
          Pular para o conteúdo
        </a>
        <header
          data-sobre={rolou}
          className="barra-do-topo material-barra sticky top-[var(--faixa-entrar-como,0px)] z-30 flex h-16 shrink-0 items-center gap-3 px-4 md:px-6"
        >
          <div className="flex min-w-0 flex-1 items-center gap-3 md:gap-8">
            <Link
              to="/"
              className="flex shrink-0 items-center text-foreground no-underline"
            >
              <Marca logoUrl={logoUrl} />
            </Link>

            <nav
              aria-label="Destinos"
              className="relative hidden w-72 shrink-0 grid-cols-2 md:grid"
            >
              {/* O indicador desliza entre os dois destinos (só `transform`). */}
              <span
                aria-hidden="true"
                data-testid="indicador-do-destino"
                data-destino={ativo ?? 'nenhum'}
                className="absolute inset-y-0 left-0 w-1/2 rounded-full bg-accent transition-[transform,opacity] duration-base ease-saida data-[destino=atendimento]:translate-x-full data-[destino=comunidade]:translate-x-full data-[destino=nenhum]:opacity-0"
              />
              {destinos.map((d) => (
                <Link
                  key={d.id}
                  to={d.para}
                  aria-current={ativo === d.id ? 'page' : undefined}
                  className="relative z-10 flex h-9 items-center justify-center rounded-full text-sm font-medium text-muted-foreground no-underline transition-colors duration-base hover:text-foreground aria-[current=page]:text-foreground"
                >
                  {d.rotulo}
                </Link>
              ))}
            </nav>

            <div className="ml-auto flex shrink-0 items-center gap-2">
              <button
                ref={campoDaBusca}
                type="button"
                aria-keyshortcuts="Control+K Meta+K"
                onClick={() => setBuscaAberta(true)}
                className="pressiona-botao flex h-10 w-56 items-center gap-2 rounded-md bg-muted pr-2 pl-3 text-sm text-muted-foreground max-md:hidden"
              >
                <Search aria-hidden="true" className="size-4" />
                <span className="flex-1 text-left">
                  Pesquisar<span className="sr-only"> aulas e vídeos</span>
                </span>
                <Kbd
                  aria-hidden="true"
                  className="bg-transparent text-foreground/70"
                >
                  {atalho}
                </Kbd>
              </button>
              <Button
                ref={lupaDaBusca}
                type="button"
                variant="ghost"
                size="icon"
                className="md:hidden"
                aria-label="Abrir a busca"
                onClick={() => setBuscaAberta(true)}
              >
                <Search />
              </Button>
              <div className="empty:hidden">
                <Sininho />
              </div>
              <MenuDoAvatar
                linkDoEstudio={linkDoEstudio}
                aoReverBoasVindas={reverBoasVindas}
              />
            </div>
          </div>
        </header>
        <BuscaRapida
          aberto={buscaAberta}
          aoMudar={setBuscaAberta}
          origem={() =>
            [campoDaBusca.current, lupaDaBusca.current].find(
              (el) => el && el.offsetParent !== null,
            ) ?? null
          }
        />

        {/* Alvo do "Pular para o conteúdo". No celular reserva o espaço das abas do pé. */}
        <div
          id="conteudo"
          tabIndex={-1}
          className="flex flex-1 flex-col outline-none max-md:pb-[calc(3.5rem+env(safe-area-inset-bottom))]"
        >
          {children}
        </div>

        <nav
          aria-label="Abas"
          className="abas-do-pe material-barra fixed inset-x-0 bottom-0 z-30 grid grid-cols-2 pb-[env(safe-area-inset-bottom)] md:hidden"
        >
          {destinos.map((d) => {
            const Icone = ICONES_DOS_DESTINOS[d.id]
            const atual = ativo === d.id
            return (
              <Link
                key={d.id}
                to={d.para}
                aria-current={atual ? 'page' : undefined}
                // Tocar na aba ativa, estando na página dela, leva ao topo. De dentro (um curso, uma
                // aula), a aba ativa ainda navega para o destino.
                onClick={(e) => {
                  if (atual && naPaginaDoDestino(caminho, d.para)) {
                    e.preventDefault()
                    window.scrollTo({ top: 0, behavior: 'smooth' })
                  }
                }}
                className="pressiona-linha flex h-14 flex-col items-center justify-center gap-0.5 text-xs font-medium text-muted-foreground no-underline transition-colors duration-base aria-[current=page]:text-primary"
              >
                <Icone className="size-5" aria-hidden="true" />
                {d.rotulo}
              </Link>
            )
          })}
        </nav>

        {janela}
      </div>
    </TooltipProvider>
  )
}
