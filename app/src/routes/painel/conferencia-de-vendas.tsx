import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { VazioDoPainel } from '#/components/painel/estados'
import { EtiquetaDeEstado } from '#/components/painel/etiqueta-de-estado'
import {
  AcoesDoFormulario,
  CampoDoPainel,
} from '#/components/painel/formulario'
import { CabecalhoDaPagina, PaginaDoPainel } from '#/components/painel/pagina'
import { Paginacao } from '#/components/painel/paginacao'
import { type ColunaDaTabela, TabelaDoPainel } from '#/components/painel/tabela'
import { useAcao } from '#/components/painel/use-acao'
import { Button } from '#/components/ui/button'
import { Card, CardContent, CardHeader } from '#/components/ui/card'
import { Input } from '#/components/ui/input'
import {
  conferenciaDaTelaFn,
  conferirPlanilhaFn,
  matricularConferenciaFn,
} from '#/lib/conferencia-fns'
import { FUSO_DA_ESCOLA, formatarDataHoraNoFuso } from '#/lib/datas'
import { paginaDaBusca } from '#/lib/pagina-da-busca'
import { toast } from '#/lib/toast'
import { ESTADO_DA_VENDA_CONFERIDA } from '#/regras/estados-de-vendas'
import { type Campo, ROTULO_DO_CAMPO } from '#/regras/planilha-voomp'

export const Route = createFileRoute('/painel/conferencia-de-vendas')({
  validateSearch: (
    s: Record<string, unknown>,
  ): { id?: string; pagina?: number } => ({
    id: typeof s.id === 'string' && s.id ? s.id : undefined,
    pagina: paginaDaBusca(s.pagina),
  }),
  loaderDeps: ({ search }) => ({ id: search.id, pagina: search.pagina }),
  loader: ({ deps }) =>
    conferenciaDaTelaFn({ data: { id: deps.id, pagina: deps.pagina } }),
  head: () => ({ meta: [{ title: 'Conferência de vendas · Estúdio' }] }),
  component: ConferenciaDeVendas,
})

const dataHora = (data: Date) => formatarDataHoraNoFuso(data, FUSO_DA_ESCOLA)

const CAMPOS = Object.keys(ROTULO_DO_CAMPO) as Campo[]

async function base64Do(arquivo: File): Promise<string> {
  const bytes = new Uint8Array(await arquivo.arrayBuffer())
  let binario = ''
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binario += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  }
  return btoa(binario)
}

type Dados = Awaited<ReturnType<typeof conferenciaDaTelaFn>>
type Pendente = NonNullable<Dados['atual']>['pendentes'][number]
type Conferencia = Dados['historico']['itens'][number]

