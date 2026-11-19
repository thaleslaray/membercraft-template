import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Award, Check, Circle } from 'lucide-react'
import { caminhoDoCertificadoFn } from '#/lib/certificados-fns'
import { cn } from '#/lib/utils'
import {
  PONTOS_DA_AULA,
  PONTOS_DA_AVALIACAO,
  PONTOS_DO_COMENTARIO,
} from '#/regras/pontos'

const numero = (n: number) => n.toLocaleString('pt-BR')

/** Marcador no texto da aula que vira o painel (o editor grava como parágrafo). */
export const MARCADOR_DO_CAMINHO = '[caminho-do-certificado]'

// O título dos exercícios vem como "A103 - [EXERCÍCIO] Elaborar cronograma"; o código e o nome
// ficam separados, e a etiqueta ("Exercício"/"Desafio") vira texto miúdo.
function partesDoTitulo(titulo: string) {
  const m = /^\s*([A-Z]?\d+)\s*[-–—]\s*(?:\[\s*([^\]]+)\]\s*)?(.*)$/.exec(
    titulo,
  )
  if (!m) return { codigo: '', etiqueta: '', nome: titulo }
  const etiqueta = (m[2] ?? '').toLowerCase()
  return {
    codigo: m[1],
    etiqueta: etiqueta.charAt(0).toUpperCase() + etiqueta.slice(1),
    nome: m[3] || titulo,
  }
}

/**
 * "Caminho do certificado": o saldo de pontos da aluna no curso contra o mínimo, os exercícios do
 * curso em sequência, por módulo (só o opcional é marcado) e quanto vale cada ação. Lê os
 * dados ao vivo; some quando o curso não tem certificado com exigência.
 */
export function CaminhoDoCertificado({
  cursoId,
  className,
}: {
  cursoId: string
  className?: string
}) {
  const { data } = useQuery({
    queryKey: ['caminho-do-certificado', cursoId],
    queryFn: () => caminhoDoCertificadoFn({ data: { cursoId } }),
    staleTime: 30_000,
  })
  if (!data) return null
  const obrigatorios = data.exercicios.filter((e) => e.obrigatorio)
  const naLista = data.exercicios.filter((e) => e.obrigatorio || e.pontos > 0)
  const feitos = obrigatorios.filter((e) => e.aprovado).length
  const pct =
    data.pontosMinimos > 0
      ? Math.min(100, Math.floor((data.pontos / data.pontosMinimos) * 100))
      : 0
  const pronto =
    feitos === obrigatorios.length && data.pontos >= data.pontosMinimos

  return (
    <section
      aria-label="Caminho do certificado"
      className={cn(
        'grid gap-6 rounded-(--radius-card) border bg-card p-5 text-card-foreground shadow-(--shadow-card) sm:p-6',
        className,
      )}
    >
      <header className="flex items-start gap-3">
        <Award
          className="mt-0.5 size-5 shrink-0 text-brand"
          aria-hidden="true"
        />
        <div className="grid gap-1">
          <h2 className="font-display text-xl leading-tight tracking-[-0.01em]">
            Caminho do certificado
          </h2>
          <p className="text-sm text-muted-foreground">
            {pronto
              ? 'Você cumpriu tudo. O certificado sai na página do curso.'
              : 'Faça os exercícios obrigatórios e junte os pontos para receber o certificado.'}
          </p>
        </div>
      </header>

      {data.pontosMinimos > 0 && (
        <div className="grid gap-2">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-sm font-medium">Seus pontos neste curso</span>
            <span className="shrink-0 whitespace-nowrap text-sm tabular-nums text-muted-foreground">
              <strong className="font-semibold text-foreground">
                {numero(data.pontos)}
              </strong>{' '}
              de {numero(data.pontosMinimos)}
            </span>
          </div>
          <div
            role="progressbar"
            aria-label="Pontos para o certificado"
            aria-valuenow={data.pontos}
            aria-valuemin={0}
            aria-valuemax={data.pontosMinimos}
            className="h-2 overflow-hidden rounded-full bg-muted"
          >
            <div
              className="h-full rounded-full bg-brand transition-[width] motion-reduce:transition-none"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      )}

      {/* Uma lista só, na ordem do curso, com o nome do módulo abrindo cada grupo. O obrigatório é o
          padrão e não leva marca; só o opcional é dito, em texto, ao lado do nome. Opcional que não
          vale pontos (uma pesquisa, por exemplo) fica de fora: não muda nada no certificado. */}
      {naLista.length > 0 && (
        <div className="grid gap-4">
          <div className="grid gap-1">
            <h3 className="flex items-baseline justify-between gap-3 text-sm font-semibold">
              Exercícios do curso
              {obrigatorios.length > 0 && (
                <span className="font-normal tabular-nums text-muted-foreground">
                  {feitos} de {obrigatorios.length} obrigatórios
                </span>
              )}
            </h3>
            {naLista.some((e) => !e.obrigatorio) && (
              <p className="text-sm text-muted-foreground">
                Os marcados como opcional só somam pontos.
              </p>
            )}
          </div>
          {porModulo(naLista).map((g) => (
            <div key={g.modulo} className="grid gap-1">
              <h4 className="text-xs font-semibold text-muted-foreground">
                {g.modulo}
              </h4>
              <ListaDeExercicios exercicios={g.exercicios} />
            </div>
          ))}
        </div>
      )}

      <div className="grid gap-2 border-t pt-5">
        <h3 className="text-sm font-semibold">
          Outras formas de ganhar pontos
        </h3>
        <ul className="grid gap-1.5 text-sm text-muted-foreground">
          <Acao rotulo="Concluir uma aula" pontos={PONTOS_DA_AULA} />
          <Acao
            rotulo="Comentar numa aula (uma vez por aula)"
            pontos={PONTOS_DO_COMENTARIO}
          />
          <Acao rotulo="Avaliar uma aula" pontos={PONTOS_DA_AVALIACAO} />
        </ul>
        {data.exigeTodasAsAulas && (
          <p className="text-sm text-muted-foreground">
            Também é preciso concluir todas as aulas do curso.
          </p>
        )}
      </div>
    </section>
  )
}

