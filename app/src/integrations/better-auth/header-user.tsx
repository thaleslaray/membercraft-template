import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'

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

// O cliente do Better Auth só é carregado aqui, no "Sair": o cabeçalho entra em
// toda página e o cliente pesava no JavaScript inicial.
async function sair() {
  const { authClient } = await import('#/lib/auth-client')
  await authClient.signOut()
  window.location.assign('/')
}

// A sessão vem do mesmo cache do resto do app (`sessionQuery`), não do cliente.
export default function BetterAuthHeader() {
  const { data: session, isPending } = useQuery(sessionQuery)

  if (isPending) {
    return <div className="size-8 esqueleto rounded-full bg-muted" />
  }

  if (session?.user) {
    const { user } = session
    return (
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger
          aria-label="Abrir menu da conta"
          className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Avatar className="size-8">
            {user.image ? <AvatarImage src={user.image} alt="" /> : null}
            <AvatarFallback className="text-xs">
              {(user.name || user.email).charAt(0).toUpperCase() || 'U'}
            </AvatarFallback>
          </Avatar>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-48">
          <DropdownMenuLabel className="truncate font-normal text-muted-foreground">
            {user.email}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link to="/conta">Minha conta</Link>
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => {
              void sair()
            }}
          >
            Sair
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    )
  }

  return (
    <Button asChild variant="outline" size="sm">
      <Link to="/login">Entrar</Link>
    </Button>
  )
}
