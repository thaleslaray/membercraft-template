// Regras dos arquivos do conteúdo (capas e materiais) que ficam no R2.

export type FinalidadeDoArquivo = 'imagem' | 'material'

// Capas e miniaturas: só imagens que o navegador não executa (SVG fica de fora).
export const TIPOS_DE_IMAGEM = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
] as const

export const LIMITE_DA_IMAGEM = 8 * 1024 * 1024
// O corpo de uma requisição ao Worker tem teto de 100 MB; materiais grandes ficam de fora.
export const LIMITE_DO_MATERIAL = 90 * 1024 * 1024

export const PREFIXO_DAS_IMAGENS = 'conteudo/imagens/'
export const PREFIXO_DOS_MATERIAIS = 'conteudo/materiais/'

export function nomeSeguroDoArquivo(nome: string): string {
  const base = nome.split(/[\\/]/).pop() ?? ''
  const limpo = base
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+\./g, '.')
    .replace(/^[-.]+|[-.]+$/g, '')
    .slice(-80)
  return limpo || 'arquivo'
}

export function chaveDoArquivo(
  finalidade: FinalidadeDoArquivo,
  nome: string,
  id: string,
): string {
  const prefixo =
    finalidade === 'imagem' ? PREFIXO_DAS_IMAGENS : PREFIXO_DOS_MATERIAIS
  return `${prefixo}${id}/${nomeSeguroDoArquivo(nome)}`
}

/** Erro em texto (para mostrar à equipe) ou null se o arquivo pode subir. */
export function validarEnvio(
  finalidade: FinalidadeDoArquivo,
  arquivo: { tipo: string; tamanho: number },
): string | null {
  if (arquivo.tamanho <= 0) return 'O arquivo está vazio.'
  if (finalidade === 'imagem') {
    if (!(TIPOS_DE_IMAGEM as readonly string[]).includes(arquivo.tipo)) {
      return 'Envie uma imagem JPG, PNG, WebP ou GIF.'
    }
    if (arquivo.tamanho > LIMITE_DA_IMAGEM) return 'A imagem passa de 8 MB.'
    return null
  }
  if (arquivo.tamanho > LIMITE_DO_MATERIAL) return 'O arquivo passa de 90 MB.'
  return null
}

/** A chave de imagem só pode ser de imagem de conteúdo e não pode escapar do prefixo. */
export function chaveDeImagemValida(chave: string): boolean {
  return (
    chave.startsWith(PREFIXO_DAS_IMAGENS) &&
    !chave.includes('..') &&
    !chave.includes('//')
  )
}

export function chaveDeMaterialValida(chave: string): boolean {
  return (
    chave.startsWith(PREFIXO_DOS_MATERIAIS) &&
    !chave.includes('..') &&
    !chave.includes('//')
  )
}

/** Content-Disposition de download (ou `inline`, para abrir na tela), com o nome em UTF-8. */
export function cabecalhoDeDownload(nome: string, naTela = false): string {
  const simples = nomeSeguroDoArquivo(nome)
  return `${naTela ? 'inline' : 'attachment'}; filename="${simples}"; filename*=UTF-8''${encodeURIComponent(nome)}`
}
