// Meus cursos (#102): as regras puras da página inicial da aluna. Sem banco, sem tela: recebem os
// dados que a vitrine e o progresso já leem e devolvem o que a página mostra.

export type SituacaoDoCurso = 'em-andamento' | 'para-comecar' | 'concluido'

/** Uma aula de um curso, na ordem do curso (módulo e depois aula). */
export interface AulaDoCurso {
  cursoId: string
  moduloId: string
  moduloNome: string
  aulaId: string
  titulo: string
}

/** Concluído quando todas as aulas estão feitas; em andamento com qualquer aula feita ou aberta. */
export function situacaoDoCurso(p: {
  total: number
  feitas: number
  comecou: boolean
}): SituacaoDoCurso {
  if (p.total > 0 && p.feitas >= p.total) return 'concluido'
  if (p.feitas > 0 || p.comecou) return 'em-andamento'
  return 'para-comecar'
}

export interface GruposPorSituacao<T> {
  emAndamento: T[]
  paraComecar: T[]
  concluidos: T[]
  /** Cursos que a aluna não tem (os "para todos" e os de acesso expirado). */
  semAcesso: T[]
}

/**
 * Reparte os cursos (já na ordem da categoria e da posição) por situação. A ordem de entrada vale
 * dentro de cada grupo: as categorias ordenam, mas não aparecem como título.
 */
export function agruparPorSituacao<
  T extends { id: string; bloqueado: boolean },
>(
  cursos: T[],
  situacoes: Record<string, SituacaoDoCurso>,
): GruposPorSituacao<T> {
  const grupos: GruposPorSituacao<T> = {
    emAndamento: [],
    paraComecar: [],
    concluidos: [],
    semAcesso: [],
  }
  for (const c of cursos) {
    if (c.bloqueado) {
      grupos.semAcesso.push(c)
      continue
    }
    const s = situacoes[c.id] ?? 'para-comecar'
    if (s === 'em-andamento') grupos.emAndamento.push(c)
    else if (s === 'concluido') grupos.concluidos.push(c)
    else grupos.paraComecar.push(c)
  }
  return grupos
}

/**
 * A aula para onde o curso leva: a última aberta se ainda está pendente, senão a próxima pendente
 * depois dela, senão a primeira pendente. `abertas` guarda quando cada aula foi aberta (maior = mais
 * recente). `liberadas`, quando vem, tira o que a aluna não pode abrir. Nulo com o curso concluído.
 */
export function proximaAulaDoCurso(
  aulas: AulaDoCurso[],
  concluidas: ReadonlySet<string>,
  abertas: ReadonlyMap<string, number>,
  liberadas?: ReadonlySet<string>,
): AulaDoCurso | null {
  const pendente = (a: AulaDoCurso) =>
    !concluidas.has(a.aulaId) && (!liberadas || liberadas.has(a.aulaId))
  let ultima: string | null = null
  let quando = -Infinity
  for (const [aulaId, t] of abertas) {
    if (t > quando) {
      quando = t
      ultima = aulaId
    }
  }
  const posicao = ultima ? aulas.findIndex((a) => a.aulaId === ultima) : -1
  return (
    (posicao >= 0 && pendente(aulas[posicao]) ? aulas[posicao] : null) ??
    aulas.slice(posicao + 1).find(pendente) ??
    aulas.find(pendente) ??
    null
  )
}

export interface ProgressoParaMeusCursos {
  aulas: AulaDoCurso[]
  concluidas: ReadonlySet<string>
  abertas: ReadonlyMap<string, number>
}

export type CursoDoCartao<T> = T & {
  percentual: number
  feitas: number
  total: number
  /** Para onde o cartão leva; nulo com o curso concluído. */
  proxima: { aulaId: string; titulo: string } | null
}

export interface DestaqueDeMeusCursos<T> {
  curso: CursoDoCartao<T>
  aulaId: string
  aulaTitulo: string
  moduloNome: string
  /** Aulas do módulo ainda por concluir (a atual conta). */
  faltam: number
}

/**
 * A página Meus cursos: os cartões por situação e o destaque (a próxima aula do curso aberto por
 * último, entre as que a aluna pode abrir). `liberadas` tira o que está com cadeado ou oculto.
 */
