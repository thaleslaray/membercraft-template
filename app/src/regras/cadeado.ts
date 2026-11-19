// O que o aluno vê no lugar de um conteúdo que ainda não abre: o tipo de cadeado e o texto do
// motivo. Sem banco nem tela, para servir ao módulo de acesso e aos componentes.

import { formatarDiaEMes } from '#/lib/datas'

export type MotivoDoCadeado =
  | 'bloqueado'
  | 'fechado'
  | 'data'
  | 'dias_apos_compra'
  | 'apos_modulo'
  | 'apos_curso'
  | 'apos_aula'
  | 'pontuacao_minima'
  | 'acesso_expirado'
  | 'sem_matricula'

// O que falta para abrir: o conteúdo a concluir, os dias da compra ou os pontos.
export interface Requisito {
  tipo: 'modulo' | 'curso' | 'aula' | 'dias' | 'pontos'
  id?: string
  nome?: string
  dias?: number
  /** Pontos que faltam no curso. */
  faltam?: number
  minimo?: number
}

export type SituacaoDoConteudo =
  | { tipo: 'liberado' }
  | { tipo: 'oculto' }
  | {
      tipo: 'cadeado'
      motivo: MotivoDoCadeado
      liberaEm?: Date
      requisito?: Requisito
    }

export const LIBERADO: SituacaoDoConteudo = { tipo: 'liberado' }

export function estaLiberado(situacao: SituacaoDoConteudo | undefined) {
  return situacao === undefined || situacao.tipo === 'liberado'
}

type Cadeado = Extract<SituacaoDoConteudo, { tipo: 'cadeado' }>

// Tudo o que se sabe de cada motivo, num mapa só (antes eram dois `switch` sobre os mesmos motivos):
// - `grupo`: quão generosa é a situação para o aluno, quanto menor melhor (0 = abre por data, que
//   desempata pela data; 1 = depende do aluno; 2 = encerrado; 3 = bloqueado de vez ou sem acesso);
// - `texto`: o que o aluno lê no lugar do conteúdo. `fuso` é o dele: a liberação é calculada em
//   Brasília, mas a data lida vai no fuso dele.
const DO_MOTIVO: Record<
  MotivoDoCadeado,
  { grupo: number; texto: (s: Cadeado, fuso?: string | null) => string }
> = {
  data: {
    grupo: 0,
    texto: ({ liberaEm }, fuso) =>
      liberaEm ? `Libera em ${formatarDiaEMes(liberaEm, fuso)}` : 'Em breve',
  },
  dias_apos_compra: {
    grupo: 0,
    texto: ({ liberaEm, requisito }, fuso) => {
      const dias = requisito?.dias
      const quando = liberaEm ? ` (em ${formatarDiaEMes(liberaEm, fuso)})` : ''
      return dias
        ? `Libera ${dias} ${dias === 1 ? 'dia' : 'dias'} após a compra${quando}`
        : `Libera em breve${quando}`
    },
  },
  apos_modulo: {
    grupo: 1,
    texto: ({ requisito }) =>
      `Conclua o módulo ${requisito?.nome ?? 'anterior'}`,
  },
  apos_curso: {
    grupo: 1,
    texto: ({ requisito }) =>
      `Conclua o curso ${requisito?.nome ?? 'anterior'}`,
  },
  apos_aula: {
    grupo: 1,
    texto: ({ requisito }) => `Conclua a aula ${requisito?.nome ?? 'anterior'}`,
  },
  pontuacao_minima: {
    grupo: 1,
    texto: ({ requisito }) => {
      const faltam = requisito?.faltam ?? 0
      return faltam === 1
        ? 'Falta 1 ponto neste curso'
        : `Faltam ${faltam} pontos neste curso`
    },
  },
  fechado: { grupo: 2, texto: () => 'Este conteúdo foi encerrado' },
  bloqueado: { grupo: 3, texto: () => 'Conteúdo bloqueado' },
  acesso_expirado: { grupo: 3, texto: () => 'Seu acesso expirou' },
  sem_matricula: {
    grupo: 3,
    texto: () => 'Você não tem acesso a este conteúdo',
  },
}

/** `fuso` é o do aluno: a liberação é calculada em Brasília, mas a data lida vai no fuso dele. */
export function textoDoCadeado(
  situacao: Cadeado,
  fuso?: string | null,
): string {
  return DO_MOTIVO[situacao.motivo].texto(situacao, fuso)
}

/** Quão generosa é a situação para o aluno: [grupo, desempate]; quanto menor, melhor. */
export function postoDoCadeado(situacao: Cadeado): [number, number] {
  return [
    DO_MOTIVO[situacao.motivo].grupo,
    situacao.liberaEm?.getTime() ?? Number.MAX_SAFE_INTEGER,
  ]
}

// Texto curto para qualquer situação que não seja liberada (nulo se liberada ou oculta).
export function textoDaSituacao(situacao: SituacaoDoConteudo): string | null {
  return situacao.tipo === 'cadeado' ? textoDoCadeado(situacao) : null
}
