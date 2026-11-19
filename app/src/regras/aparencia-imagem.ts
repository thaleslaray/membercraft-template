import type { Relogio } from '#/regras/tipos'

/**
 * As imagens da aparência (#63): o que aceitamos, como nomeamos no R2 e com que
 * tipo servimos de volta. Puro: vale no navegador (antes de enviar) e no servidor.
 */

export const TAMANHO_MAXIMO_DA_IMAGEM = 5 * 1024 * 1024

const TIPOS_DE_IMAGEM: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
  'image/x-icon': 'ico',
  'image/vnd.microsoft.icon': 'ico',
}

export type CampoDeImagem =
  | 'logoUrl'
  | 'faviconUrl'
  | 'fundoDoMenuUrl'
  | 'fundoDoLoginUrl'

export const camposDeImagem: CampoDeImagem[] = [
  'logoUrl',
  'faviconUrl',
  'fundoDoMenuUrl',
  'fundoDoLoginUrl',
]

export function ehCampoDeImagem(valor: unknown): valor is CampoDeImagem {
  return (
    typeof valor === 'string' && (camposDeImagem as string[]).includes(valor)
  )
}

/** Motivo da recusa em pt-BR, ou nulo quando a imagem serve. */
export function validarImagem({
  tipo,
  tamanho,
}: {
  tipo: string
  tamanho: number
}): string | null {
  if (!(tipo in TIPOS_DE_IMAGEM)) {
    return 'Envie uma imagem em PNG, JPEG, GIF, WebP, SVG ou ICO.'
  }
  if (tamanho > TAMANHO_MAXIMO_DA_IMAGEM) {
    return 'Cada imagem pode ter no máximo 5 MB.'
  }
  return null
}

/** Nome único do arquivo no R2: campo, instante e extensão pelo tipo. */
export function nomeDoArquivo(
  campo: CampoDeImagem,
  tipo: string,
  relogio: Relogio,
): string {
  const extensao = TIPOS_DE_IMAGEM[tipo] ?? 'bin'
  const base = campo.replace(/Url$/, '').toLowerCase()
  return `${base}-${relogio().getTime()}.${extensao}`
}

/** Tipo MIME a partir da extensão do nome gravado (para servir o arquivo). */
export function tipoDoArquivo(nome: string): string {
  const extensao = nome.split('.').pop() ?? ''
  const achado = Object.entries(TIPOS_DE_IMAGEM).find(([, e]) => e === extensao)
  return achado?.[0] ?? 'application/octet-stream'
}
