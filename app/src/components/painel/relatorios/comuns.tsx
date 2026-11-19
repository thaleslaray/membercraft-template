import { Download } from 'lucide-react'
import type { ReactNode } from 'react'
import { BarraDeFiltros } from '#/components/painel/barra-de-filtros'
import { FiltroDeDatas } from '#/components/painel/filtro-de-datas'
import { Button } from '#/components/ui/button'
import { Card, CardContent } from '#/components/ui/card'
import {
  dataParaCampo,
  FUSO_DA_ESCOLA,
  formatarDataHoraNoFuso,
} from '#/lib/datas'

export const dataHora = (data: Date | null) =>
  data ? formatarDataHoraNoFuso(data, FUSO_DA_ESCOLA) : ''

export function duracao(segundos: number): string {
  const minutos = Math.round(segundos / 60)
  if (minutos < 60) return `${minutos} min`
  return `${Math.floor(minutos / 60)} h ${String(minutos % 60).padStart(2, '0')} min`
}

export const percentual = (valor: number | null) =>
  valor === null ? '—' : `${valor}%`

export function Numero({
  rotulo,
  valor,
}: {
  rotulo: string
  valor: ReactNode
}) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-1 pt-6">
        <span className="text-2xl font-semibold tabular-nums">{valor}</span>
        <span className="text-sm text-muted-foreground">{rotulo}</span>
      </CardContent>
    </Card>
  )
}

export interface Filtros {
  de?: string
  ate?: string
  cursoId?: string
}

/**
 * Período (em Brasília) e curso, na barra de filtros do painel: cada um aplica na hora e grava na
 * busca da URL. `cursoPadrao` é o curso que vale quando a URL não escolhe nenhum (aba de progresso,
 * que não tem "todos os cursos").
 */
export function FiltroDePeriodoECurso({
  periodo,
  cursos,
  filtros,
  semPeriodo,
  semTodosOsCursos,
}: {
  periodo?: { de: Date; ate: Date }
  cursos: { id: string; nome: string }[]
  filtros: Filtros
  semPeriodo?: boolean
  semTodosOsCursos?: boolean
}) {
  // Sem "todos os cursos", a opção vazia é o primeiro curso (o que vale sem escolha na URL).
  const [primeiro, ...demais] = cursos
  const opcoes = semTodosOsCursos ? demais : cursos
  const cursoId =
    semTodosOsCursos && filtros.cursoId === primeiro?.id
      ? undefined
      : filtros.cursoId
  return (
    <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
      {semPeriodo ? null : (
        <FiltroDeDatas
          de={filtros.de ?? dataParaCampo(periodo?.de ?? null)}
          ate={filtros.ate ?? dataParaCampo(periodo?.ate ?? null)}
        />
      )}
      <BarraDeFiltros
        rotulo="Filtrar por curso"
        valores={{ cursoId }}
        filtros={[
          {
            chave: 'cursoId',
            rotulo: 'Curso',
            opcoes: opcoes.map((c) => ({ valor: c.id, rotulo: c.nome })),
            todas: semTodosOsCursos
              ? (primeiro?.nome ?? 'Nenhum curso')
              : 'Todos os cursos',
          },
        ]}
      />
    </div>
  )
}

/** Botão de CSV: só o Proprietário vê. O download passa pela rota que registra a ação. */
export function BotaoDeCsv({
  tipo,
  params,
  rotulo = 'Exportar CSV',
}: {
  tipo: string
  params?: Record<string, string | number | undefined>
  rotulo?: string
}) {
  const busca = new URLSearchParams({ tipo })
  for (const [chave, valor] of Object.entries(params ?? {})) {
    if (valor !== undefined && valor !== '') busca.set(chave, String(valor))
  }
  return (
    <Button asChild variant="outline" size="sm">
      <a href={`/api/painel/exportar?${busca}`} download>
        <Download />
        {rotulo}
      </a>
    </Button>
  )
}
