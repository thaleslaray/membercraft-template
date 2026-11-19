// Conferência do formulário do banner no painel, antes de enviar: as mesmas mensagens e os mesmos
// limites que o servidor (`regras/banners.ts`, `lib/banner-fns.ts`), no próprio campo.
import type { ErrosDoFormulario } from '#/regras/painel'

/** Limites do formulário e do servidor, iguais. */
export const LIMITE_DO_TITULO_DO_BANNER = 200
export const LIMITE_DO_LINK_DO_BANNER = 2000

export function validarBanner(dados: {
  titulo: string
  imagemComputador: string | null
  publico: string
  cursoIds: string[]
  inicio: string
  fim: string
}): ErrosDoFormulario {
  const titulo = dados.titulo.trim()
  return {
    titulo: !titulo
      ? 'Informe o título do banner.'
      : titulo.length > LIMITE_DO_TITULO_DO_BANNER
        ? `O título pode ter no máximo ${LIMITE_DO_TITULO_DO_BANNER} caracteres.`
        : undefined,
    imagemComputador: dados.imagemComputador
      ? undefined
      : 'Envie a imagem para computador.',
    cursoIds:
      dados.publico !== 'todos' && dados.cursoIds.length === 0
        ? 'Escolha pelo menos um curso para o público.'
        : undefined,
    fim:
      dados.inicio && dados.fim && dados.fim < dados.inicio
        ? 'A data de fim não pode ser antes da de início.'
        : undefined,
  }
}
