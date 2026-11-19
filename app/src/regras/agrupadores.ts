// Os agrupadores do cron de 15 minutos: uma lista constante, por prefixo da chave do aviso, de quem
// transforma o grupo pronto em e-mail (`enviarAgrupamentosProntos`). Gatilho novo = uma linha aqui.
import type { Agrupadores } from '#/regras/agrupamento-envio'
import {
  agruparAvisoDeAtendimentoParaEquipe,
  CHAVE_DO_AVISO,
} from '#/regras/atendimento'
import {
  agruparRespostasEmEmail,
  PREFIXO_DA_RESPOSTA,
} from '#/regras/comentarios'

export const AGRUPADORES: Agrupadores = {
  [PREFIXO_DA_RESPOSTA]: agruparRespostasEmEmail,
  [CHAVE_DO_AVISO]: agruparAvisoDeAtendimentoParaEquipe,
}
