/**
 * Estados de tela do painel (P8): vazio, carregando, erro e não encontrado. Sem ilustração: o painel
 * é ferramenta de trabalho.
 *
 *   <VazioDoPainel
 *     titulo="Nenhum aviso por aqui"                       // opcional
 *     mensagem="Quando a Hotmart mandar uma venda, ela aparece aqui."
 *     acao={<Button asChild variant="outline"><Link to="...">Ligar um produto</Link></Button>}  // o próximo passo
 *   />
 *
 * `CarregandoDoPainel`, `ErroDoPainel` e `NaoEncontradoDoPainel` já valem para TODAS as rotas do
 * painel: `routes/painel.tsx` os usa e `aplicarEstadosDoPainel` (chamado em `router.tsx`) os põe em
 * cada rota filha que não tem os seus. Uma tela só passa os próprios se precisar de outro texto.
 * O erro tem "Tentar de novo", que refaz a busca da tela (`router.invalidate()`).
 */
import {
  type AnyRouter,
  type ErrorComponentProps,
  Link,
  useRouter,
} from '@tanstack/react-router'
import { useState } from 'react'
import { PaginaDoPainel } from '#/components/painel/pagina'
import { Button } from '#/components/ui/button'
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '#/components/ui/empty'
import { Skeleton } from '#/components/ui/skeleton'
import { cn } from '#/lib/utils'

export function VazioDoPainel({
  titulo,
  mensagem,
  acao,
  className,
}: {
  titulo?: string
  mensagem: React.ReactNode
  acao?: React.ReactNode
  className?: string
}) {
  return (
    <Empty
      className={cn(
        'items-start gap-4 rounded-[var(--radius-card)] border border-dashed p-6 text-left md:p-8',
        className,
      )}
    >
      <EmptyHeader className="max-w-prose items-start text-left">
        {titulo ? (
          <EmptyTitle className="text-base">{titulo}</EmptyTitle>
        ) : null}
        <EmptyDescription className="text-left">{mensagem}</EmptyDescription>
      </EmptyHeader>
      {acao ? (
        <EmptyContent className="items-start">{acao}</EmptyContent>
      ) : null}
    </Empty>
  )
}

/** Tela carregando: o desenho da página (título, contexto e linhas), sem girar nada. */
export function CarregandoDoPainel() {
  return (
    <PaginaDoPainel largura="larga">
      <div
        role="status"
        aria-label="Carregando"
        aria-live="polite"
        className="flex flex-col gap-6"
      >
        <div className="flex flex-col gap-2">
          <Skeleton className="h-8 w-56 max-w-full" />
          <Skeleton className="h-4 w-96 max-w-full" />
        </div>
        <div className="flex flex-col gap-3 rounded-[var(--radius-card)] border bg-card p-4 shadow-[var(--shadow-card)]">
          {[0, 1, 2, 3, 4].map((n) => (
            <Skeleton key={n} className="h-10 w-full" />
          ))}
        </div>
      </div>
    </PaginaDoPainel>
  )
}

function detalheDoErro(erro: unknown) {
  if (erro instanceof Error && erro.message) return erro.message.slice(0, 300)
  return null
}

export function ErroDoPainel({ error, reset }: Partial<ErrorComponentProps>) {
  const router = useRouter()
  const [tentando, setTentando] = useState(false)
  async function tentarDeNovo() {
    setTentando(true)
    try {
      await router.invalidate()
      reset?.()
    } finally {
      setTentando(false)
    }
  }
  return (
    <PaginaDoPainel>
      <div
        role="alert"
        className="flex max-w-prose flex-col items-start gap-4 rounded-[var(--radius-card)] border bg-card p-6 shadow-[var(--shadow-card)]"
      >
        <div className="flex flex-col gap-1">
          <h1 className="font-display text-xl tracking-(--tracking-display)">
            Não deu para abrir esta tela
          </h1>
          <p className="text-sm text-muted-foreground">
            Pode ser a conexão ou uma falha nossa. O que você já salvou continua
            salvo.
          </p>
        </div>
        {detalheDoErro(error) ? (
          <details className="text-xs text-muted-foreground">
            <summary className="cursor-pointer">Detalhe para o suporte</summary>
            <p className="mt-1 [overflow-wrap:anywhere]">
              {detalheDoErro(error)}
            </p>
          </details>
        ) : null}
        <div className="flex flex-wrap gap-3">
          <Button
            onClick={() => void tentarDeNovo()}
            disabled={tentando}
            className="toque:min-h-11"
          >
            {tentando ? 'Tentando…' : 'Tentar de novo'}
          </Button>
          <Button asChild variant="outline" className="toque:min-h-11">
            <Link to="/painel">Ir ao início do Estúdio</Link>
          </Button>
        </div>
      </div>
    </PaginaDoPainel>
  )
}

export function NaoEncontradoDoPainel() {
  return (
    <PaginaDoPainel>
      <div className="flex max-w-prose flex-col items-start gap-4 rounded-[var(--radius-card)] border bg-card p-6 shadow-[var(--shadow-card)]">
        <div className="flex flex-col gap-1">
          <h1 className="font-display text-xl tracking-(--tracking-display)">
            Não achamos esta página
          </h1>
          <p className="text-sm text-muted-foreground">
            O endereço pode estar errado, ou o item foi excluído.
          </p>
        </div>
        <Button asChild variant="outline" className="toque:min-h-11">
          <Link to="/painel">Ir ao início do Estúdio</Link>
        </Button>
      </div>
    </PaginaDoPainel>
  )
}

/**
 * Põe carregando, erro e não encontrado do painel em cada rota filha de `/painel` e `/estudio`
 * que não tem os seus. Assim o estado aparece dentro da casca, com o menu à vista, em todas as
 * telas de uma vez. Chamado uma vez em `router.tsx`. A área do aluno não é tocada.
 */
export function aplicarEstadosDoPainel(router: AnyRouter) {
  for (const rota of Object.values(router.routesById) as {
    id: string
    options: Record<string, unknown>
    update: (opcoes: Record<string, unknown>) => unknown
  }[]) {
    if (!/^\/(painel|estudio)\//.test(rota.id)) continue
    rota.update({
      pendingComponent: rota.options.pendingComponent ?? CarregandoDoPainel,
      errorComponent: rota.options.errorComponent ?? ErroDoPainel,
      notFoundComponent:
        rota.options.notFoundComponent ?? NaoEncontradoDoPainel,
    })
  }
}
