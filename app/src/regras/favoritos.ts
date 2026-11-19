// Favoritos do aluno (#49): aulas marcadas com a estrela. Gravação idempotente: favoritar duas
// vezes é o mesmo registro. Só vale em curso que a pessoa acessa; se o acesso acaba, o favorito
// continua guardado mas deixa de aparecer (a lista é sempre filtrada pelos cursos acessíveis).

import { and, asc, eq, inArray, isNull } from 'drizzle-orm'
import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import type * as schema from '#/db/schema'
import { aula, curso, favorito, modulo } from '#/db/schema'
import { cursosAcessiveis } from '#/regras/acesso-ao-curso'
import { emLotes, entreOsIds } from '#/regras/lotes'
import type { Pessoa } from '#/regras/permissoes'
import { type Banco, comoLibsql, type Relogio } from '#/regras/tipos'

export class ErroDeFavorito extends Error {
  constructor(mensagem: string) {
    super(mensagem)
    this.name = 'ErroDeFavorito'
  }
}

async function cursoDaAula(db: LibSQLDatabase<typeof schema>, aulaId: string) {
  const [linha] = await db
    .select({ cursoId: modulo.cursoId })
    .from(aula)
    .innerJoin(modulo, eq(modulo.id, aula.moduloId))
    .innerJoin(curso, eq(curso.id, modulo.cursoId))
    .where(
      and(
        eq(aula.id, aulaId),
        isNull(aula.excluidoEm),
        isNull(modulo.excluidoEm),
        isNull(curso.excluidoEm),
      ),
    )
  return linha?.cursoId ?? null
}

export async function favoritar(
  banco: Banco,
  agora: Relogio,
  pessoa: Pessoa,
  aulaId: string,
): Promise<void> {
  const db = comoLibsql(banco)
  const cursoId = await cursoDaAula(db, aulaId)
  const acessiveis = await cursosAcessiveis(banco, agora, pessoa)
  if (!cursoId || (acessiveis !== 'todos' && !acessiveis.includes(cursoId))) {
    throw new ErroDeFavorito('Aula não encontrada.')
  }
  await db
    .insert(favorito)
    .values({ userId: pessoa.id, aulaId, criadoEm: agora() })
    .onConflictDoNothing()
}

// Desfavoritar também é idempotente: sem favorito, não há o que fazer.
export async function desfavoritar(
  banco: Banco,
  userId: string,
  aulaId: string,
): Promise<void> {
  await comoLibsql(banco)
    .delete(favorito)
    .where(and(eq(favorito.userId, userId), eq(favorito.aulaId, aulaId)))
}

/** Dentre as aulas dadas, as que o aluno favoritou. */
export async function favoritasEntre(
  banco: Banco,
  userId: string,
  aulaIds: string[],
): Promise<string[]> {
  if (aulaIds.length === 0) return []
  const linhas = await emLotes(aulaIds, (ids) =>
    comoLibsql(banco)
      .select({ aulaId: favorito.aulaId })
      .from(favorito)
      .where(and(eq(favorito.userId, userId), inArray(favorito.aulaId, ids))),
  )
  return linhas.map((l) => l.aulaId)
}

export interface AulaFavorita {
  aulaId: string
  titulo: string
  moduloNome: string
  cursoId: string
  cursoNome: string
  favoritadaEm: Date
}

// A página Favoritos: as mais recentes primeiro, só de cursos acessíveis e ainda existentes.
export async function listarFavoritos(
  banco: Banco,
  userId: string,
  cursosPermitidos: string[] | 'todos',
): Promise<AulaFavorita[]> {
  if (Array.isArray(cursosPermitidos) && cursosPermitidos.length === 0) {
    return []
  }
  const linhas = await comoLibsql(banco)
    .select({
      aulaId: aula.id,
      titulo: aula.titulo,
      moduloNome: modulo.nome,
      cursoId: curso.id,
      cursoNome: curso.nome,
      favoritadaEm: favorito.criadoEm,
    })
    .from(favorito)
    .innerJoin(aula, eq(aula.id, favorito.aulaId))
    .innerJoin(modulo, eq(modulo.id, aula.moduloId))
    .innerJoin(curso, eq(curso.id, modulo.cursoId))
    .where(
      and(
        eq(favorito.userId, userId),
        isNull(aula.excluidoEm),
        isNull(modulo.excluidoEm),
        isNull(curso.excluidoEm),
        Array.isArray(cursosPermitidos)
          ? entreOsIds(curso.id, cursosPermitidos)
          : undefined,
      ),
    )
    .orderBy(asc(favorito.criadoEm))
  return linhas.reverse()
}
