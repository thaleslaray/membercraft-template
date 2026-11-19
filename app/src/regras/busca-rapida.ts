// Busca rápida (⌘K, #100): a mesma regra da página de busca (`buscar`), agrupada em Cursos, Módulos,
// Aulas e "Falado no vídeo" e com limite por grupo (a contagem continua inteira). Sem termo, a janela
// mostra as últimas aulas abertas.

import { and, desc, eq, isNull } from 'drizzle-orm'
import { aula, curso, modulo, progressoDaAula } from '#/db/schema'
import {
  buscar,
  type OpcoesDaBusca,
  type ResultadoDaBusca,
} from '#/regras/busca'
import {
  type GrupoDaBuscaRapida,
  type ItemDaBuscaRapida,
  LIMITE_DAS_ULTIMAS,
  LIMITE_POR_GRUPO,
  MINIMO_DA_BUSCA_RAPIDA,
  type RespostaDaBuscaRapida,
  type UltimaAulaAberta,
} from '#/regras/busca-rapida-tipos'
import { entreOsIds } from '#/regras/lotes'
import { type Banco, comoLibsql } from '#/regras/tipos'

export interface OpcoesDaBuscaRapida extends Omit<OpcoesDaBusca, 'filtro'> {
  /** Limite único para todos os grupos; sem ele vale `LIMITE_POR_GRUPO` de cada grupo. */
  limitePorGrupo?: number
}

function vazia(termo: string): RespostaDaBuscaRapida {
  return {
    termo,
    contagem: { cursos: 0, modulos: 0, aulas: 0, falados: 0 },
    grupos: { cursos: [], modulos: [], aulas: [], falados: [] },
  }
}

function item(
  grupo: GrupoDaBuscaRapida,
  r: ResultadoDaBusca,
  tempo: number | null,
): ItemDaBuscaRapida {
  return {
    grupo,
    cursoId: r.cursoId,
    cursoNome: r.cursoNome,
    moduloNome: r.moduloNome,
    aulaId: r.aulaId,
    titulo: r.titulo,
    tempo,
    favorita: r.favorita,
    bloqueio: r.bloqueio,
  }
}

export async function buscaRapida(
  banco: Banco,
  { limitePorGrupo, ...opcoes }: OpcoesDaBuscaRapida,
): Promise<RespostaDaBuscaRapida> {
  const termo = opcoes.termo.trim()
  if (termo.length < MINIMO_DA_BUSCA_RAPIDA) return vazia(termo)
  const { resultados } = await buscar(banco, { ...opcoes, filtro: 'todos' })

  const todos: Record<GrupoDaBuscaRapida, ItemDaBuscaRapida[]> = {
    cursos: [],
    modulos: [],
    aulas: [],
    falados: [],
  }
  for (const r of resultados) {
    if (r.tipo === 'curso') todos.cursos.push(item('cursos', r, null))
    else if (r.tipo === 'modulo') todos.modulos.push(item('modulos', r, null))
    else {
      // Aula achada só pela fala não é "Aula": é "Falado no vídeo", no minuto.
      if (r.tempo === null) todos.aulas.push(item('aulas', r, null))
      if (r.falaEm !== null) todos.falados.push(item('falados', r, r.falaEm))
    }
  }
  return {
    termo,
    contagem: {
      cursos: todos.cursos.length,
      modulos: todos.modulos.length,
      aulas: todos.aulas.length,
      falados: todos.falados.length,
    },
    grupos: {
      cursos: todos.cursos.slice(0, limitePorGrupo ?? LIMITE_POR_GRUPO.cursos),
      modulos: todos.modulos.slice(
        0,
        limitePorGrupo ?? LIMITE_POR_GRUPO.modulos,
      ),
      aulas: todos.aulas.slice(0, limitePorGrupo ?? LIMITE_POR_GRUPO.aulas),
      falados: todos.falados.slice(
        0,
        limitePorGrupo ?? LIMITE_POR_GRUPO.falados,
      ),
    },
  }
}

export interface OpcoesDasUltimas {
  userId: string
  cursosPermitidos: string[] | 'todos'
  limite?: number
  bloqueioDaAula?: (aulaId: string) => string | null
  aulaOculta?: (aulaId: string) => boolean
  moduloOculto?: (moduloId: string) => boolean
}

/** As aulas abertas por último (até 5): só de curso acessível, sem excluído nem oculto. */
export async function ultimasAulasAbertas(
  banco: Banco,
  opcoes: OpcoesDasUltimas,
): Promise<UltimaAulaAberta[]> {
  const { cursosPermitidos, limite = LIMITE_DAS_ULTIMAS } = opcoes
  if (Array.isArray(cursosPermitidos) && cursosPermitidos.length === 0) {
    return []
  }
  const linhas = await comoLibsql(banco)
    .select({
      aulaId: aula.id,
      titulo: aula.titulo,
      moduloId: modulo.id,
      moduloNome: modulo.nome,
      cursoId: curso.id,
      cursoNome: curso.nome,
    })
    .from(progressoDaAula)
    .innerJoin(aula, eq(aula.id, progressoDaAula.aulaId))
    .innerJoin(modulo, eq(modulo.id, aula.moduloId))
    .innerJoin(curso, eq(curso.id, modulo.cursoId))
    .where(
      and(
        eq(progressoDaAula.userId, opcoes.userId),
        isNull(aula.excluidoEm),
        isNull(modulo.excluidoEm),
        isNull(curso.excluidoEm),
        Array.isArray(cursosPermitidos)
          ? entreOsIds(curso.id, cursosPermitidos)
          : undefined,
      ),
    )
    .orderBy(desc(progressoDaAula.abertaEm))
  return linhas
    .filter(
      (l) =>
        !opcoes.aulaOculta?.(l.aulaId) && !opcoes.moduloOculto?.(l.moduloId),
    )
    .slice(0, limite)
    .map((l) => ({
      aulaId: l.aulaId,
      titulo: l.titulo,
      cursoId: l.cursoId,
      cursoNome: l.cursoNome,
      moduloNome: l.moduloNome,
      bloqueio: opcoes.bloqueioDaAula?.(l.aulaId) ?? null,
    }))
}
