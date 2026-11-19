import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import {
  CircleHelp,
  Clapperboard,
  Coins,
  LogOut,
  MoonIcon,
  Settings2,
  SunIcon,
  User,
} from 'lucide-react'
import { useTheme } from 'next-themes'
import { useEffect, useState } from 'react'
import { flushSync } from 'react-dom'
import { Avatar, AvatarFallback, AvatarImage } from '#/components/ui/avatar'
import { Button } from '#/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '#/components/ui/dropdown-menu'
import { sessionQuery } from '#/lib/auth-queries'
import { querMenosMovimento } from '#/lib/menos-movimento'
import { sairDaConta } from '#/lib/sair'

/**
 * Troca claro ↔ escuro com um esmaecimento de 200 ms sobre a raiz (View Transitions), sem salto de
 * brilho. Sem a API, ou com menos movimento, troca direto.
 */
function trocarTema(para: 'light' | 'dark', definir: (t: string) => void) {
  const raiz = document.documentElement
  const reduzido = querMenosMovimento()
  if (!document.startViewTransition || reduzido) {
    definir(para)
    return
  }
  raiz.classList.add('trocando-tema')
  const transicao = document.startViewTransition(() => {
    flushSync(() => definir(para))
  })
  void transicao.finished.finally(() => raiz.classList.remove('trocando-tema'))
}

// Menu do avatar: nasce do próprio botão (origem da transformação no botão, ver `.menu-nasce`).
export function MenuDoAvatar({
  linkDoEstudio = false,
  aoReverBoasVindas,
}: {
  linkDoEstudio?: boolean
  /** Só existe com vídeo de boas-vindas configurado (#101): sem ele o item não aparece. */
  aoReverBoasVindas?: () => void
}) {
  const { data: session, isPending } = useQuery(sessionQuery)
  const { resolvedTheme, setTheme } = useTheme()
  // `resolvedTheme` só existe depois que o next-themes lê o aparelho: o rótulo espera montar.
  const [montado, setMontado] = useState(false)
  useEffect(() => setMontado(true), [])
  const [saindo, setSaindo] = useState(false)
  const escuro = montado && resolvedTheme === 'dark'

  if (isPending) {
    return <div className="size-8 esqueleto rounded-full bg-muted" />
  }
  if (!session?.user) {
    return (
      <Button asChild variant="outline" size="sm">
        <Link to="/login">Entrar</Link>
      </Button>
    )
  }
  const { user } = session
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger
        aria-label="Abrir menu da conta"
        className="pressiona-botao rounded-full toque:-m-1.5 toque:p-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Avatar className="size-8">
          {user.image ? <AvatarImage src={user.image} alt="" /> : null}
          <AvatarFallback className="text-xs">
            {(user.name || user.email).charAt(0).toUpperCase() || 'U'}
          </AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        collisionPadding={16}
        className="menu-nasce min-w-56 max-w-[min(20rem,calc(100vw-2rem))] bg-popover *:data-[slot=dropdown-menu-item]:focus-visible:ring-2 *:data-[slot=dropdown-menu-item]:focus-visible:ring-ring *:data-[slot=dropdown-menu-item]:focus-visible:ring-inset"
      >
        {/* Quem está na conta: o nome em destaque e o e-mail embaixo, cortado se for longo. */}
        <DropdownMenuLabel className="grid min-w-0 gap-0.5 font-normal">
          {user.name && (
            <span className="truncate text-sm font-semibold text-foreground">
              {user.name}
            </span>
          )}
          <span className="truncate text-muted-foreground">{user.email}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to="/conta">
            <User />
            Sua conta
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link to="/pontos">
            <Coins />
            Meus pontos
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link to="/atendimento">
            <CircleHelp />
            Falar com a equipe
          </Link>
        </DropdownMenuItem>
        {aoReverBoasVindas && (
          <DropdownMenuItem onSelect={aoReverBoasVindas}>
            <Clapperboard />
            Rever as boas-vindas
          </DropdownMenuItem>
        )}
        {linkDoEstudio && (
          <DropdownMenuItem asChild>
            <Link to="/painel">
              <Settings2 />
              Estúdio da equipe
            </Link>
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() => trocarTema(escuro ? 'light' : 'dark', setTheme)}
        >
          {escuro ? <SunIcon /> : <MoonIcon />}
          {!montado
            ? 'Mudar entre o modo claro e o escuro'
            : escuro
              ? 'Modo claro'
              : 'Modo escuro'}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          disabled={saindo}
          aria-busy={saindo}
          onSelect={(e) => {
            e.preventDefault()
            setSaindo(true)
            void sairDaConta().catch(() => setSaindo(false))
          }}
        >
          <LogOut />
          {saindo ? 'Saindo…' : 'Sair'}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
