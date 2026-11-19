// Parte do certificado (#55) que não depende de banco: campos do modelo, texto do que falta e
// código de validação. Fica separada para as telas (que rodam no navegador) importarem sem trazer
// o Drizzle junto. `certificados.ts` reexporta tudo daqui.

export const LIMITE_DO_MOTIVO = 300
export const LIMITE_DO_NOME = 120

// ---------- Modelo: campos ----------

/** Largura da página do PDF, em pontos (A4 deitada). A altura segue a proporção da imagem. */
export const LARGURA_DA_PAGINA = 842

export const NOMES_DOS_CAMPOS = [
  'nome',
  'curso',
  'data',
  'codigo',
  'qr',
] as const
export type NomeDoCampo = (typeof NOMES_DOS_CAMPOS)[number]
export const FONTES = ['helvetica', 'times', 'courier', 'allura'] as const
export type Fonte = (typeof FONTES)[number]
// Cor padrão do texto de um campo do certificado. É cor do PDF impresso (não do tema da tela), por
// isso é um valor literal fixo e não um token: tinta quase preta, legível sobre qualquer arte.
export const COR_PADRAO_DO_CAMPO = '#1a1a1a'

export const ALINHAMENTOS = ['esquerda', 'centro', 'direita'] as const
export type Alinhamento = (typeof ALINHAMENTOS)[number]
export type Lado = 'frente' | 'verso'

/**
 * Um campo posicionado. `x` e `y` são frações (0 a 1) da largura e da altura da imagem: `y` é o
 * centro da linha; `x` é o ponto de ancoragem conforme o `alinhamento`. O QR usa `x`/`y` como centro
 * e `tamanho` como o lado, em pontos. Nunca há campo de CPF: o aluno não o informa.
 */
export interface CampoDoModelo {
  campo: NomeDoCampo
  lado: Lado
  x: number
  y: number
  tamanho: number
  fonte: Fonte
  negrito: boolean
  cor: string
  alinhamento: Alinhamento
}

export const CAMPOS_PADRAO: CampoDoModelo[] = [
  base('nome', 0.5, 0.45, 40),
  base('curso', 0.5, 0.58, 24),
  base('data', 0.5, 0.68, 16),
  base('codigo', 0.12, 0.92, 12, 'esquerda'),
  { ...base('qr', 0.9, 0.85, 80), alinhamento: 'centro' },
]

function base(
  campo: NomeDoCampo,
  x: number,
  y: number,
  tamanho: number,
  alinhamento: Alinhamento = 'centro',
): CampoDoModelo {
  return {
    campo,
    lado: 'frente',
    x,
    y,
    tamanho,
    fonte: 'helvetica',
    negrito: false,
    cor: COR_PADRAO_DO_CAMPO,
    alinhamento,
  }
}

const limitar = (n: number, min: number, max: number) =>
  Math.min(max, Math.max(min, Number.isFinite(n) ? n : min))

/** Aceita o que vem da tela ou do banco e devolve só campos válidos: um por (campo, lado). */
export function normalizarCampos(entrada: unknown): CampoDoModelo[] {
  if (!Array.isArray(entrada)) return []
  const vistos = new Set<string>()
  const campos: CampoDoModelo[] = []
  for (const bruto of entrada) {
    if (!bruto || typeof bruto !== 'object') continue
    const c = bruto as Record<string, unknown>
    if (!NOMES_DOS_CAMPOS.includes(c.campo as NomeDoCampo)) continue
    const lado: Lado = c.lado === 'verso' ? 'verso' : 'frente'
    const chave = `${c.campo}:${lado}`
    if (vistos.has(chave)) continue
    vistos.add(chave)
    const ehQr = c.campo === 'qr'
    campos.push({
      campo: c.campo as NomeDoCampo,
      lado,
      x: limitar(Number(c.x), 0, 1),
      y: limitar(Number(c.y), 0, 1),
      tamanho: limitar(Number(c.tamanho), ehQr ? 40 : 6, ehQr ? 300 : 200),
      fonte: FONTES.includes(c.fonte as Fonte)
        ? (c.fonte as Fonte)
        : 'helvetica',
      negrito: c.negrito === true,
      cor:
        typeof c.cor === 'string' && /^#[0-9a-fA-F]{6}$/.test(c.cor)
          ? c.cor.toLowerCase()
          : COR_PADRAO_DO_CAMPO,
      alinhamento: ALINHAMENTOS.includes(c.alinhamento as Alinhamento)
        ? (c.alinhamento as Alinhamento)
        : 'centro',
    })
  }
  return campos
}

// ---------- Exigências (texto) ----------

export interface Faltam {
  aulas: number
  /** Títulos das aulas dos quizzes obrigatórios ainda não aprovados. */
  quizzes: string[]
  pontos: number
}

export interface SituacaoDasExigencias {
  /** O curso tem alguma exigência e o aluno cumpriu todas. */
  cumpre: boolean
  faltam: Faltam
  /** Quando cumpriu a última exigência (nulo se ainda não cumpre). */
  concluidoEm: Date | null
}

/** "Faltam 3 aulas, o quiz X e 1.200 pontos". Nulo quando não falta nada. */
export function textoDoQueFalta(faltam: Faltam): string | null {
  const partes: string[] = []
  if (faltam.aulas > 0) {
    partes.push(`${faltam.aulas} ${faltam.aulas === 1 ? 'aula' : 'aulas'}`)
  }
  if (faltam.quizzes.length === 1)
    partes.push(`o exercício ${faltam.quizzes[0]}`)
  else if (faltam.quizzes.length > 1) {
    partes.push(`os exercícios ${juntar(faltam.quizzes)}`)
  }
  if (faltam.pontos > 0) {
    partes.push(
      `${faltam.pontos.toLocaleString('pt-BR')} ${faltam.pontos === 1 ? 'ponto' : 'pontos'}`,
    )
  }
  if (partes.length === 0) return null
  const singular =
    partes.length === 1 &&
    (faltam.aulas === 1 || faltam.quizzes.length === 1 || faltam.pontos === 1)
  return `${singular ? 'Falta' : 'Faltam'} ${juntar(partes)}`
}

function juntar(itens: string[]): string {
  if (itens.length <= 1) return itens.join('')
  return `${itens.slice(0, -1).join(', ')} e ${itens[itens.length - 1]}`
}

/** O que a pessoa digitou na página de validação, em caixa alta e com o hífen. */
export function normalizarCodigo(texto: string): string {
  const limpo = texto.toUpperCase().replace(/[^A-Z0-9]/g, '')
  return limpo.length === 8 ? `${limpo.slice(0, 4)}-${limpo.slice(4)}` : limpo
}
