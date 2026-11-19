// Estados das telas do aluno no painel (perfil, matrículas, certificados, e-mails e Certificado do
// MEC): cada situação vira { rotulo, tom } da `EtiquetaDeEstado`. Sem tela nem HTTP.
import type { StatusDoEnvio } from '#/regras/envio-de-email'
import type { SituacaoDaMatricula } from '#/regras/matricula'
import type { TomDeEstado } from '#/regras/painel'
import type { EstadoDoPedido } from '#/regras/pedido-do-mec'

type Estado = { rotulo: string; tom: TomDeEstado }

export const ESTADO_DA_MATRICULA: Record<SituacaoDaMatricula, Estado> = {
  ativa: { rotulo: 'Ativa', tom: 'ok' },
  expirada: { rotulo: 'Expirada', tom: 'atencao' },
  inativa: { rotulo: 'Inativa', tom: 'neutro' },
}

export const ESTADO_DO_CERTIFICADO: Record<
  'gerando' | 'pronto' | 'falhou' | 'revogado',
  Estado
> = {
  gerando: { rotulo: 'Gerando o PDF', tom: 'neutro' },
  pronto: { rotulo: 'PDF pronto', tom: 'ok' },
  falhou: { rotulo: 'O PDF falhou', tom: 'perigo' },
  revogado: { rotulo: 'Revogado', tom: 'perigo' },
}

export const ESTADO_DO_ENVIO: Record<StatusDoEnvio, Estado> = {
  'na-fila': { rotulo: 'Na fila', tom: 'neutro' },
  enviando: { rotulo: 'Enviando', tom: 'neutro' },
  enviado: { rotulo: 'Enviado', tom: 'ok' },
  bloqueado: { rotulo: 'Bloqueado (ambiente de testes)', tom: 'atencao' },
  ignorado: { rotulo: 'Não enviado: o aluno desligou', tom: 'neutro' },
  falhou: { rotulo: 'Falhou', tom: 'perigo' },
  retornou: { rotulo: 'Voltou', tom: 'perigo' },
}

/** Pedido do MEC: liberado é ok; com problema ou na fila em atraso, perigo. */
export function estadoDoPedidoDoMec(
  estado: EstadoDoPedido,
  atrasado: boolean,
): Estado {
  if (estado === 'liberado') return { rotulo: 'Liberado', tom: 'ok' }
  if (estado === 'problema') return { rotulo: 'Problema', tom: 'perigo' }
  return atrasado
    ? { rotulo: 'Na fila, em atraso', tom: 'perigo' }
    : { rotulo: 'Na fila', tom: 'neutro' }
}
