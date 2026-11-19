import { Link, useRouterState } from '@tanstack/react-router'
import { Search } from 'lucide-react'
import { type ReactNode, useEffect, useRef, useState } from 'react'
import { useBoasVindasDaCasca } from '#/components/casca/boas-vindas-da-casca'
import { BuscaRapida } from '#/components/casca/busca-rapida'
import {
  ICONES_DOS_DESTINOS,
  naPaginaDoDestino,
} from '#/components/casca/icones-dos-destinos'
import { MenuDoAvatar } from '#/components/casca/menu-do-avatar'
import { Sininho } from '#/components/casca/sininho'
import { MarcaLume } from '#/components/casca-lume/marca-lume'
import { TooltipProvider } from '#/components/ui/tooltip'
import { appConfig } from '#/config/app'
import { useAparencia } from '#/lib/aparencia-queries'
import { destinoAtivo, destinosDoAluno } from '#/lib/destinos-da-casca'
import { querMenosMovimento } from '#/lib/menos-movimento'
import { cn } from '#/lib/utils'

// Casca Lume da área do aluno: topo fixo transparente que fica sólido ao rolar (fundo cheio, sem
// véu nem desfoque), a marca, os dois destinos, a busca, o sininho e o avatar; no celular os destinos
// vão para abas fixas e sólidas no pé. O conteúdo começa abaixo do topo; as páginas com destaque
// (Início, curso) sobem por baixo dele.
export function CascaLume({
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
  const [buscaAberta, setBuscaAberta] = useState(false)
  const botaoDaBusca = useRef<HTMLButtonElement>(null)
  const [solido, setSolido] = useState(false)
  useEffect(() => {
    const ler = () => setSolido(window.scrollY > 40)
    ler()
    window.addEventListener('scroll', ler, { passive: true })
    return () => window.removeEventListener('scroll', ler)
  }, [])

  const { logoUrl } = useAparencia()
  const { reverBoasVindas, janela } = useBoasVindasDaCasca()

  return (
    <TooltipProvider delayDuration={0}>
      <div
        data-casca="lume"
        className="flex min-h-svh flex-col bg-background text-foreground"
      >
        {/* Primeiro item do teclado: pula a barra e vai direto ao conteúdo da página. */}
        <a
          href="#conteudo"
          className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-md focus:border focus:bg-background focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:shadow-md"
        >
          Pular para o conteúdo
        </a>
        <header
          data-sobre={solido}
          className={cn(
            'fixed inset-x-0 top-[var(--faixa-entrar-como,0px)] z-30 transition-colors duration-200 motion-reduce:transition-none',
            solido
              ? 'border-b bg-background'
              : 'bg-gradient-to-b from-background/85 to-transparent',
          )}
        >
          <div className="flex h-(--lume-topo) items-center gap-3 px-(--pad) lume-tela:gap-9">
            <Link
              to="/"
              aria-label={`${appConfig.marca.nome}, Início`}
              className="flex min-w-0 items-center text-foreground no-underline"
            >
              <MarcaLume logoUrl={logoUrl} />
            </Link>
            <nav aria-label="Destinos" className="flex gap-1 lume-cel:hidden">
              {destinos.map((d) => (
                <Link
                  key={d.id}
                  to={d.para}
                  aria-current={ativo === d.id ? 'page' : undefined}
                  className="rounded-md px-3 py-2 text-[15px] font-medium text-muted-foreground no-underline transition-colors hover:text-foreground aria-[current=page]:font-semibold aria-[current=page]:text-(color:--destino-ativo)"
                >
                  {d.rotulo}
                </Link>
              ))}
            </nav>
            <div className="ml-auto flex shrink-0 items-center gap-1 lume-tela:gap-2">
              <button
                ref={botaoDaBusca}
                type="button"
                aria-label="Abrir a busca"
                aria-keyshortcuts="Control+K Meta+K"
                onClick={() => setBuscaAberta(true)}
                className="grid size-10 place-items-center rounded-full text-muted-foreground transition-colors hover:text-foreground toque:size-11"
              >
                <Search className="size-5" aria-hidden="true" />
              </button>
              <div className="empty:hidden">
                <Sininho lume />
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
          origem={() => botaoDaBusca.current}
          painelSolido
        />

        {/* Alvo do "Pular para o conteúdo". Reserva o espaço do topo fixo e, no celular, o das abas do pé. */}
        <div
          id="conteudo"
          tabIndex={-1}
          className="flex flex-1 flex-col pt-(--lume-topo) outline-none lume-cel:pb-[calc(4rem+env(safe-area-inset-bottom))]"
        >
          {children}
        </div>

        <nav
          aria-label="Abas"
          className="fixed inset-x-0 bottom-0 z-30 grid h-16 grid-cols-2 border-t bg-background pb-[env(safe-area-inset-bottom)] box-content lume-tela:hidden"
        >
          {destinos.map((d) => {
            const Icone = ICONES_DOS_DESTINOS[d.id]
            const atual = ativo === d.id
            return (
              <Link
                key={d.id}
                to={d.para}
                aria-current={atual ? 'page' : undefined}
                onClick={(e) => {
                  if (atual && naPaginaDoDestino(caminho, d.para)) {
                    e.preventDefault()
                    window.scrollTo({
                      top: 0,
                      behavior: querMenosMovimento() ? 'auto' : 'smooth',
                    })
                  }
                }}
                className="grid place-items-center content-center gap-[3px] text-[11px] font-semibold text-muted-foreground no-underline aria-[current=page]:text-(color:--destino-ativo)"
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
