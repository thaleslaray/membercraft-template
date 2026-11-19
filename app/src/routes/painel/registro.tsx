import { createFileRoute } from '@tanstack/react-router'
import { BarraDeFiltros } from '#/components/painel/barra-de-filtros'
import { VazioDoPainel } from '#/components/painel/estados'
import { FiltroDeDatas } from '#/components/painel/filtro-de-datas'
import { CabecalhoDaPagina, PaginaDoPainel } from '#/components/painel/pagina'
import { Paginacao } from '#/components/painel/paginacao'
import { TabelaDoPainel } from '#/components/painel/tabela'
import { FUSO_DA_ESCOLA, formatarDataHoraNoFuso } from '#/lib/datas'
import { registroDeAcoesFn } from '#/lib/equipe-fns'
import { paginaDaBusca } from '#/lib/pagina-da-busca'

interface Busca {
  pagina?: number
  autorId?: string
  acao?: string
  de?: string
  ate?: string
}

const texto = (v: unknown) => (typeof v === 'string' && v ? v : undefined)
const data = (v: unknown) =>
  typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined

// Registro de ações sensíveis: só o Proprietário lê (`ler-registro-de-acoes`).
export const Route = createFileRoute('/painel/registro')({
  validateSearch: (s: Record<string, unknown>): Busca => ({
    pagina: paginaDaBusca(s.pagina),
    autorId: texto(s.autorId),
    acao: texto(s.acao),
    de: data(s.de),
    ate: data(s.ate),
  }),
  loaderDeps: ({ search }) => search,
  loader: ({ deps }) => registroDeAcoesFn({ data: deps }),
  head: () => ({ meta: [{ title: 'Registro de ações · Estúdio' }] }),
  component: Registro,
})

function Registro() {
  const acoes = Route.useLoaderData()
  const busca = Route.useSearch()
  const filtrado = Boolean(busca.autorId || busca.acao || busca.de || busca.ate)
  return (
    <PaginaDoPainel largura="larga">
      <CabecalhoDaPagina
        titulo="Registro de ações"
        contexto="Quem da equipe fez o quê, e quando. Só o Proprietário lê."
      />
      <div className="flex flex-col gap-3">
        <BarraDeFiltros
          rotulo="Filtrar ações"
          valores={busca}
          filtros={[
            {
              chave: 'autorId',
              rotulo: 'Pessoa',
              opcoes: acoes.opcoes.pessoas,
              todas: 'Todas as pessoas',
            },
            {
              chave: 'acao',
              rotulo: 'Ação',
              opcoes: acoes.opcoes.acoes,
              todas: 'Todas as ações',
            },
          ]}
        />
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
          <FiltroDeDatas de={busca.de} ate={busca.ate} />
        </div>
      </div>
      <h2 id="acoes" tabIndex={-1} className="sr-only">
        Ações registradas
      </h2>
      <TabelaDoPainel
        rotulo="Ações registradas"
        linhas={acoes.itens}
        chave={(a) => a.id}
        testIdDaLinha={(a) => `acao-${a.id}`}
        vazio={
          <VazioDoPainel
            mensagem={
              filtrado
                ? 'Nenhuma ação com esses filtros. Limpe os filtros ou mude o período.'
                : 'Nenhuma ação registrada ainda. As ações sensíveis da equipe aparecem aqui.'
            }
          />
        }
        colunas={[
          {
            rotulo: 'Ação',
            essencial: true,
            className: 'min-w-44 font-medium',
            celula: (a) => a.rotulo,
          },
          {
            rotulo: 'Quem',
            essencial: true,
            className: 'min-w-48',
            celula: (a) =>
              a.autorNome ? (
                <>
                  {a.autorNome}
                  <span className="block text-xs text-muted-foreground">
                    {a.autorEmail}
                  </span>
                </>
              ) : (
                'Pessoa removida'
              ),
          },
          {
            rotulo: 'Quando',
            essencial: true,
            className: 'whitespace-nowrap',
            celula: (a) => formatarDataHoraNoFuso(a.criadoEm, FUSO_DA_ESCOLA),
          },
          {
            rotulo: 'Detalhe',
            essencial: true,
            className: 'min-w-48 text-xs text-muted-foreground',
            celula: (a) => a.detalhe || '—',
          },
        ]}
      />
      <Paginacao
        pagina={acoes.pagina}
        totalDePaginas={acoes.totalDePaginas}
        inicio="acoes"
      />
    </PaginaDoPainel>
  )
}
