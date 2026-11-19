import { createFileRoute, Link, notFound } from '@tanstack/react-router'
import {
  DetalheDaEntrega,
  dataDaEntrega,
  notaDaEntrega,
} from '#/components/painel/entrega'
import { EtiquetaDeEstado } from '#/components/painel/etiqueta-de-estado'
import { CabecalhoDaPagina, PaginaDoPainel } from '#/components/painel/pagina'
import { Button } from '#/components/ui/button'
import { detalheDaEntregaFn } from '#/lib/entregas-fns'
import { ESTADO_DA_ENTREGA } from '#/regras/entregas-do-painel'

export const Route = createFileRoute('/painel/entregas/$tentativaId')({
  loader: async ({ params }) => {
    const entrega = await detalheDaEntregaFn({
      data: { tentativaId: params.tentativaId },
    })
    if (!entrega) throw notFound()
    return entrega
  },
  head: () => ({ meta: [{ title: 'Entrega · Estúdio' }] }),
  component: Entrega,
})

function Entrega() {
  const entrega = Route.useLoaderData()
  const aguardando = entrega.estado === 'aguardando_correcao'
  return (
    <PaginaDoPainel>
      <CabecalhoDaPagina
        titulo={entrega.aulaTitulo}
        contexto={`${entrega.cursoNome} · tentativa ${entrega.numero}`}
        voltar={{ rotulo: 'Entregas', to: '/painel/entregas' }}
        acao={
          aguardando ? (
            <Button asChild className="toque:min-h-11">
              <Link to="/painel/correcao">Corrigir na fila</Link>
            </Button>
          ) : undefined
        }
      />
      <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-muted-foreground">Aluna</dt>
          <dd className="[overflow-wrap:anywhere]">
            <Link
              to="/painel/alunos/$alunoId"
              params={{ alunoId: entrega.alunoId }}
              className="font-medium hover:underline"
            >
              {entrega.alunoNome || 'Sem nome'}
            </Link>{' '}
            ({entrega.alunoEmail})
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Enviada em</dt>
          <dd>{dataDaEntrega(entrega.enviadaEm)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Estado</dt>
          <dd>
            <EtiquetaDeEstado {...ESTADO_DA_ENTREGA[entrega.estado]} />
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Nota</dt>
          <dd className="tabular-nums">{notaDaEntrega(entrega)}</dd>
        </div>
        {entrega.corrigidaPor && (
          <div>
            <dt className="text-muted-foreground">Corrigida por</dt>
            <dd>
              {entrega.corrigidaPor}
              {entrega.corrigidaEm &&
                ` em ${dataDaEntrega(entrega.corrigidaEm)}`}
            </dd>
          </div>
        )}
      </dl>
      <DetalheDaEntrega entrega={entrega} />
    </PaginaDoPainel>
  )
}
