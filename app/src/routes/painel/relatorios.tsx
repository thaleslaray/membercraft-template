import { createFileRoute } from '@tanstack/react-router'
import { AbasDoPainel } from '#/components/painel/abas'
import { VazioDoPainel } from '#/components/painel/estados'
import { CabecalhoDaPagina, PaginaDoPainel } from '#/components/painel/pagina'
import {
  BotaoDeCsv,
  FiltroDePeriodoECurso,
  type Filtros,
} from '#/components/painel/relatorios/comuns'
import { PanoramaView } from '#/components/painel/relatorios/panorama'
import { ProgressoView } from '#/components/painel/relatorios/progresso'
import { QuizzesView } from '#/components/painel/relatorios/quizzes'
import { SatisfacaoView } from '#/components/painel/relatorios/satisfacao'
import { paginaDaBusca } from '#/lib/pagina-da-busca'
import {
  panoramaFn,
  progressoDosAlunosFn,
  quizzesFn,
  satisfacaoFn,
} from '#/lib/relatorios-fns'

const ABAS = [
  { id: 'panorama', rotulo: 'Panorama' },
  { id: 'progresso', rotulo: 'Progresso dos alunos' },
  { id: 'satisfacao', rotulo: 'Satisfação' },
  { id: 'quizzes', rotulo: 'Exercícios' },
] as const
type Aba = (typeof ABAS)[number]['id']

interface Busca extends Filtros {
  aba?: Aba
  sumiuHaDias?: number
  faixa?: string
  pagina?: number
}

const texto = (v: unknown) => (typeof v === 'string' && v ? v : undefined)

// Relatórios da equipe. Período em horário de Brasília; o CSV é só do Proprietário.
export const Route = createFileRoute('/painel/relatorios')({
  validateSearch: (s: Record<string, unknown>): Busca => {
    const dias = Number(s.sumiuHaDias)
    return {
      // O Panorama é a aba sem `aba` na URL.
      aba:
        s.aba !== 'panorama' && ABAS.some((a) => a.id === s.aba)
          ? (s.aba as Aba)
          : undefined,
      de: texto(s.de),
      ate: texto(s.ate),
      cursoId: texto(s.cursoId),
      sumiuHaDias: Number.isInteger(dias) && dias > 0 ? dias : undefined,
      faixa: texto(s.faixa),
      pagina: paginaDaBusca(s.pagina),
    }
  },
  // A página só fatia a lista que já veio: trocar de página não busca de novo.
  loaderDeps: ({ search: { pagina: _pagina, ...resto } }) => resto,
  loader: async ({ deps }) => {
    const filtros = { de: deps.de, ate: deps.ate, cursoId: deps.cursoId }
    switch (deps.aba ?? 'panorama') {
      case 'progresso':
        return {
          aba: 'progresso' as const,
          dados: await progressoDosAlunosFn({
            data: {
              cursoId: deps.cursoId,
              sumiuHaDias: deps.sumiuHaDias,
              faixa: deps.faixa as
                | '0'
                | '1-25'
                | '26-50'
                | '51-75'
                | '76-99'
                | '100'
                | undefined,
            },
          }),
        }
      case 'satisfacao':
        return {
          aba: 'satisfacao' as const,
          dados: await satisfacaoFn({ data: filtros }),
        }
      case 'quizzes':
        return {
          aba: 'quizzes' as const,
          dados: await quizzesFn({ data: filtros }),
        }
      default:
        return {
          aba: 'panorama' as const,
          dados: await panoramaFn({ data: filtros }),
        }
    }
  },
  head: () => ({ meta: [{ title: 'Relatórios · Estúdio' }] }),
  component: Relatorios,
})

