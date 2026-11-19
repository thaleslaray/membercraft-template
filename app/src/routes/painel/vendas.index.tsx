import { createFileRoute, Link } from '@tanstack/react-router'
import { BarraDeFiltros } from '#/components/painel/barra-de-filtros'
import { BotaoConferirHotmart } from '#/components/painel/botao-conferir-hotmart'
import { VazioDoPainel } from '#/components/painel/estados'
import { EtiquetaDeEstado } from '#/components/painel/etiqueta-de-estado'
import { Paginacao } from '#/components/painel/paginacao'
import { type ColunaDaTabela, TabelaDoPainel } from '#/components/painel/tabela'
import { useAcao } from '#/components/painel/use-acao'
import { Button } from '#/components/ui/button'
import type { Gateway } from '#/db/schema'
import { FUSO_DA_ESCOLA, formatarDataHoraNoFuso } from '#/lib/datas'
import { paginaDaBusca } from '#/lib/pagina-da-busca'
import { reprocessarVendaFn, vendasDaVoompFn } from '#/lib/vendas-fns'
import { podeReprocessarAviso } from '#/regras/estados-de-vendas'
import { ESTADO_DO_AVISO } from '#/regras/painel'
import { podeFazer, tratarPerfil } from '#/regras/permissoes'
import type { SituacaoDoAviso } from '#/regras/vendas'

export const Route = createFileRoute('/painel/vendas/')({
  validateSearch: (
    s: Record<string, unknown>,
  ): { situacao?: SituacaoDoAviso; gateway?: Gateway; pagina?: number } => ({
    situacao:
      typeof s.situacao === 'string' && s.situacao in SITUACOES
        ? (s.situacao as SituacaoDoAviso)
        : undefined,
    gateway:
      typeof s.gateway === 'string' && s.gateway in PLATAFORMAS
        ? (s.gateway as Gateway)
        : undefined,
    pagina: paginaDaBusca(s.pagina),
  }),
  loaderDeps: ({ search }) => ({
    situacao: search.situacao,
    gateway: search.gateway,
    pagina: search.pagina,
  }),
  loader: ({ deps }) =>
    vendasDaVoompFn({
      data: {
        situacao: deps.situacao,
        gateway: deps.gateway,
        pagina: deps.pagina,
      },
    }),
  head: () => ({ meta: [{ title: 'Vendas · Estúdio' }] }),
  component: VendasDaVoomp,
})

const PLATAFORMAS: Record<Gateway, string> = {
  voomp: 'Voomp',
  hotmart: 'Hotmart',
}

const SITUACOES = ESTADO_DO_AVISO satisfies Record<SituacaoDoAviso, unknown>

const GATILHOS: Record<string, string> = {
  salePaid: 'Venda paga',
  PURCHASE_APPROVED: 'Compra aprovada',
  PURCHASE_REFUNDED: 'Reembolso',
  PURCHASE_CHARGEBACK: 'Chargeback',
  PURCHASE_PROTEST: 'Pedido de reembolso',
  PURCHASE_PARTIALLY_REFUNDED: 'Reembolso parcial',
  saleRefunded: 'Reembolso',
  saleChargedback: 'Chargeback',
}

type Aviso = Awaited<
  ReturnType<typeof vendasDaVoompFn>
>['avisos']['itens'][number]

