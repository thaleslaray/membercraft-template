import { createFileRoute, Link } from '@tanstack/react-router'
import { CabecalhoDaPagina, PaginaDoPainel } from '#/components/painel/pagina'
import { useAcao } from '#/components/painel/use-acao'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '#/components/ui/card'
import { definirResumoDiarioFn, resumoDiarioFn } from '#/lib/equipe-fns'

// O que está esperando a Equipe e o interruptor do resumo diário (cada pessoa liga o seu).
export const Route = createFileRoute('/painel/resumo')({
  loader: () => resumoDiarioFn(),
  head: () => ({ meta: [{ title: 'Resumo diário · Estúdio' }] }),
  component: Resumo,
})

function Resumo() {
  const { ligado, filas } = Route.useLoaderData()
  const { executar, ocupado } = useAcao()
  return (
    <PaginaDoPainel>
      <CabecalhoDaPagina
        titulo="Resumo diário"
        contexto="O que está esperando a equipe agora."
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Filas</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="flex flex-col divide-y text-sm">
            {filas.map((f) => (
              <li key={f.id} className="flex items-center gap-3 py-2">
                <Link
                  to={f.para as '/painel/avaliacoes'}
                  className="flex min-h-11 flex-1 items-center no-underline hover:underline"
                >
                  {f.rotulo}
                </Link>
                {f.destaque && (
                  <span className="text-xs text-destructive">{f.destaque}</span>
                )}
                <Badge
                  variant={f.total > 0 ? 'default' : 'outline'}
                  className="tabular-nums"
                >
                  {f.total}
                </Badge>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">E-mail das 8h</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          <p className="flex-1 text-sm text-muted-foreground">
            Todo dia às 8h (Brasília) você recebe as filas acima por e-mail, só
            quando há pendência.{' '}
            <strong>{ligado ? 'Está ligado.' : 'Está desligado.'}</strong>
          </p>
          <Button
            variant={ligado ? 'outline' : 'default'}
            disabled={ocupado}
            className="toque:min-h-11"
            onClick={() =>
              executar(
                () => definirResumoDiarioFn({ data: { ligado: !ligado } }),
                ligado ? 'Resumo diário desligado.' : 'Resumo diário ligado.',
              )
            }
          >
            {ligado ? 'Desligar o resumo' : 'Ligar o resumo'}
          </Button>
        </CardContent>
      </Card>
    </PaginaDoPainel>
  )
}
