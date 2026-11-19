import { Link, type LinkProps, useRouter } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'
import type { MouseEvent } from 'react'
import { cn } from '#/lib/utils'

/**
 * "Voltar" discreto das rotas de dentro. Volta ao lugar de onde a aluna veio (histórico do próprio
 * app); se ela abriu a página direto, o link leva ao `destino`. Ctrl/Cmd/Shift e botão do meio seguem
 * com o navegador (abrir em nova aba).
 */
export function Voltar({
  destino,
  children,
  className,
}: {
  destino: LinkProps
  children: string
  className?: string
}) {
  const router = useRouter()
  function aoClicar(e: MouseEvent<HTMLAnchorElement>) {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey)
      return
    if (router.history.canGoBack()) {
      e.preventDefault()
      router.history.back()
    }
  }
  return (
    <Link
      {...destino}
      onClick={aoClicar}
      className={cn(
        'pressiona-linha -ml-2 flex w-fit max-w-full items-center gap-1.5 rounded-md px-2 py-1 text-sm text-muted-foreground no-underline transition-colors duration-base hover:text-foreground',
        className,
      )}
    >
      <ArrowLeft className="size-4 shrink-0" aria-hidden="true" />
      <span className="truncate">{children}</span>
    </Link>
  )
}
