// Ajuste do texto dos campos do certificado: a mesma regra para a prévia (navegador) e para o PDF.
// Fica fora de `certificado-pdf.ts` para a tela importar sem trazer o `pdf-lib`.
//
// Regra de design: o texto diminui a fonte até caber na largura da caixa, até no mínimo 70% do
// tamanho do modelo; se ainda não couber, quebra em até 2 linhas, no tamanho mínimo; nunca corta
// (palavra única maior que a caixa diminui além do mínimo, em vez de ser cortada).

import {
  type CampoDoModelo,
  type Fonte,
  LARGURA_DA_PAGINA,
} from '#/regras/certificado-modelo'

/** Quanto a fonte pode diminuir antes de quebrar em 2 linhas. */
export const TAMANHO_MINIMO = 0.7
/** Margem de cada lado, em fração da largura da página. */
const MARGEM = 0.05
/** Entrelinha de um campo de 2 linhas (múltiplo do tamanho). */
export const ENTRELINHA = 1.1

export type Medidor = (texto: string, tamanho: number) => number

/** Largura, em pontos, que o texto do campo pode ocupar sem sair da página. */
export function larguraDisponivelDoCampo(c: CampoDoModelo): number {
  const margem = LARGURA_DA_PAGINA * MARGEM
  const ancora = c.x * LARGURA_DA_PAGINA
  const ate =
    c.alinhamento === 'centro'
      ? 2 * Math.min(ancora, LARGURA_DA_PAGINA - ancora)
      : c.alinhamento === 'esquerda'
        ? LARGURA_DA_PAGINA - ancora
        : ancora
  return Math.max(ate - (c.alinhamento === 'centro' ? 2 : 1) * margem, 1)
}

/** Divide em 2 linhas na fronteira de palavra que deixa a mais larga o mais estreita possível. */
function quebrarEmDuas(
  texto: string,
  tamanho: number,
  medir: Medidor,
): string[] | null {
  const palavras = texto.split(/\s+/).filter(Boolean)
  if (palavras.length < 2) return null
  let melhor: string[] | null = null
  let larguraDaMelhor = Number.POSITIVE_INFINITY
  for (let i = 1; i < palavras.length; i++) {
    const linhas = [palavras.slice(0, i).join(' '), palavras.slice(i).join(' ')]
    const largura = Math.max(...linhas.map((l) => medir(l, tamanho)))
    if (largura < larguraDaMelhor) {
      melhor = linhas
      larguraDaMelhor = largura
    }
  }
  return melhor
}

/** Linhas e tamanho de fonte com que o texto cabe em `largura` (ver a regra no topo do arquivo). */
export function ajustarTextoDoCampo(
  texto: string,
  tamanho: number,
  largura: number,
  medir: Medidor,
): { linhas: string[]; tamanho: number } {
  const inteira = medir(texto, tamanho)
  if (inteira <= largura) return { linhas: [texto], tamanho }

  const minimo = tamanho * TAMANHO_MINIMO
  const cabendo = (tamanho * largura) / inteira
  if (cabendo >= minimo) return { linhas: [texto], tamanho: cabendo }

  const linhas = quebrarEmDuas(texto, minimo, medir)
  if (!linhas) return { linhas: [texto], tamanho: cabendo }
  const maisLarga = Math.max(...linhas.map((l) => medir(l, minimo)))
  return {
    linhas,
    tamanho: maisLarga <= largura ? minimo : (minimo * largura) / maisLarga,
  }
}

/** Largura de letra, em múltiplos do tamanho, por fonte: média de texto corrido em português. */
const EM_POR_LETRA: Record<Fonte, number> = {
  helvetica: 0.55,
  times: 0.5,
  courier: 0.6,
  allura: 0.42,
}

/**
 * Medida da prévia, sem carregar as fontes: uma aproximação das métricas reais que o PDF usa.
 * Um pouco generosa de propósito (o texto da prévia nunca passa do que o PDF desenha).
 */
export function medidaAproximada(
  texto: string,
  tamanho: number,
  fonte: Fonte,
  negrito: boolean,
): number {
  const fator = negrito && fonte !== 'allura' ? 1.08 : 1
  return Array.from(texto).length * tamanho * EM_POR_LETRA[fonte] * fator
}
