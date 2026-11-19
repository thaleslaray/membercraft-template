// Etiquetas e regras de tela das telas de Vendas, Conferência de vendas e Plataformas (painel).
import type { TomDeEstado } from '#/regras/painel'
import type { SituacaoDoAviso } from '#/regras/vendas'

type Estado = { rotulo: string; tom: TomDeEstado }

/**
 * Reprocessar só faz sentido onde o aviso ainda pode mudar: na fila, esperando turma ou com erro.
 * Venda já aplicada viraria matrícula de novo à toa; aviso ignorado é ignorado de propósito (o
 * gatilho não mexe em matrícula) e o resultado seria o mesmo.
 */
export function podeReprocessarAviso(situacao: SituacaoDoAviso): boolean {
  return (
    situacao === 'recebida' ||
    situacao === 'sem_turma' ||
    situacao === 'com_erro'
  )
}

/** Situação de uma venda da planilha da Voomp, na Conferência de vendas. */
export const ESTADO_DA_VENDA_CONFERIDA: Record<
  'pendente' | 'sem_turma' | 'aplicada',
  Estado
> = {
  pendente: { rotulo: 'Sem matrícula', tom: 'atencao' },
  sem_turma: { rotulo: 'Sem turma', tom: 'atencao' },
  aplicada: { rotulo: 'Matriculada', tom: 'ok' },
}

/** Resultado de cada transação na Conferência da Hotmart. */
export const ESTADO_DO_RESULTADO_DA_HOTMART: Record<
  'recuperada' | 'sem_turma' | 'ignorada' | 'com_erro',
  Estado
> = {
  recuperada: { rotulo: 'Recuperada', tom: 'ok' },
  sem_turma: { rotulo: 'Sem turma', tom: 'atencao' },
  ignorada: { rotulo: 'Ignorada', tom: 'neutro' },
  com_erro: { rotulo: 'Com erro', tom: 'perigo' },
}

/** Situação de uma rodada da Conferência da Hotmart. */
export const ESTADO_DA_RODADA_DA_HOTMART: Record<'ok' | 'falhou', Estado> = {
  ok: { rotulo: 'Concluída', tom: 'ok' },
  falhou: { rotulo: 'Falhou', tom: 'perigo' },
}
