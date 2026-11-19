// Regras pequenas do mural da Comunidade, sem React: juntar páginas do "Carregar mais", pôr a
// publicação nova no topo e guardar o rascunho de quem cancela.

interface ComId {
  id: string
  fixada: boolean
}

/** Acrescenta a página nova ao fim, sem repetir o que já está (uma publicação nova desloca as páginas). */
export function mesclarPaginas<T extends ComId>(atuais: T[], nova: T[]): T[] {
  const vistos = new Set(atuais.map((i) => i.id))
  const acrescentar = nova.filter((i) => !vistos.has(i.id))
  return acrescentar.length === 0 ? atuais : [...atuais, ...acrescentar]
}

/** A publicação nova entra logo depois das fixadas (que continuam primeiro). */
export function inserirNoTopo<T extends ComId>(lista: T[], novo: T): T[] {
  if (lista.some((i) => i.id === novo.id)) return lista
  const aposFixadas = lista.findIndex((i) => !i.fixada)
  const posicao = aposFixadas === -1 ? lista.length : aposFixadas
  return [...lista.slice(0, posicao), novo, ...lista.slice(posicao)]
}

export interface RascunhoDoMural {
  titulo: string
  textoHtml: string
  comunidadeId: string
}

export type ArmazemDeRascunho = Pick<
  Storage,
  'getItem' | 'setItem' | 'removeItem'
>

export const chaveDoRascunho = (pessoaId: string) =>
  `mural-rascunho:${pessoaId}`

/** Atualiza os dados (contagem, resolvida…) dos itens que já estão na tela, sem mexer na ordem. */
export function atualizarDados<T extends { id: string }>(
  atuais: T[],
  novos: T[],
): T[] {
  const porId = new Map(novos.map((i) => [i.id, i]))
  return atuais.map((i) => porId.get(i.id) ?? i)
}

export const textoDoHtml = (html: string) =>
  html
    .replace(/<img\b/gi, 'IMG')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .trim()

const vazio = (r: RascunhoDoMural) =>
  r.titulo.trim() === '' && textoDoHtml(r.textoHtml) === ''

/** Guarda o rascunho; vazio apaga. Armazenamento bloqueado não derruba a tela. */
export function guardarRascunho(
  armazem: ArmazemDeRascunho,
  pessoaId: string,
  rascunho: RascunhoDoMural,
): void {
  try {
    if (vazio(rascunho)) armazem.removeItem(chaveDoRascunho(pessoaId))
    else armazem.setItem(chaveDoRascunho(pessoaId), JSON.stringify(rascunho))
  } catch {
    // sem rascunho: tudo bem
  }
}

export function lerRascunho(
  armazem: ArmazemDeRascunho,
  pessoaId: string,
): RascunhoDoMural | null {
  try {
    const bruto = armazem.getItem(chaveDoRascunho(pessoaId))
    if (!bruto) return null
    const dado = JSON.parse(bruto) as Partial<RascunhoDoMural>
    if (
      typeof dado.titulo !== 'string' ||
      typeof dado.textoHtml !== 'string' ||
      typeof dado.comunidadeId !== 'string'
    )
      return null
    const r = {
      titulo: dado.titulo,
      textoHtml: dado.textoHtml,
      comunidadeId: dado.comunidadeId,
    }
    return vazio(r) ? null : r
  } catch {
    return null
  }
}
