import { Link, useNavigate } from '@tanstack/react-router'
import { useId } from 'react'
import { BarraDeFiltros } from '#/components/painel/barra-de-filtros'
import { VazioDoPainel } from '#/components/painel/estados'
import { Paginacao } from '#/components/painel/paginacao'
import { dataHora, duracao } from '#/components/painel/relatorios/comuns'
import { TabelaDoPainel } from '#/components/painel/tabela'
import { Button } from '#/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '#/components/ui/card'
import { Input } from '#/components/ui/input'
import { Label } from '#/components/ui/label'
import { Progress } from '#/components/ui/progress'
import { deslocamento, POR_PAGINA } from '#/regras/paginacao'
import {
  FAIXAS_DE_PROGRESSO,
  type ProgressoDosAlunos,
} from '#/regras/relatorios'

export function ProgressoView({
  progresso,
  faixa,
  sumiuHaDias,
  pagina,
  aoFiltrar,
}: {
  progresso: ProgressoDosAlunos
  faixa?: string
  sumiuHaDias?: number
  pagina: number
  aoFiltrar: (novos: { faixa?: string; sumiuHaDias?: number }) => void
}) {
  const maior = Math.max(1, ...progresso.faixas.map((f) => f.total))
  const totalDePaginas = Math.max(
    1,
    Math.ceil(progresso.alunos.length / POR_PAGINA),
  )
  const paginaAtual = Math.min(pagina, totalDePaginas)
  const dessaPagina = progresso.alunos.slice(
    deslocamento(paginaAtual),
    deslocamento(paginaAtual) + POR_PAGINA,
  )
  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Faixas de progresso · {progresso.cursoNome}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {progresso.faixas.map((f) => (
            <button
              type="button"
              key={f.faixa}
              className="flex items-center gap-3 rounded-md px-2 py-1 text-left text-sm hover:bg-accent aria-pressed:bg-accent toque:min-h-11"
              aria-pressed={faixa === f.faixa}
              onClick={() =>
                aoFiltrar({
                  faixa: faixa === f.faixa ? undefined : f.faixa,
                  sumiuHaDias,
                })
              }
            >
              <span className="w-28 shrink-0">{f.rotulo}</span>
              <Progress
                value={(f.total * 100) / maior}
                aria-label={`Alunos na faixa ${f.rotulo}: ${f.total}`}
                className="h-2"
              />
              <span className="w-8 shrink-0 text-right tabular-nums">
                {f.total}
              </span>
            </button>
          ))}
        </CardContent>
      </Card>

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
        <CampoDeDias sumiuHaDias={sumiuHaDias} />
        <BarraDeFiltros
          rotulo="Filtrar por faixa"
          valores={{ faixa }}
          filtros={[
            {
              chave: 'faixa',
              rotulo: 'Faixa',
              opcoes: FAIXAS_DE_PROGRESSO.map((f) => ({
                valor: f.faixa,
                rotulo: f.rotulo,
              })),
              todas: 'Todas as faixas',
            },
          ]}
        />
      </div>

      <h2 id="alunos-do-progresso" tabIndex={-1} className="sr-only">
        Alunos do curso
      </h2>
      <TabelaDoPainel
        rotulo="Progresso dos alunos"
        linhas={dessaPagina}
        chave={(a) => a.userId}
        vazio={
          <VazioDoPainel
            mensagem="Nenhum aluno com matrícula ativa neste filtro."
            acao={
              faixa || sumiuHaDias ? (
                <Button
                  type="button"
                  variant="outline"
                  className="toque:min-h-11"
                  onClick={() => aoFiltrar({})}
                >
                  Limpar filtros
                </Button>
              ) : undefined
            }
          />
        }
        colunas={[
          {
            rotulo: 'Aluno',
            essencial: true,
            className: 'min-w-48',
            celula: (a) => (
              <>
                <Link
                  to="/painel/alunos/$alunoId"
                  params={{ alunoId: a.userId }}
                  className="font-medium"
                >
                  {a.nome}
                </Link>
                <span className="block text-xs text-muted-foreground [overflow-wrap:anywhere]">
                  {a.email}
                </span>
              </>
            ),
          },
          {
            rotulo: 'Progresso',
            essencial: true,
            className: 'min-w-44',
            celula: (a) => (
              <>
                <div className="flex items-center gap-2">
                  <Progress
                    value={a.percentual}
                    aria-label={`Progresso de ${a.nome}`}
                    className="h-2"
                  />
                  <span className="w-10 text-right text-sm tabular-nums">
                    {a.percentual}%
                  </span>
                </div>
                <span className="text-xs text-muted-foreground">
                  {a.aulasConcluidas} de {a.totalDeAulas} aulas
                </span>
              </>
            ),
          },
          {
            rotulo: 'Último acesso',
            essencial: true,
            celula: (a) =>
              a.ultimoAcessoEm ? (
                dataHora(a.ultimoAcessoEm)
              ) : (
                <span className="text-muted-foreground">Nunca acessou</span>
              ),
          },
          {
            rotulo: 'Vídeo tocando',
            numero: true,
            essencial: true,
            celula: (a) => duracao(a.tempoDeVideo),
          },
          {
            rotulo: 'Pontos',
            numero: true,
            essencial: true,
            celula: (a) => a.pontos ?? '—',
          },
        ]}
      />
      <Paginacao
        pagina={paginaAtual}
        totalDePaginas={totalDePaginas}
        inicio="alunos-do-progresso"
      />
    </div>
  )
}

// Dias sem acessar: número livre, então aplica ao sair do campo ou com Enter (não a cada tecla).
function CampoDeDias({ sumiuHaDias }: { sumiuHaDias?: number }) {
  const id = useId()
  const navegar = useNavigate()
  function aplicar(valor: string) {
    const dias = Number(valor)
    const novo = Number.isInteger(dias) && dias > 0 ? dias : undefined
    if (novo === sumiuHaDias) return
    navegar({
      to: '.',
      search: ((atual: Record<string, unknown>) => ({
        ...atual,
        sumiuHaDias: novo,
        pagina: undefined,
      })) as never,
      replace: true,
      resetScroll: false,
    })
  }
  return (
    <div className="flex min-w-0 flex-col gap-1.5 sm:w-52">
      <Label htmlFor={id}>Sem acessar há (dias)</Label>
      <Input
        id={id}
        type="number"
        inputMode="numeric"
        min={1}
        placeholder="Ex.: 14"
        defaultValue={sumiuHaDias ?? ''}
        key={`dias-${sumiuHaDias}`}
        onBlur={(e) => aplicar(e.currentTarget.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') aplicar(e.currentTarget.value)
        }}
        className="toque:h-11"
      />
    </div>
  )
}