function VendasDaVoomp() {
  const { avisos, semTurma, voompEmUso } = Route.useLoaderData()
  const busca = Route.useSearch()
  const { executar, ocupado } = useAcao()
  const { session } = Route.useRouteContext()
  const podeConferir = podeFazer(
    tratarPerfil(session.user.perfil),
    'gerir-credenciais-da-hotmart',
  )
  const filtrando = busca.situacao !== undefined || busca.gateway !== undefined

  const colunas: ColunaDaTabela<Aviso>[] = [
    {
      rotulo: 'Recebido',
      essencial: true,
      className: 'whitespace-nowrap',
      celula: (a) => (
        <>
          <div className="tabular-nums">
            {formatarDataHoraNoFuso(a.recebidoEm, FUSO_DA_ESCOLA)}
          </div>
          <div className="text-xs text-muted-foreground">
            {PLATAFORMAS[a.gateway]} · {GATILHOS[a.gatilho] ?? a.gatilho}
          </div>
        </>
      ),
    },
    {
      rotulo: 'Aluno',
      essencial: true,
      className: 'md:min-w-52',
      celula: (a) =>
        a.alunoEmail ? (
          <>
            <div>{a.alunoNome || 'Sem nome'}</div>
            <div className="text-muted-foreground [overflow-wrap:anywhere]">
              {a.alunoEmail}
            </div>
          </>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      rotulo: 'Produto',
      className: 'md:min-w-48',
      celula: (a) =>
        a.produtoId ? (
          <>
            <div
              className="line-clamp-2"
              title={a.produtoNome || `Produto ${a.produtoId}`}
            >
              {a.produtoNome || `Produto ${a.produtoId}`}
            </div>
            <div className="text-xs text-muted-foreground">
              id {a.produtoId}
              {a.ofertaHash ? ` · oferta ${a.ofertaHash}` : ''}
            </div>
          </>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      rotulo: 'Turma',
      className: 'md:min-w-56',
      celula: (a) =>
        a.turmas.length > 0 ? <TurmasDoAviso turmas={a.turmas} /> : '—',
    },
    {
      rotulo: 'Situação',
      essencial: true,
      className: 'md:min-w-40',
      celula: (a) => (
        <>
          <EtiquetaDeEstado {...SITUACOES[a.situacao]} />
          {a.motivo && (
            <div className="mt-1 text-xs text-muted-foreground">{a.motivo}</div>
          )}
        </>
      ),
    },
    {
      rotulo: 'Ações',
      rotuloOculto: true,
      essencial: true,
      celula: (a) =>
        podeReprocessarAviso(a.situacao) ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={ocupado}
            className="toque:min-h-11"
            aria-label={`Reprocessar o aviso de ${a.alunoEmail ?? a.id}`}
            onClick={() =>
              executar(
                () => reprocessarVendaFn({ data: { id: a.id } }),
                'Aviso reprocessado.',
              )
            }
          >
            Reprocessar
          </Button>
        ) : null,
    },
  ]

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <p className="max-w-3xl text-sm text-muted-foreground">
          Do mais novo ao mais antigo. Só a venda paga, o reembolso e o
          chargeback mexem em matrícula; os outros só ficam gravados. Mudar uma
          ligação não altera as matrículas que já existem: para corrigir, ajuste
          a matrícula no perfil do aluno ou reprocesse a venda.
        </p>
        {podeConferir && <BotaoConferirHotmart />}
      </div>
      <section aria-labelledby="avisos" className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <h2
            id="avisos"
            tabIndex={-1}
            className="text-base font-semibold outline-none"
          >
            Avisos recebidos
            {semTurma > 0 && (
              <span className="ml-2 text-sm font-normal text-muted-foreground tabular-nums">
                {semTurma} esperando turma
              </span>
            )}
          </h2>
          <BarraDeFiltros
            rotulo="Filtrar avisos"
            valores={busca}
            filtros={[
              ...(voompEmUso
                ? [
                    {
                      chave: 'gateway',
                      rotulo: 'Plataforma',
                      opcoes: Object.entries(PLATAFORMAS).map(
                        ([valor, rotulo]) => ({ valor, rotulo }),
                      ),
                    },
                  ]
                : []),
              {
                chave: 'situacao',
                rotulo: 'Situação',
                opcoes: Object.entries(SITUACOES).map(([valor, e]) => ({
                  valor,
                  rotulo: e.rotulo,
                })),
              },
            ]}
          />
        </div>
        <TabelaDoPainel
          rotulo="Avisos recebidos"
          linhas={avisos.itens}
          chave={(a) => a.id}
          testIdDaLinha={(a) => `aviso-${a.id}`}
          colunas={colunas}
          vazio={
            <VazioDoPainel
              titulo={
                filtrando
                  ? 'Nenhum aviso com esse filtro'
                  : 'Nenhum aviso por aqui'
              }
              mensagem={
                filtrando
                  ? 'Troque a situação ou a plataforma, ou limpe os filtros.'
                  : 'Quando a Hotmart ou a Voomp mandar uma venda, ela aparece aqui. Confira se o produto está ligado a uma turma.'
              }
              acao={
                filtrando ? null : (
                  <Button asChild variant="outline">
                    <Link to="/painel/vendas/produtos">
                      Ver os produtos ligados
                    </Link>
                  </Button>
                )
              }
            />
          }
        />
      </section>
      <Paginacao
        pagina={avisos.pagina}
        totalDePaginas={avisos.totalDePaginas}
        inicio="avisos"
      />
    </div>
  )
}

/**
 * As turmas de um aviso vêm como "Curso · Turma". Agrupa por curso: o nome do curso aparece uma
 * vez e as turmas embaixo, em lista curta, em vez de repetir o curso inteiro a cada turma.
 */
function TurmasDoAviso({ turmas }: { turmas: string[] }) {
  const porCurso = new Map<string, string[]>()
  for (const t of turmas) {
    const i = t.lastIndexOf(' · ')
    const curso = i > 0 ? t.slice(0, i) : t
    const turma = i > 0 ? t.slice(i + 3) : ''
    porCurso.set(curso, [...(porCurso.get(curso) ?? []), turma].filter(Boolean))
  }
  return (
    <div className="grid gap-2">
      {[...porCurso].map(([curso, nomes]) => (
        <div key={curso}>
          <div className="line-clamp-2" title={curso}>
            {curso}
          </div>
          {nomes.length > 0 && (
            <ul className="text-xs text-muted-foreground">
              {nomes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
  )
}
