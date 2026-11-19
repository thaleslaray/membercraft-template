/** Move o item uma posição e devolve a nova lista de ids; igual à original se não der para mover. */
export function moverNaLista(
  ids: string[],
  id: string,
  deslocamento: -1 | 1,
): string[] {
  const de = ids.indexOf(id)
  const para = de + deslocamento
  if (de < 0 || para < 0 || para >= ids.length) return ids
  const nova = [...ids]
  nova.splice(de, 1)
  nova.splice(para, 0, id)
  return nova
}

/** Solta o item na posição de outro (arrastar): devolve a nova lista; igual à original se não mudar. */
export function soltarNaPosicao(
  ids: string[],
  id: string,
  alvo: string,
): string[] {
  const de = ids.indexOf(id)
  const para = ids.indexOf(alvo)
  if (de < 0 || para < 0 || de === para) return ids
  const nova = [...ids]
  nova.splice(de, 1)
  nova.splice(para, 0, id)
  return nova
}
