export interface VideoDoVimeo {
  id: string
  /** Hash dos vídeos não listados; vazio nos públicos. */
  hash: string | null
}

// Aceita o que a equipe cola: só o número, a URL da página (vimeo.com/123/abc), a do player
// (player.vimeo.com/video/123?h=abc) ou o iframe inteiro. Devolve null se não achar um id.
export function interpretarVimeo(entrada: string): VideoDoVimeo | null {
  const texto = entrada.trim()
  if (!texto) return null
  if (/^\d{4,}$/.test(texto)) return { id: texto, hash: null }
  const url =
    /vimeo\.com\/(?:video\/|[\w/]*?\/)?(\d{4,})(?:\/([a-zA-Z0-9]+))?/.exec(
      texto,
    )
  if (!url) return null
  const hashDaQuery = /[?&;]h=([a-zA-Z0-9]+)/.exec(texto)?.[1]
  return { id: url[1], hash: url[2] ?? hashDaQuery ?? null }
}

/** Endereço do player para o iframe da aula. */
export function urlDoPlayer(id: string, hash: string | null): string {
  const base = `https://player.vimeo.com/video/${id}`
  return hash ? `${base}?h=${hash}` : base
}
