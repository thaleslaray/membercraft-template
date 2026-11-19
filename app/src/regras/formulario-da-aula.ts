// Conferência do formulário da aula no painel, antes de enviar: as mesmas mensagens que o servidor
// (`valoresDaAula` em `regras/conteudo.ts`) daria, mas no próprio campo.
import type { ErrosDoFormulario } from '#/regras/painel'
import { interpretarVimeo } from '#/regras/vimeo'

export const LIMITE_DO_TITULO_DA_AULA = 200

export function validarAula(dados: {
  titulo: string
  video: string
}): ErrosDoFormulario {
  const titulo = dados.titulo.trim()
  const video = dados.video.trim()
  return {
    titulo: !titulo
      ? 'Informe o título da aula.'
      : titulo.length > LIMITE_DO_TITULO_DA_AULA
        ? `O título da aula pode ter no máximo ${LIMITE_DO_TITULO_DA_AULA} caracteres.`
        : undefined,
    video:
      video && !interpretarVimeo(video)
        ? 'Não achei um vídeo do Vimeo nesse texto. Cole o link ou o número do vídeo.'
        : undefined,
  }
}
