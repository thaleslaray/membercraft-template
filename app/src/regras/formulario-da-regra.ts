// Conferência do editor de regra de liberação no painel, antes de enviar: as mesmas mensagens e o
// mesmo limite que o servidor (`definirRegra` em `regras/regras-de-liberacao.ts`), no próprio campo.
import type { ErrosDoFormulario } from '#/regras/painel'

/** Maior número de dias ou de pontos aceito (formulário e servidor). */
export const LIMITE_DA_REGRA = 100_000

function inteiroDe(texto: string, rotulo: string): string | undefined {
  const n = Number(texto)
  return texto.trim() !== '' &&
    Number.isInteger(n) &&
    n >= 1 &&
    n <= LIMITE_DA_REGRA
    ? undefined
    : `Informe ${rotulo} (um número inteiro, de 1 a ${LIMITE_DA_REGRA.toLocaleString('pt-BR')}).`
}

export function validarRegra(dados: {
  tipo: string
  liberaEm: string
  fechaEm: string
  dias: string
  pontos: string
  alvoId: string
}): ErrosDoFormulario {
  switch (dados.tipo) {
    case 'data':
      return {
        liberaEm: dados.liberaEm ? undefined : 'Informe a data de liberação.',
        fechaEm:
          dados.fechaEm && dados.liberaEm && dados.fechaEm <= dados.liberaEm
            ? 'O fechamento deve ser depois da liberação.'
            : undefined,
      }
    case 'dias_apos_compra':
      return { dias: inteiroDe(dados.dias, 'os dias após a compra') }
    case 'pontuacao_minima':
      return { pontos: inteiroDe(dados.pontos, 'a pontuação mínima') }
    case 'curso_concluido':
    case 'modulo_concluido':
    case 'aula_concluida':
      return {
        alvoId: dados.alvoId
          ? undefined
          : 'Escolha o que precisa estar concluído.',
      }
    default:
      return {}
  }
}
