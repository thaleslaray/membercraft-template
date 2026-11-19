// Estado da conversa de atendimento na etiqueta do painel: rótulo e tom (`EtiquetaDeEstado`).
// Aberta espera a equipe (atenção); Respondida espera o aluno (neutro); Resolvida está fechada (ok).
import type { EstadoDaConversa } from '#/regras/atendimento'
import type { TomDeEstado } from '#/regras/painel'

export const ESTADO_DA_CONVERSA: Record<
  EstadoDaConversa,
  { rotulo: string; tom: TomDeEstado }
> = {
  aberta: { rotulo: 'Aberta', tom: 'atencao' },
  respondida: { rotulo: 'Respondida', tom: 'neutro' },
  resolvida: { rotulo: 'Resolvida', tom: 'ok' },
}
