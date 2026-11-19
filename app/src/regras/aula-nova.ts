// Regras da tela da aula (#95) que não dependem da tela: a linha "faltam N aulas para fechar o módulo"
// e o marco (módulo ou curso) que concluir uma aula fecha.

export type Marco =
  | { tipo: 'modulo'; moduloNome: string; faltam: number }
  | { tipo: 'curso' }

interface ModuloComAulas {
  id: string
  nome: string
  aulas: { id: string }[]
}

/** Largura (px) a partir da qual a lista abre sozinha, quando a aluna ainda não escolheu. */
export const LARGURA_QUE_ABRE_A_LISTA = 1800

/** A lista começa aberta? O que ficou guardado no aparelho vale; sem isso, só em tela bem larga. */
export function listaAbertaInicial(
  guardado: string | null,
  larguraDaJanela: number,
): boolean {
  if (guardado === 'aberta') return true
  if (guardado === 'fechada') return false
  return larguraDaJanela >= LARGURA_QUE_ABRE_A_LISTA
}

export function situacaoDoModulo(
  aulas: { id: string }[],
  concluidas: string[],
) {
  const feitas = aulas.filter((a) => concluidas.includes(a.id)).length
  const total = aulas.length
  const faltam = total - feitas
  let texto = ''
  if (total > 0) {
    if (faltam === 0) texto = 'módulo concluído'
    else if (faltam === 1) texto = 'falta 1 aula para fechar o módulo'
    else texto = `faltam ${faltam} aulas para fechar o módulo`
  }
  return { feitas, total, faltam, texto }
}

/**
 * Se concluir `aulaId` fecha o módulo ou o curso, devolve o marco e o anel (por módulo) com a aula já
 * contada. Aula já concluída não fecha nada; módulo de uma aula só (um FAQ, um aviso) não ganha tela.
 */
export function marcoAoConcluir(
  modulos: ModuloComAulas[],
  concluidas: string[],
  aulaId: string,
  moduloId: string,
) {
  if (concluidas.includes(aulaId)) return null
  const depois = new Set([...concluidas, aulaId])
  const todas = modulos.flatMap((m) => m.aulas.map((a) => a.id))
  const anel = modulos.map((m) => ({
    total: m.aulas.length,
    feitas: m.aulas.filter((a) => depois.has(a.id)).length,
  }))
  const percentual = todas.length
    ? Math.round(
        (todas.filter((id) => depois.has(id)).length / todas.length) * 100,
      )
    : 0
  const doModulo = modulos.find((m) => m.id === moduloId)
  let marco: Marco | null = null
  if (todas.length > 0 && todas.every((id) => depois.has(id))) {
    marco = { tipo: 'curso' }
  } else if (
    doModulo &&
    doModulo.aulas.length > 1 &&
    doModulo.aulas.every((a) => depois.has(a.id))
  ) {
    marco = {
      tipo: 'modulo',
      moduloNome: doModulo.nome,
      faltam: todas.filter((id) => !depois.has(id)).length,
    }
  }
  return marco ? { marco, anel, percentual } : null
}

/**
 * Título da aula na lista: o código e a etiqueta de exercício do Memberkit ("A101 - [EXERCÍCIO] …")
 * saem da frente e viram um ícone, para o título começar pelo que importa.
 */
export function tituloNaLista(titulo: string): {
  titulo: string
  exercicio: boolean
} {
  const m = titulo.match(
    /^\s*(?:[A-Z]{0,3}\d+\s*[-–—]\s*)?\[\s*exerc[íi]cio\s*\]\s*(.*)$/i,
  )
  if (!m || !m[1].trim()) return { titulo, exercicio: false }
  return { titulo: m[1].trim(), exercicio: true }
}

/**
 * O rótulo do módulo no cabeçalho da aula: "Módulo 2: Nome". Quando o nome já começa com "Módulo N"
 * (ex.: "Módulo 1: Começando"), ele vale sozinho, sem repetir o prefixo.
 */
export function rotuloDoModulo(numero: number, nome: string): string {
  if (/^\s*m[óo]dulo\s+\d+/i.test(nome)) return nome.trim()
  return `Módulo ${numero}: ${nome}`
}
