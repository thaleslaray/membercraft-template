// Cartela de cores de um curso: as cores principais da capa, como numa cartela de coloração pessoal.
// Recebe os pixels já reduzidos (RGBA, de um canvas pequeno) e devolve até `quantas` cores em hex,
// da mais marcante para a menos. Função pura: o canvas fica com quem chama (`useCartela`).

type Rgb = [number, number, number]

/** Luminosidade (0 a 1) e saturação (0 a 1) no modelo HSL. */
function luzESaturacao([r, g, b]: Rgb): { luz: number; saturacao: number } {
  const max = Math.max(r, g, b) / 255
  const min = Math.min(r, g, b) / 255
  const luz = (max + min) / 2
  const delta = max - min
  const saturacao = delta === 0 ? 0 : delta / (1 - Math.abs(2 * luz - 1))
  return { luz, saturacao }
}

function distancia(a: Rgb, b: Rgb): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
}

function paraHex([r, g, b]: Rgb): string {
  return `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`
}

/**
 * As cores vão para anéis e bolinhas sobre fundo claro ou escuro: uma cor quase branca sumiria. Escurece
 * as muito claras até no máximo 78% de luz, mantendo o tom.
 */
function legivel(cor: Rgb): Rgb {
  const { luz } = luzESaturacao(cor)
  if (luz <= 0.78) return cor
  const fator = 0.78 / luz
  return [cor[0] * fator, cor[1] * fator, cor[2] * fator]
}

export function extrairCartela(
  pixels: Uint8ClampedArray,
  quantas = 5,
): string[] {
  // Agrupa em caixas de 32 níveis por canal (8 x 8 x 8) e guarda a média de cada caixa.
  const caixas = new Map<number, { soma: Rgb; n: number }>()
  for (let i = 0; i + 3 < pixels.length; i += 4) {
    if (pixels[i + 3] < 128) continue // transparente
    const r = pixels[i]
    const g = pixels[i + 1]
    const b = pixels[i + 2]
    const chave = ((r >> 5) << 6) | ((g >> 5) << 3) | (b >> 5)
    const caixa = caixas.get(chave)
    if (caixa) {
      caixa.soma[0] += r
      caixa.soma[1] += g
      caixa.soma[2] += b
      caixa.n++
    } else {
      caixas.set(chave, { soma: [r, g, b], n: 1 })
    }
  }
  const candidatas = [...caixas.values()].map(({ soma, n }) => {
    const cor: Rgb = [soma[0] / n, soma[1] / n, soma[2] / n]
    const { luz, saturacao } = luzESaturacao(cor)
    // Fundo branco, texto preto e cinzas não são a cor da capa: só entram se faltar cor.
    const neutra = luz > 0.93 || luz < 0.07 || saturacao < 0.12
    return { cor, neutra, peso: n * (0.4 + saturacao) }
  })
  candidatas.sort(
    (a, b) => Number(a.neutra) - Number(b.neutra) || b.peso - a.peso,
  )

  const escolhidas: Rgb[] = []
  for (const { cor } of candidatas) {
    if (escolhidas.length >= quantas) break
    // Duas cores quase iguais não fazem uma cartela.
    if (escolhidas.every((e) => distancia(e, cor) > 48)) escolhidas.push(cor)
  }
  return escolhidas.map((c) => paraHex(legivel(c)))
}

function deHex(hex: string): Rgb {
  const h = hex.replace('#', '')
  return [
    Number.parseInt(h.slice(0, 2), 16),
    Number.parseInt(h.slice(2, 4), 16),
    Number.parseInt(h.slice(4, 6), 16),
  ]
}

function luminanciaRelativa([r, g, b]: Rgb): number {
  const [lr, lg, lb] = [r, g, b].map((v) => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * lr + 0.7152 * lg + 0.0722 * lb
}

/** Razão de contraste WCAG entre duas cores em hex (1 a 21). */
export function contraste(a: string, b: string): number {
  const la = luminanciaRelativa(deHex(a))
  const lb = luminanciaRelativa(deHex(b))
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

/**
 * Cor da barra de progresso contra o trilho: no modo claro escurece, no escuro clareia (mistura com
 * preto ou branco, mantendo o tom) até ter ao menos 3:1 com o trilho. Cor que já passa fica como está.
 */
export function corDaBarra(
  cor: string,
  trilho: string,
  modo: 'claro' | 'escuro',
  minimo = 3,
): string {
  if (contraste(cor, trilho) >= minimo) return cor
  const base = deHex(cor)
  const alvo: Rgb = modo === 'claro' ? [0, 0, 0] : [255, 255, 255]
  for (let passo = 1; passo <= 100; passo++) {
    const t = passo / 100
    const misturada = paraHex([
      base[0] + (alvo[0] - base[0]) * t,
      base[1] + (alvo[1] - base[1]) * t,
      base[2] + (alvo[2] - base[2]) * t,
    ])
    if (contraste(misturada, trilho) >= minimo) return misturada
  }
  return paraHex(alvo)
}

/** As cores do trilho de uma barra em cada modo (hex): contra elas se calcula o contraste da cor da barra. */
export interface CoresDaBarra {
  claro: string
  escuro: string
}

/**
 * Trilhos conhecidos. `modulo` espelha o token `--muted` de `styles.css` (o trilho da barra do módulo é
 * `bg-muted`); o teste `cartela.test.ts` confere que os dois não se afastam. `sobreCapa` é a película
 * branca (claro) ou preta (escuro) sob a barra que fica em cima da capa.
 */
export const TRILHOS_DA_BARRA = {
  modulo: { claro: '#f1f5f9', escuro: '#1f232a' },
  sobreCapa: { claro: '#ffffff', escuro: '#000000' },
} as const satisfies Record<string, CoresDaBarra>