export function montarMeusCursos<T extends { id: string; bloqueado: boolean }>(
  cursos: T[],
  dados: ProgressoParaMeusCursos,
  liberadas?: ReadonlySet<string>,
): {
  grupos: GruposPorSituacao<CursoDoCartao<T>>
  destaque: DestaqueDeMeusCursos<T> | null
} {
  const aulasPorCurso = new Map<string, AulaDoCurso[]>()
  for (const a of dados.aulas) {
    const lista = aulasPorCurso.get(a.cursoId)
    if (lista) lista.push(a)
    else aulasPorCurso.set(a.cursoId, [a])
  }
  const situacoes: Record<string, SituacaoDoCurso> = {}
  const cartoes = cursos.map((c): CursoDoCartao<T> => {
    const aulas = aulasPorCurso.get(c.id) ?? []
    const feitas = aulas.filter((a) => dados.concluidas.has(a.aulaId)).length
    const abertas = new Map(
      aulas
        .filter((a) => dados.abertas.has(a.aulaId))
        .map((a) => [a.aulaId, dados.abertas.get(a.aulaId) as number]),
    )
    const total = aulas.length
    situacoes[c.id] = situacaoDoCurso({
      total,
      feitas,
      // Só abrir uma aula não põe o curso em andamento: o cartão ainda diria "Começar".
      comecou: feitas > 0,
    })
    const proxima = proximaAulaDoCurso(
      aulas,
      dados.concluidas,
      abertas,
      liberadas,
    )
    return {
      ...c,
      feitas,
      total,
      percentual: total === 0 ? 0 : Math.floor((feitas / total) * 100),
      proxima: proxima
        ? { aulaId: proxima.aulaId, titulo: proxima.titulo }
        : null,
    }
  })

  const doCurso = new Map(cartoes.map((c) => [c.id, c]))
  // O curso com a aula aberta mais recente vem primeiro; o destaque é a próxima aula desse curso, a
  // mesma do cartão. Só conta curso em que a aluna já concluiu alguma aula: entrar num curso e abrir
  // uma aula não muda o destaque (senão um clique de curiosidade tira o curso principal da frente).
  // Curso concluído passa a vez.
  const recencia = new Map<string, number>()
  for (const a of dados.aulas) {
    const t = dados.abertas.get(a.aulaId)
    if (t !== undefined && t > (recencia.get(a.cursoId) ?? -Infinity)) {
      recencia.set(a.cursoId, t)
    }
  }
  const escolhido = [...recencia.entries()]
    .sort((x, y) => y[1] - x[1])
    .map(([cursoId]) => doCurso.get(cursoId))
    .find((c) => c && !c.bloqueado && c.proxima && c.feitas > 0)
  const proximaAula = escolhido?.proxima
  const modulo =
    escolhido && proximaAula
      ? faltamNoModulo(
          aulasPorCurso.get(escolhido.id) ?? [],
          dados.concluidas,
          proximaAula.aulaId,
        )
      : null
  return {
    grupos: agruparPorSituacao(cartoes, situacoes),
    destaque:
      escolhido && proximaAula && modulo
        ? {
            curso: escolhido,
            aulaId: proximaAula.aulaId,
            aulaTitulo: proximaAula.titulo,
            moduloNome: modulo.moduloNome,
            faltam: modulo.faltam,
          }
        : null,
  }
}

/** Menor largura (em %) com que a barra desenha o progresso de quem já concluiu alguma aula. */
export const LARGURA_MINIMA_DA_BARRA = 2

/**
 * Largura da barra de progresso. Quem concluiu ao menos uma aula sempre vê um traço (1 de 300 aulas
 * dá 0% arredondado, e a barra pareceria vazia); sem aula feita, a barra fica vazia.
 */
export function larguraDaBarra(percentual: number, feitas: number): number {
  const pct = Math.min(100, Math.max(0, percentual))
  return feitas > 0 ? Math.max(pct, LARGURA_MINIMA_DA_BARRA) : 0
}

export type RotuloDoProgresso =
  | { tipo: 'novo'; texto: 'Novo' }
  | { tipo: 'concluido'; texto: 'Concluído' }
  | { tipo: 'andamento'; texto: string }

/**
 * O que o cartão escreve ao lado da barra. "Novo" é quando nenhuma aula foi concluída (e não quando
 * o percentual arredondado dá 0); "Concluído" quando todas foram; senão o percentual.
 */
export function rotuloDoProgresso(p: {
  feitas: number
  total: number
  percentual: number
}): RotuloDoProgresso {
  if (p.feitas === 0) return { tipo: 'novo', texto: 'Novo' }
  if (p.total > 0 && p.feitas >= p.total) {
    return { tipo: 'concluido', texto: 'Concluído' }
  }
  return { tipo: 'andamento', texto: `${p.percentual}%` }
}

/** O módulo da aula e quantas aulas dele ainda faltam para fechá-lo. */
export function faltamNoModulo(
  aulas: AulaDoCurso[],
  concluidas: ReadonlySet<string>,
  aulaId: string,
): { moduloNome: string; faltam: number } | null {
  const a = aulas.find((x) => x.aulaId === aulaId)
  if (!a) return null
  const faltam = aulas.filter(
    (x) => x.moduloId === a.moduloId && !concluidas.has(x.aulaId),
  ).length
  return { moduloNome: a.moduloNome, faltam }
}

/**
 * Para onde "Continuar estudando" leva: a aula do destaque; sem ele, a próxima aula do primeiro curso
 * em andamento (e depois dos para começar) que ainda tenha uma. Nulo quando não há o que estudar: o
 * botão então leva a Meus cursos.
 */
export function proximaAulaParaEstudar(m: {
  destaque: { aulaId: string } | null
  grupos: {
    emAndamento: { proxima: { aulaId: string } | null }[]
    paraComecar: { proxima: { aulaId: string } | null }[]
  }
}): string | null {
  if (m.destaque) return m.destaque.aulaId
  const curso = [...m.grupos.emAndamento, ...m.grupos.paraComecar].find(
    (c) => c.proxima,
  )
  return curso?.proxima?.aulaId ?? null
}
