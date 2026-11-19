// Direção da troca de tela (View Transitions do roteador). O tipo devolvido vira
// `:active-view-transition-type(...)` em styles.css.
//
// Nível = quantos trechos tem o caminho, com o Início (`/`) valendo 1, igual aos destinos do topo
// (`/comunidades`). Entrar num item (curso, publicação, conversa) sobe de nível: a tela nova vem
// da direita. Voltar desce: a tela some para a direita. No mesmo nível (os dois destinos do topo,
// ou de um item para outro) não há "para dentro": esmaecimento curto.

export type TipoDeTroca = 'avancar' | 'voltar' | 'esmaecer'

function nivelDoCaminho(caminho: string): number {
  const trechos = caminho.split('/').filter(Boolean)
  return Math.max(1, trechos.length)
}

function normalizar(caminho: string): string {
  const semBarraFinal = caminho.replace(/\/+$/, '')
  return semBarraFinal === '' ? '/' : semBarraFinal
}

/** `false` quando não deve haver transição (primeira tela, ou só busca/âncora mudou). */
export function tiposDaTroca(
  de: string | undefined,
  para: string,
): [TipoDeTroca] | false {
  if (de === undefined) return false
  if (normalizar(de) === normalizar(para)) return false
  const antes = nivelDoCaminho(de)
  const depois = nivelDoCaminho(para)
  if (depois > antes) return ['avancar']
  if (depois < antes) return ['voltar']
  return ['esmaecer']
}
