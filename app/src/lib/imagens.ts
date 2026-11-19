// Endereço de uma capa ou miniatura guardada no R2 (a rota exige sessão).
export function urlDaImagem(chave: string | null | undefined): string | null {
  return chave ? `/api/imagens/${chave}` : null
}
