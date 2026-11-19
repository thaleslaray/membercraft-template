import { type ThemeId, themeById } from '#/config/themes'

/**
 * A cor da marca (#63): contraste, aviso e os tokens que ela sobrescreve.
 * Puro de propósito (sem banco, sem DOM): roda no servidor, no teste e no
 * navegador, onde a prévia ao vivo e o aviso de contraste usam o mesmo cálculo.
 */

// Contraste (WCAG 2.x). Texto normal pede 4,5:1; componente sobre fundo, 3:1.

function canais(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  return [0, 2, 4].map((i) => Number.parseInt(h.slice(i, i + 2), 16)) as [
    number,
    number,
    number,
  ]
}

function paraHex([r, g, b]: [number, number, number]): string {
  return `#${[r, g, b].map((c) => Math.round(c).toString(16).padStart(2, '0')).join('')}`
}

function luminancia(hex: string): number {
  const [r, g, b] = canais(hex).map((c) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** Razão de contraste entre duas cores hex, de 1 a 21. */
export function contraste(a: string, b: string): number {
  const la = luminancia(a)
  const lb = luminancia(b)
  const [alto, baixo] = la > lb ? [la, lb] : [lb, la]
  return (alto + 0.05) / (baixo + 0.05)
}

/**
 * A cor do texto ou do ícone sobre um fundo de cor escolhida (branco ou quase preto): a que mais
 * contrasta. Cor que não seja hex de 6 dígitos cai no branco.
 */
export function corSobre(fundo: string): '#ffffff' | '#111111' {
  if (!/^#[0-9a-f]{6}$/i.test(fundo)) return '#ffffff'
  return contraste(fundo, '#ffffff') >= contraste(fundo, '#111111')
    ? '#ffffff'
    : '#111111'
}

/** Mistura a cor com branco (0 = a cor, 1 = branco). */
function clarear(hex: string, quanto: number): string {
  const c = canais(hex).map((v) => v + (255 - v) * quanto) as [
    number,
    number,
    number,
  ]
  return paraHex(c)
}

/** Mistura a cor com preto (0 = a cor, 1 = preto). */
function escurecer(hex: string, quanto: number): string {
  const c = canais(hex).map((v) => v * (1 - quanto)) as [number, number, number]
  return paraHex(c)
}

const MINIMO_TEXTO = 4.5
const MINIMO_COMPONENTE = 3

export type AvaliacaoDeContraste = {
  /** Branco ou a tinta do tema: o que contrasta mais sobre a cor da marca. */
  textoSobreAMarca: string
  razaoDoTexto: number
  razaoSobreFundoClaro: number
  /** A cor da marca ajustada para o modo escuro (clareada até contrastar com o fundo). */
  corNoEscuro: string
  textoSobreAMarcaNoEscuro: string
  /** Avisos em pt-BR; vazio quer dizer que a cor passa. */
  avisos: string[]
}

function formatarRazao(razao: number): string {
  return `${razao.toFixed(1).replace('.', ',')}:1`
}

export function avaliarCorDaMarca(
  cor: string,
  tema: ThemeId,
): AvaliacaoDeContraste {
  const hex = cor.toLowerCase()
  const { claro, escuro } = themeById(tema).referencia
  const avisos: string[] = []

  const comBranco = contraste(hex, '#ffffff')
  const comTinta = contraste(hex, claro.tinta)
  const textoSobreAMarca = comBranco >= comTinta ? '#ffffff' : claro.tinta
  const razaoDoTexto = Math.max(comBranco, comTinta)
  if (razaoDoTexto < MINIMO_TEXTO) {
    avisos.push(
      `O texto sobre a cor da marca fica com pouco contraste (${formatarRazao(razaoDoTexto)}; o mínimo recomendado é 4,5:1). Escolha uma cor mais clara ou mais escura.`,
    )
  }

  const razaoSobreFundoClaro = contraste(hex, claro.fundo)
  if (razaoSobreFundoClaro < MINIMO_COMPONENTE) {
    avisos.push(
      `A cor da marca quase some sobre o fundo claro do tema (${formatarRazao(razaoSobreFundoClaro)}; o mínimo recomendado é 3:1).`,
    )
  }

  let corNoEscuro = hex
  for (
    let passo = 0.1;
    contraste(corNoEscuro, escuro.fundo) < MINIMO_COMPONENTE && passo <= 1;
    passo += 0.1
  ) {
    corNoEscuro = clarear(hex, passo)
  }
  const textoSobreAMarcaNoEscuro =
    contraste(corNoEscuro, '#ffffff') >= contraste(corNoEscuro, escuro.fundo)
      ? '#ffffff'
      : escuro.fundo

  return {
    textoSobreAMarca,
    razaoDoTexto,
    razaoSobreFundoClaro,
    corNoEscuro,
    textoSobreAMarcaNoEscuro,
    avisos,
  }
}

/**
 * Os tokens que a cor da marca sobrescreve, em cada modo. Só valores de
 * variáveis: os componentes continuam lendo `bg-primary`, `text-brand` etc.
 */
export function variaveisDaMarca(
  cor: string,
  tema: ThemeId,
): { claro: Record<string, string>; escuro: Record<string, string> } {
  const a = avaliarCorDaMarca(cor, tema)
  const face = (marca: string, texto: string, hover: string) => ({
    '--primary': marca,
    '--primary-foreground': texto,
    '--brand': marca,
    '--brand-hover': hover,
    '--brand-foreground': texto,
    '--ring': marca,
    '--sidebar-primary': marca,
    '--sidebar-primary-foreground': texto,
    '--sidebar-ring': marca,
    '--chart-1': marca,
  })
  return {
    claro: face(
      cor.toLowerCase(),
      a.textoSobreAMarca,
      escurecer(cor.toLowerCase(), 0.15),
    ),
    escuro: face(
      a.corNoEscuro,
      a.textoSobreAMarcaNoEscuro,
      clarear(a.corNoEscuro, 0.15),
    ),
  }
}

/**
 * Folha de estilo mínima com a cor da marca, injetada no <head>. Os seletores
 * `html[data-theme]` e `html.dark[data-theme]` vencem os blocos de tema de
 * styles.css ([data-theme='x'] e .dark[data-theme='x']) por especificidade.
 * Só chega aqui cor validada (hex), então a string é segura.
 */
export function cssDaMarca(cor: string, tema: ThemeId): string {
  const { claro, escuro } = variaveisDaMarca(cor, tema)
  const bloco = (vars: Record<string, string>) =>
    Object.entries(vars)
      .map(([k, v]) => `${k}: ${v};`)
      .join(' ')
  return `html[data-theme] { ${bloco(claro)} }\nhtml.dark[data-theme] { ${bloco(escuro)} }`
}
