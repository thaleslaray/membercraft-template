/**
 * Abas de navegação do painel (P6): cada aba é um endereço (`Link`), não um painel escondido.
 *
 *   <AbasDoPainel
 *     rotulo="Seções de Vendas"
 *     abas={[
 *       { rotulo: 'Vendas', para: '/painel/vendas', exata: true },
 *       { rotulo: 'Produtos', para: '/painel/vendas/produtos' },
 *       { rotulo: 'Alunos', para: '/painel/conteudo/$cursoId/alunos', params: { cursoId } },
 *       { rotulo: 'Vendas com erro', para: '/painel/vendas', search: { situacao: 'com_erro' } },
 *     ]}
 *   />
 *
 * A aba ativa ganha `aria-current="page"` e o único estilo de ativo (traço vinho embaixo). `exata`
 * marca ativa só no endereço exato (use na aba "raiz", que é prefixo das outras). Com `search`,
 * a aba só fica ativa quando a busca da URL também bate. Alvos de 44 px no toque; se não couberem
 * na largura, as abas rolam de lado com sombra na borda. Substitui o Radix Tabs usado como navegação.
 */
import { Link, useRouterState } from '@tanstack/react-router'
import { cn } from '#/lib/utils'
import { abaAtiva } from '#/regras/painel'
import type { FileRouteTypes } from '#/routeTree.gen'

export type AbaDoPainel = {
  rotulo: string
  para: FileRouteTypes['to']
  params?: Record<string, string>
  search?: Record<string, unknown>
  exata?: boolean
}

export function AbasDoPainel({
  abas,
  rotulo,
  className,
}: {
  abas: AbaDoPainel[]
  rotulo: string
  className?: string
}) {
  const caminho = useRouterState({ select: (s) => s.location.pathname })
  const busca = useRouterState({
    select: (s) => s.location.search as Record<string, unknown>,
  })
  return (
    <nav aria-label={rotulo} className={cn('min-w-0', className)}>
      <ul className="rolagem-com-sinal flex gap-1 border-b">
        {abas.map((aba) => {
          const atual = abaAtiva(aba, caminho, busca)
          return (
            <li key={`${aba.para}-${aba.rotulo}`} className="shrink-0">
              <Link
                to={aba.para as never}
                params={aba.params as never}
                search={aba.search as never}
                aria-current={atual ? 'page' : undefined}
                className={cn(
                  'relative inline-flex h-10 items-center px-3 text-sm font-medium whitespace-nowrap text-muted-foreground no-underline transition-colors hover:text-foreground toque:h-11',
                  'focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring',
                  'after:absolute after:inset-x-2 after:-bottom-px after:h-0.5 after:rounded-full after:bg-transparent',
                  atual && 'text-foreground after:bg-brand',
                )}
              >
                {aba.rotulo}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
