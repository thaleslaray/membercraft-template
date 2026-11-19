// A próxima aula que começa sozinha (contagem ou "Assistir agora") precisa dar play ao abrir. O
// recado vai pelo `sessionStorage` (vale só nesta aba e some ao ser lido), porque a navegação monta
// outro player. Sem armazenamento, a aula abre parada.
const CHAVE = 'tocar-ao-abrir'

export function marcarParaTocar(aulaId: string) {
  try {
    window.sessionStorage.setItem(CHAVE, aulaId)
  } catch {
    // Sem armazenamento: a aula abre parada.
  }
}

/** Diz se esta aula foi aberta pelo fim do vídeo da anterior; só vale uma vez. */
export function consumirTocar(aulaId: string): boolean {
  try {
    const marcado = window.sessionStorage.getItem(CHAVE)
    if (marcado === null) return false
    window.sessionStorage.removeItem(CHAVE)
    return marcado === aulaId
  } catch {
    return false
  }
}