function ConferenciaDeVendas() {
  const { historico, atual } = Route.useLoaderData()
  const navigate = useNavigate()
  const { executar, ocupado, erros } = useAcao()
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [colunas, setColunas] = useState<Partial<Record<Campo, string>>>({})

  async function conferir() {
    const limpas = Object.fromEntries(
      Object.entries(colunas).filter(([, v]) => v?.trim()),
    )
    const r = await executar(
      async () => {
        // `validar` já garantiu a planilha.
        const planilha = arquivo as File
        return conferirPlanilhaFn({
          data: {
            nome: planilha.name,
            base64: await base64Do(planilha),
            colunas: limpas,
          },
        })
      },
      'Planilha conferida.',
      {
        validar: () => ({
          planilha: arquivo
            ? undefined
            : 'Escolha a planilha exportada da Voomp (CSV ou XLSX).',
        }),
      },
    )
    if (r)
      await navigate({
        to: '/painel/conferencia-de-vendas',
        search: { id: r.id },
      })
  }

  async function matricular(vendaIds?: string[]) {
    if (!atual) return
    const r = await executar(() =>
      matricularConferenciaFn({
        data: { conferenciaId: atual.resumo.id, vendaIds },
      }),
    )
    if (!r) return
    if (r.matriculadas > 0) {
      toast.success(
        r.matriculadas === 1
          ? '1 matrícula feita.'
          : `${r.matriculadas} matrículas feitas.`,
      )
    }
    for (const f of r.falhas) toast.error(`Venda ${f.vendaId}: ${f.motivo}`)
  }

  const comTurma =
    atual?.pendentes.filter((p) => p.situacao === 'pendente') ?? []

  const colunasDasPendentes: ColunaDaTabela<Pendente>[] = [
    {
      rotulo: 'Venda',
      essencial: true,
      celula: (p) => <span className="tabular-nums">{p.vendaId}</span>,
    },
    {
      rotulo: 'Aluno',
      essencial: true,
      className: 'md:min-w-52',
      celula: (p) => (
        <>
          <div>{p.nome || 'Sem nome'}</div>
          <div className="text-muted-foreground [overflow-wrap:anywhere]">
            {p.email}
          </div>
        </>
      ),
    },
    {
      rotulo: 'Produto',
      essencial: true,
      className: 'md:min-w-48',
      celula: (p) => (
        <>
          {p.produtoNome || (p.produtoId ? `Produto ${p.produtoId}` : '—')}
          {p.ofertaHash && (
            <div className="text-muted-foreground">oferta {p.ofertaHash}</div>
          )}
        </>
      ),
    },
    {
      rotulo: 'Situação',
      essencial: true,
      className: 'md:min-w-40',
      celula: (p) => (
        <>
          <EtiquetaDeEstado {...ESTADO_DA_VENDA_CONFERIDA[p.situacao]} />
          {p.motivo && (
            <div className="mt-1 max-w-64 text-xs text-muted-foreground">
              {p.motivo}
            </div>
          )}
        </>
      ),
    },
    {
      rotulo: 'Ações',
      rotuloOculto: true,
      essencial: true,
      celula: (p) =>
        p.situacao !== 'aplicada' ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={ocupado}
            className="toque:min-h-11"
            aria-label={`Matricular ${p.email}`}
            onClick={() => matricular([p.vendaId])}
          >
            Matricular
          </Button>
        ) : null,
    },
  ]

  const colunasDoHistorico: ColunaDaTabela<Conferencia>[] = [
    {
      rotulo: 'Data',
      essencial: true,
      className: 'whitespace-nowrap',
      celula: (c) => (
        <span className="tabular-nums">{dataHora(c.criadoEm)}</span>
      ),
    },
    { rotulo: 'Quem subiu', celula: (c) => c.autorNome ?? '—' },
    {
      rotulo: 'Arquivo',
      essencial: true,
      celula: (c) => (
        <span className="[overflow-wrap:anywhere]">{c.arquivoNome}</span>
      ),
    },
    { rotulo: 'Pagas', numero: true, celula: (c) => c.totalPagas },
    {
      rotulo: 'Sem matrícula',
      numero: true,
      essencial: true,
      celula: (c) => c.totalSemMatricula,
    },
    {
      rotulo: 'Matriculadas',
      numero: true,
      essencial: true,
      celula: (c) => c.totalAplicadas,
    },
    {
      rotulo: 'Abrir',
      rotuloOculto: true,
      essencial: true,
      celula: (c) => (
        <Link
          to="/painel/conferencia-de-vendas"
          search={{ id: c.id }}
          aria-label={`Abrir a conferência de ${c.arquivoNome}, de ${dataHora(c.criadoEm)}`}
          className="inline-flex min-h-6 items-center underline underline-offset-4 toque:min-h-11"
        >
          Abrir
        </Link>
      ),
    },
  ]

  return (
    <PaginaDoPainel largura="larga">
      <CabecalhoDaPagina
        titulo="Conferência de vendas"
        contexto="Suba a planilha exportada da Voomp (CSV ou XLSX): o sistema lista as vendas pagas que ainda não viraram matrícula, e você matricula com um clique."
      />
      <p className="max-w-prose text-sm text-muted-foreground">
        A venda de produto sem turma ligada espera a ligação, em{' '}
        <Link
          to="/painel/vendas/produtos"
          className="underline underline-offset-4"
        >
          Vendas, aba Produtos
        </Link>
        .
      </p>

      <Card>
        <CardHeader>
          <h2 className="text-base leading-snug font-semibold">
            Subir a planilha
          </h2>
        </CardHeader>
        <CardContent>
          <form
            noValidate
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault()
              void conferir()
            }}
          >
            <CampoDoPainel
              rotulo="Planilha da Voomp (CSV ou XLSX)"
              erro={erros.planilha}
            >
              <Input
                id="planilha"
                type="file"
                accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                onChange={(e) => setArquivo(e.target.files?.[0] ?? null)}
              />
            </CampoDoPainel>
            <details className="text-sm">
              <summary className="cursor-pointer py-2 text-muted-foreground">
                Colunas da planilha (só se o nome for diferente do padrão)
              </summary>
              <p className="mt-2 text-muted-foreground">
                Escreva o nome exato da coluna no cabeçalho da planilha. Em
                branco, o sistema procura nomes comuns, como “ID da venda”,
                “E-mail” e “Produto”. Sem coluna de status, toda linha conta
                como paga.
              </p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {CAMPOS.map((campo) => (
                  <CampoDoPainel
                    key={campo}
                    rotulo={`Coluna: ${ROTULO_DO_CAMPO[campo]}`}
                  >
                    <Input
                      id={`coluna-${campo}`}
                      autoComplete="off"
                      spellCheck={false}
                      value={colunas[campo] ?? ''}
                      onChange={(e) =>
                        setColunas((c) => ({ ...c, [campo]: e.target.value }))
                      }
                    />
                  </CampoDoPainel>
                ))}
              </div>
            </details>
            <AcoesDoFormulario
              salvar="Conferir planilha"
              ocupado={ocupado}
              erros={erros}
            />
          </form>
        </CardContent>
      </Card>

      {atual && (
        <Card>
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-4">
            <h2 className="min-w-0 text-base leading-snug font-semibold break-words">
              {atual.resumo.arquivoNome} ·{' '}
              <span className="tabular-nums">
                {dataHora(atual.resumo.criadoEm)}
              </span>
            </h2>
            <Button
              type="button"
              disabled={ocupado || comTurma.length === 0}
              className="toque:min-h-11"
              onClick={() => matricular()}
            >
              Matricular todas ({comTurma.length})
            </Button>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <p className="text-sm text-muted-foreground">
              {atual.resumo.totalLinhas} linhas, {atual.resumo.totalPagas}{' '}
              vendas pagas, {atual.resumo.totalMatriculadas} já matriculadas,{' '}
              {atual.resumo.totalSemMatricula} sem matrícula,{' '}
              {atual.resumo.totalSemTurma} sem turma ligada,{' '}
              {atual.resumo.totalAplicadas} matriculadas agora.
            </p>
            <TabelaDoPainel
              rotulo="Vendas pagas sem matrícula"
              colunas={colunasDasPendentes}
              linhas={atual.pendentes}
              chave={(p) => p.vendaId}
              testIdDaLinha={(p) => `venda-${p.vendaId}`}
              vazio={
                <VazioDoPainel mensagem="Nenhuma venda paga sem matrícula. Tudo em dia." />
              }
            />
          </CardContent>
        </Card>
      )}

      <section aria-labelledby="anteriores" className="flex flex-col gap-4">
        <h2
          id="anteriores"
          tabIndex={-1}
          className="text-base font-semibold outline-none"
        >
          Conferências anteriores
        </h2>
        <TabelaDoPainel
          rotulo="Conferências anteriores"
          colunas={colunasDoHistorico}
          linhas={historico.itens}
          chave={(c) => c.id}
          testIdDaLinha={(c) => `conferencia-${c.id}`}
          vazio={
            <VazioDoPainel
              titulo="Nenhuma conferência ainda"
              mensagem="Suba a primeira planilha da Voomp acima; ela fica guardada aqui para consulta."
            />
          }
        />
      </section>
      <Paginacao
        pagina={historico.pagina}
        totalDePaginas={historico.totalDePaginas}
        inicio="anteriores"
      />
    </PaginaDoPainel>
  )
}
