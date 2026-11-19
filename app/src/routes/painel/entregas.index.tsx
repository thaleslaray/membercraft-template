import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { TabelaDeEntregas } from '#/components/painel/entrega'
import { VazioDoPainel } from '#/components/painel/estados'
import { CabecalhoDaPagina, PaginaDoPainel } from '#/components/painel/pagina'
import { Paginacao } from '#/components/painel/paginacao'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { Label } from '#/components/ui/label'
import { SelectNativo } from '#/components/ui/select-nativo'
import { entregasFn, opcoesDeEntregasFn } from '#/lib/entregas-fns'
import { paginaDaBusca } from '#/lib/pagina-da-busca'
import {
  ESTADO_DA_ENTREGA,
  ESTADOS_DA_ENTREGA,
  estadoDaEntregaValido,
} from '#/regras/entregas-do-painel'
import type { EstadoDaTentativa } from '#/regras/quiz'

type Busca = {
  curso?: string
  exercicio?: string
  turma?: string
  aluno?: string
  estado?: EstadoDaTentativa
  pagina?: number
}

const texto = (v: unknown) => (typeof v === 'string' && v ? v : undefined)

export const Route = createFileRoute('/painel/entregas/')({
  validateSearch: (s: Record<string, unknown>): Busca => ({
    curso: texto(s.curso),
    exercicio: texto(s.exercicio),
    turma: texto(s.turma),
    aluno: texto(s.aluno),
    estado: estadoDaEntregaValido(s.estado),
    pagina: paginaDaBusca(s.pagina),
  }),
  loaderDeps: ({ search }) => search,
  loader: async ({ deps }) => {
    const [entregas, opcoes] = await Promise.all([
      entregasFn({
        data: {
          cursoId: deps.curso,
          quizId: deps.exercicio,
          turmaId: deps.turma,
          aluno: deps.aluno,
          estado: deps.estado,
          pagina: deps.pagina,
        },
      }),
      opcoesDeEntregasFn(),
    ])
    return { entregas, opcoes }
  },
  head: () => ({ meta: [{ title: 'Entregas · Estúdio' }] }),
  component: Entregas,
})

function Entregas() {
  const { entregas, opcoes } = Route.useLoaderData()
  const busca = Route.useSearch()
  const navegar = useNavigate({ from: '/painel/entregas/' })
  const [aluno, setAluno] = useState(busca.aluno ?? '')

  const exercicios = busca.curso
    ? opcoes.exercicios.filter((x) => x.cursoId === busca.curso)
    : opcoes.exercicios
  const turmas = busca.curso
    ? opcoes.turmas.filter((t) => t.cursoId === busca.curso)
    : opcoes.turmas
  const filtrando = Boolean(
    busca.curso ||
      busca.exercicio ||
      busca.turma ||
      busca.aluno ||
      busca.estado,
  )
  const mudar = (parcial: Partial<Busca>) =>
    navegar({ search: { ...busca, ...parcial, pagina: undefined } })

  return (
    <PaginaDoPainel largura="larga">
      <CabecalhoDaPagina
        titulo="Entregas"
        contexto="Tudo o que as alunas responderam nos exercícios, das mais recentes para as mais antigas. Abra uma entrega para ver cada resposta."
      />
      <form
        aria-label="Filtros das entregas"
        className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
        onSubmit={(e) => {
          e.preventDefault()
          mudar({ aluno: aluno.trim() || undefined })
        }}
      >
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="filtro-aluno">Aluna</Label>
          <div className="flex gap-2">
            <Input
              id="filtro-aluno"
              type="search"
              autoComplete="off"
              spellCheck={false}
              value={aluno}
              onChange={(e) => setAluno(e.target.value)}
              placeholder="Nome ou e-mail"
            />
            <Button type="submit" className="toque:min-h-11">
              Buscar
            </Button>
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="filtro-curso">Curso</Label>
          <SelectNativo
            id="filtro-curso"
            value={busca.curso ?? ''}
            onChange={(e) =>
              // Trocar o curso solta o exercício e a turma, que podem ser de outro curso.
              mudar({
                curso: e.target.value || undefined,
                exercicio: undefined,
                turma: undefined,
              })
            }
          >
            <option value="">Todos os cursos</option>
            {opcoes.cursos.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </SelectNativo>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="filtro-exercicio">Exercício</Label>
          <SelectNativo
            id="filtro-exercicio"
            value={busca.exercicio ?? ''}
            onChange={(e) => mudar({ exercicio: e.target.value || undefined })}
          >
            <option value="">Todos os exercícios</option>
            {exercicios.map((x) => (
              <option key={x.id} value={x.id}>
                {x.titulo}
              </option>
            ))}
          </SelectNativo>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="filtro-turma">Turma</Label>
          <SelectNativo
            id="filtro-turma"
            value={busca.turma ?? ''}
            onChange={(e) => mudar({ turma: e.target.value || undefined })}
          >
            <option value="">Todas as turmas</option>
            {turmas.map((t) => (
              <option key={t.id} value={t.id}>
                {t.nome}
              </option>
            ))}
          </SelectNativo>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="filtro-estado">Estado</Label>
          <SelectNativo
            id="filtro-estado"
            value={busca.estado ?? ''}
            onChange={(e) =>
              mudar({ estado: estadoDaEntregaValido(e.target.value) })
            }
          >
            <option value="">Todos os estados</option>
            {ESTADOS_DA_ENTREGA.map((e) => (
              <option key={e} value={e}>
                {ESTADO_DA_ENTREGA[e].rotulo}
              </option>
            ))}
          </SelectNativo>
        </div>
      </form>
      <h2 id="lista-de-entregas" tabIndex={-1} className="sr-only">
        Lista de entregas
      </h2>
      <p className="text-sm text-muted-foreground" aria-live="polite">
        {entregas.total} {entregas.total === 1 ? 'entrega' : 'entregas'}
      </p>
      <TabelaDeEntregas
        linhas={entregas.itens}
        vazio={
          filtrando ? (
            <VazioDoPainel
              mensagem="Nenhuma entrega com esses filtros. Tire um filtro ou confira a grafia do nome."
              acao={
                <Button asChild variant="outline">
                  <Link to="/painel/entregas" search={{}}>
                    Limpar os filtros
                  </Link>
                </Button>
              }
            />
          ) : (
            <VazioDoPainel mensagem="Ainda não há entregas. Elas aparecem quando uma aluna envia um exercício." />
          )
        }
      />
      <Paginacao
        pagina={entregas.pagina}
        totalDePaginas={entregas.totalDePaginas}
        inicio="lista-de-entregas"
      />
    </PaginaDoPainel>
  )
}