function Relatorios() {
  const carregado = Route.useLoaderData()
  const busca = Route.useSearch()
  const navigate = Route.useNavigate()

  const filtrar = (novos: Busca) =>
    navigate({ search: { aba: busca.aba, ...novos } })

  return (
    <PaginaDoPainel largura="larga">
      <CabecalhoDaPagina
        titulo="Relatórios"
        contexto="Acompanhe a área e os alunos. Datas no horário de Brasília."
      />

      <AbasDoPainel
        rotulo="Relatórios"
        abas={ABAS.map((a) => ({
          rotulo: a.rotulo,
          para: '/painel/relatorios',
          search: { aba: a.id === 'panorama' ? undefined : a.id },
          exata: true,
        }))}
      />

      {carregado.aba === 'panorama' && (
        <>
          <Barra
            filtros={
              <FiltroDePeriodoECurso
                periodo={carregado.dados.panorama.periodo}
                cursos={carregado.dados.cursos}
                filtros={busca}
              />
            }
            csv={
              carregado.dados.podeExportar && (
                <BotaoDeCsv
                  tipo="panorama"
                  params={{
                    de: busca.de,
                    ate: busca.ate,
                    cursoId: busca.cursoId,
                  }}
                />
              )
            }
          />
          <PanoramaView panorama={carregado.dados.panorama} />
        </>
      )}

      {carregado.aba === 'progresso' && (
        <>
          <Barra
            filtros={
              <FiltroDePeriodoECurso
                cursos={carregado.dados.cursos}
                filtros={{ cursoId: carregado.dados.cursoId ?? undefined }}
                semPeriodo
                semTodosOsCursos
              />
            }
            csv={
              carregado.dados.podeExportar &&
              carregado.dados.cursoId && (
                <>
                  <BotaoDeCsv
                    tipo="progresso"
                    params={{
                      cursoId: carregado.dados.cursoId,
                      sumiuHaDias: busca.sumiuHaDias,
                      faixa: busca.faixa,
                    }}
                  />
                  <BotaoDeCsv
                    tipo="ranking"
                    rotulo="Exportar ranking do curso"
                    params={{ cursoId: carregado.dados.cursoId }}
                  />
                  <BotaoDeCsv tipo="ranking" rotulo="Exportar ranking geral" />
                </>
              )
            }
          />
          {carregado.dados.progresso ? (
            <ProgressoView
              progresso={carregado.dados.progresso}
              faixa={busca.faixa}
              sumiuHaDias={busca.sumiuHaDias}
              pagina={busca.pagina ?? 1}
              aoFiltrar={(f) =>
                filtrar({ cursoId: carregado.dados.cursoId ?? undefined, ...f })
              }
            />
          ) : (
            <VazioDoPainel mensagem="Nenhum curso cadastrado. Crie um curso para acompanhar o progresso dos alunos." />
          )}
        </>
      )}

      {carregado.aba === 'satisfacao' && (
        <>
          <Barra
            filtros={
              <FiltroDePeriodoECurso
                periodo={carregado.dados.relatorio.periodo}
                cursos={carregado.dados.cursos}
                filtros={busca}
              />
            }
            csv={
              carregado.dados.podeExportar && (
                <BotaoDeCsv
                  tipo="satisfacao"
                  params={{
                    de: busca.de,
                    ate: busca.ate,
                    cursoId: busca.cursoId,
                  }}
                />
              )
            }
          />
          <SatisfacaoView relatorio={carregado.dados.relatorio} />
        </>
      )}

      {carregado.aba === 'quizzes' && (
        <>
          <Barra
            filtros={
              <FiltroDePeriodoECurso
                periodo={carregado.dados.relatorio.periodo}
                cursos={carregado.dados.cursos}
                filtros={busca}
              />
            }
            csv={
              carregado.dados.podeExportar && (
                <div className="flex gap-2">
                  <BotaoDeCsv
                    tipo="quizzes"
                    params={{
                      de: busca.de,
                      ate: busca.ate,
                      cursoId: busca.cursoId,
                    }}
                  />
                  <BotaoDeCsv
                    tipo="respostas-de-quiz"
                    rotulo="Exportar respostas"
                    params={{
                      de: busca.de,
                      ate: busca.ate,
                      cursoId: busca.cursoId,
                    }}
                  />
                </div>
              )
            }
          />
          <QuizzesView relatorio={carregado.dados.relatorio} />
        </>
      )}
    </PaginaDoPainel>
  )
}

function Barra({
  filtros,
  csv,
}: {
  filtros: React.ReactNode
  csv: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-end md:justify-between">
      {filtros}
      <div className="flex flex-wrap gap-2">{csv}</div>
    </div>
  )
}
