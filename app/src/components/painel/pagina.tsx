/**
 * Página e cabeçalho do painel da equipe (P1). Toda tela do painel começa assim:
 *
 *   <PaginaDoPainel largura="larga">
 *     <CabecalhoDaPagina
 *       titulo="Vendas"
 *       contexto="Cada aviso que a Voomp ou a Hotmart mandou."
 *       voltar={{ rotulo: 'Cursos', to: '/painel/conteudo' }}        // opcional
 *       acao={<Button>Nova venda</Button>}                            // opcional: a ação principal
 *     />
 *     ...conteúdo...
 *   </PaginaDoPainel>
 *
 * - `PaginaDoPainel` renderiza o `<main>` da tela, alinhado à esquerda. `largura`: "normal"
 *   (formulários e leitura, 56rem) ou "larga" (tabelas, 72rem). O alvo do "Pular para o conteúdo"
 *   (`#conteudo`) fica na casca, em volta do `<main>`.
 * - `CabecalhoDaPagina`: título em `font-display`, uma linha de contexto em `--muted-foreground` e a
 *   ação principal no canto do título (abaixo dele no celular). `voltar` vira um ícone único de
 *   voltar (44 px no toque) com nome acessível "Voltar para {rotulo}". `params` vai ao `Link`.
 * - O título é o mesmo nome do item do menu e da trilha.
 */
import { Link } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'
import type { ReactNode } from 'react'
import { Button } from '#/components/ui/button'
import { cn } from '#/lib/utils'
import type { FileRouteTypes } from '#/routeTree.gen'

const LARGURAS = { normal: 'max-w-4xl', larga: 'max-w-6xl' } as const

export function PaginaDoPainel({
  largura = 'normal',
  className,
  children,
}: {
  largura?: keyof typeof LARGURAS
  className?: string
  children: ReactNode
}) {
  return (
    <main
      className={cn(
        'flex w-full min-w-0 flex-col gap-6 p-4 sm:p-6 md:p-8',
        LARGURAS[largura],
        className,
      )}
    >
      {children}
    </main>
  )
}

export type VoltarDoCabecalho = {
  /** Nome da tela de destino, ex.: "Cursos" (vira "Voltar para Cursos"). */
  rotulo: string
  to: FileRouteTypes['to']
  params?: Record<string, string>
}

export function CabecalhoDaPagina({
  titulo,
  contexto,
  voltar,
  acao,
}: {
  titulo: ReactNode
  contexto?: ReactNode
  voltar?: VoltarDoCabecalho
  acao?: ReactNode
}) {
  return (
    <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
      <div className="flex min-w-0 items-start gap-2">
        {voltar ? (
          <Button
            asChild
            variant="ghost"
            size="icon-sm"
            className="-ml-2 shrink-0 toque:size-11"
          >
            <Link
              to={voltar.to as never}
              params={voltar.params as never}
              aria-label={`Voltar para ${voltar.rotulo}`}
              title={`Voltar para ${voltar.rotulo}`}
            >
              <ArrowLeft aria-hidden="true" />
            </Link>
          </Button>
        ) : null}
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="font-display text-2xl leading-tight tracking-(--tracking-display) text-balance break-words md:text-[1.75rem]">
            {titulo}
          </h1>
          {contexto ? (
            <p className="max-w-prose text-sm text-muted-foreground md:text-base">
              {contexto}
            </p>
          ) : null}
        </div>
      </div>
      {acao ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2">{acao}</div>
      ) : null}
    </header>
  )
}
