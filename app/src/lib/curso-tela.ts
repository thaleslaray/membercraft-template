// Regras de tela da página do curso, puras (sem banco): o botão principal e quais módulos abrem.

type ModuloDaTela = { id: string; aulas: { id: string; titulo?: string }[] }

export type BotaoDoCurso =
  | { tipo: 'aula'; aulaId: string; rotulo: string }
  | { tipo: 'certificado'; rotulo: string }

/**
 * O botão principal do curso, pelo estado da aluna: "Começar: <aula>" se nunca abriu, "Continuar: <aula>"
 * se está no meio, "Ver certificado" se terminou e há prévia para ver, "Rever o curso" se terminou sem ela.
 */
export function botaoDoCurso({
  modulos,
  passo,
  certificadoPronto,
}: {
  modulos: ModuloDaTela[]
  passo: { jaComecou: boolean; proximaAulaId: string | null } | null
  certificadoPronto: boolean
}): BotaoDoCurso | null {
  const aulas = modulos.flatMap((m) => m.aulas)
  const primeira = aulas[0]
  if (!primeira) return null
  const tituloDe = (id: string) => aulas.find((a) => a.id === id)?.titulo ?? ''
  const proximaId = passo?.proximaAulaId ?? null
  if (proximaId) {
    const verbo = passo?.jaComecou ? 'Continuar' : 'Começar'
    return {
      tipo: 'aula',
      aulaId: proximaId,
      rotulo: `${verbo}: ${tituloDe(proximaId)}`,
    }
  }
  if (!passo) {
    return {
      tipo: 'aula',
      aulaId: primeira.id,
      rotulo: `Começar: ${primeira.titulo ?? ''}`,
    }
  }
  if (certificadoPronto) {
    return { tipo: 'certificado', rotulo: 'Ver certificado' }
  }
  return { tipo: 'aula', aulaId: primeira.id, rotulo: 'Rever o curso' }
}

/** Módulos que começam abertos: os não concluídos e sempre o da próxima aula. */
export function modulosAbertos(
  modulos: ModuloDaTela[],
  concluidas: readonly string[],
  proximaAulaId: string | null,
): string[] {
  const feitas = new Set(concluidas)
  return modulos
    .filter((m) => {
      if (proximaAulaId && m.aulas.some((a) => a.id === proximaAulaId))
        return true
      const concluido =
        m.aulas.length > 0 && m.aulas.every((a) => feitas.has(a.id))
      return !concluido
    })
    .map((m) => m.id)
}
