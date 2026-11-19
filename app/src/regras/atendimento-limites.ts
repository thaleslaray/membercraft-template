// Limites do Atendimento e a conferência da imagem: sem banco nem servidor, para a tela usar também.

export const LIMITE_DE_CONVERSAS_POR_HORA = 5
export const LIMITE_DO_TEXTO = 5000
export const LIMITE_DO_ASSUNTO = 150
export const LIMITE_DE_ANEXOS = 5
export const LIMITE_DA_IMAGEM = 10 * 1024 * 1024
export const TIPOS_DE_IMAGEM = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
] as const
export function validarImagem(arquivo: {
  tipo: string
  tamanho: number
}): string | null {
  if (arquivo.tamanho <= 0) return 'O arquivo está vazio.'
  if (!(TIPOS_DE_IMAGEM as readonly string[]).includes(arquivo.tipo)) {
    return 'Envie uma imagem JPG, PNG, WebP ou GIF.'
  }
  if (arquivo.tamanho > LIMITE_DA_IMAGEM) return 'A imagem passa de 10 MB.'
  return null
}
