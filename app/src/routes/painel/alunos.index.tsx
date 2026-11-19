import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { VazioDoPainel } from '#/components/painel/estados'
import { EtiquetaDeEstado } from '#/components/painel/etiqueta-de-estado'
import { CabecalhoDaPagina, PaginaDoPainel } from '#/components/painel/pagina'
import { Paginacao } from '#/components/painel/paginacao'
import { type ColunaDaTabela, TabelaDoPainel } from '#/components/painel/tabela'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { alunosFn } from '#/lib/matricula-fns'
import { paginaDaBusca } from '#/lib/pagina-da-busca'
import { ESTADO_DA_MATRICULA } from '#/regras/estados-do-aluno'

export const Route = createFileRoute('/painel/alunos/')({
  validateSearch: (
    s: Record<string, unknown>,
  ): { q?: string; pagina?: number } => ({
    q: typeof s.q === 'string' && s.q ? s.q : undefined,
    pagina: paginaDaBusca(s.pagina),
  }),
  loaderDeps: ({ search }) => ({ q: search.q, pagina: search.pagina }),
  loader: ({ deps }) =>
    alunosFn({ data: { termo: deps.q, pagina: deps.pagina } }),
  head: () => ({ meta: [{ title: 'Alunos · Estúdio' }] }),
  component: Alunos,
})

type Aluno = Awaited<ReturnType<typeof alunosFn>>['itens'][number]

const colunas: ColunaDaTabela<Aluno>[] = [
  {
    rotulo: 'Aluno',
    essencial: true,
    className: 'md:min-w-64',
    celula: (a) => (
      <Link
        to="/painel/alunos/$alunoId"
        params={{ alunoId: a.id }}
        className="block no-underline hover:underline"
      >
        <span className="block font-medium">{a.nome || 'Sem nome'}</span>
        <span className="block text-muted-foreground [overflow-wrap:anywhere]">
          {a.email}
        </span>
      </Link>
    ),
  },
  {
    rotulo: 'Matrículas',
    essencial: true,
    className: 'md:min-w-64',
    celula: (a) =>
      a.matriculas.length === 0 ? (
        <EtiquetaDeEstado>Sem matrícula</EtiquetaDeEstado>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {a.matriculas.map((m) => (
            <li
              key={m.cursoNome}
              className="flex flex-wrap items-center gap-x-2 gap-y-1"
            >
              <EtiquetaDeEstado {...ESTADO_DA_MATRICULA[m.situacao]} />
              <span>{m.cursoNome}</span>
            </li>
          ))}
        </ul>
      ),
  },
]

function Alunos() {
  const alunos = Route.useLoaderData()
  const { q } = Route.useSearch()
  const navegar = useNavigate()
  const [termo, setTermo] = useState(q ?? '')

  return (
    <PaginaDoPainel largura="larga">
      <CabecalhoDaPagina
        titulo="Alunos"
        contexto="Abra o perfil de um aluno para prorrogar, encerrar ou reativar uma matrícula e para trocar o e-mail."
      />
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          navegar({
            to: '/painel/alunos',
            search: { q: termo.trim() || undefined },
          })
        }}
      >
        <Input
          type="search"
          autoComplete="off"
          spellCheck={false}
          value={termo}
          onChange={(e) => setTermo(e.target.value)}
          placeholder="Buscar por nome ou e-mail"
          aria-label="Buscar aluno"
        />
        <Button type="submit" className="toque:min-h-11">
          Buscar
        </Button>
      </form>
      <h2 id="lista-de-alunos" tabIndex={-1} className="sr-only">
        Lista de alunos
      </h2>
      <TabelaDoPainel
        rotulo="Alunos"
        linhas={alunos.itens}
        chave={(a) => a.id}
        colunas={colunas}
        vazio={
          q ? (
            <VazioDoPainel
              mensagem={`Nenhum aluno com “${q}”. Confira a grafia ou busque só por parte do e-mail.`}
              acao={
                <Button asChild variant="outline">
                  <Link to="/painel/alunos" search={{}}>
                    Limpar a busca
                  </Link>
                </Button>
              }
            />
          ) : (
            <VazioDoPainel
              mensagem="Ainda não há alunos. Eles aparecem quando uma venda é paga ou quando você os matricula."
              acao={
                <Button asChild variant="outline">
                  <Link to="/painel/matricular">Matricular alunos</Link>
                </Button>
              }
            />
          )
        }
      />
      <Paginacao
        pagina={alunos.pagina}
        totalDePaginas={alunos.totalDePaginas}
        inicio="lista-de-alunos"
      />
    </PaginaDoPainel>
  )
}