/** Agrupa em sequência pelo módulo, mantendo a ordem do curso. */
function porModulo<E extends { modulo: string }>(exercicios: E[]) {
  const grupos: { modulo: string; exercicios: E[] }[] = []
  for (const e of exercicios) {
    const ultimo = grupos[grupos.length - 1]
    if (ultimo && ultimo.modulo === e.modulo) ultimo.exercicios.push(e)
    else grupos.push({ modulo: e.modulo, exercicios: [e] })
  }
  return grupos
}

function Acao({ rotulo, pontos }: { rotulo: string; pontos: number }) {
  return (
    <li className="flex items-baseline justify-between gap-3">
      <span>{rotulo}</span>
      <span className="tabular-nums">+{numero(pontos)}</span>
    </li>
  )
}

function ListaDeExercicios({
  exercicios,
}: {
  exercicios: {
    aulaId: string
    titulo: string
    pontos: number
    obrigatorio: boolean
    aprovado: boolean
  }[]
}) {
  return (
    <ul className="grid divide-y">
      {exercicios.map((e) => {
        const { codigo, etiqueta, nome } = partesDoTitulo(e.titulo)
        return (
          <li key={e.aulaId}>
            <Link
              to="/aulas/$aulaId"
              params={{ aulaId: e.aulaId }}
              className="flex min-h-11 items-center gap-3 py-2 text-sm text-foreground no-underline hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              {e.aprovado ? (
                <span className="grid size-5 shrink-0 place-items-center rounded-full bg-success text-background">
                  <Check
                    className="size-3.5"
                    strokeWidth={3}
                    aria-hidden="true"
                  />
                </span>
              ) : (
                <Circle
                  className="size-5 shrink-0 text-muted-foreground/60"
                  aria-hidden="true"
                />
              )}
              <span className="min-w-0 flex-1">
                {codigo && (
                  <span className="mr-1.5 font-semibold tabular-nums">
                    {codigo}
                  </span>
                )}
                <span className={cn(e.aprovado && 'text-muted-foreground')}>
                  {nome}
                </span>
                {etiqueta && etiqueta !== 'Exercício' && (
                  <span className="ml-1.5 text-xs text-muted-foreground">
                    {etiqueta}
                  </span>
                )}
                {!e.obrigatorio && (
                  <span className="ml-1.5 text-muted-foreground">
                    · opcional
                  </span>
                )}
                <span className="sr-only">
                  {e.aprovado ? ', feito' : ', pendente'}
                </span>
              </span>
              <span className="shrink-0 tabular-nums text-muted-foreground">
                {numero(e.pontos)} pts
              </span>
            </Link>
          </li>
        )
      })}
    </ul>
  )
}
