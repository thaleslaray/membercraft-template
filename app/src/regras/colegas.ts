// "N colegas assistiram esta semana" (#105): alunos distintos que abriram a aula nos últimos 7 dias.
// Só número agregado, nunca quem. A Equipe e quem está olhando não entram; abaixo do mínimo, nada.
// Uma consulta agregada, servida pelo índice (aula, aberta_em): não varre o progresso inteiro.

import { and, eq, gte, ne, sql } from 'drizzle-orm'
import { progressoDaAula, user } from '#/db/schema'
import { type Banco, comoLibsql, type Relogio } from '#/regras/tipos'

/** Abaixo disso o número identificaria gente: não aparece. */
export const MINIMO_DE_COLEGAS = 3
const JANELA_EM_DIAS = 7

/** Quantos colegas abriram a aula na semana; `null` se forem menos que o mínimo. */
export async function colegasDaSemana(
  db: Banco,
  agora: Relogio,
  aulaId: string,
  userId: string,
): Promise<number | null> {
  const desde = new Date(agora().getTime() - JANELA_EM_DIAS * 86_400_000)
  const [linha] = await comoLibsql(db)
    .select({ total: sql<number>`count(*)` })
    .from(progressoDaAula)
    .innerJoin(user, eq(user.id, progressoDaAula.userId))
    .where(
      and(
        eq(progressoDaAula.aulaId, aulaId),
        gte(progressoDaAula.abertaEm, desde),
        eq(user.perfil, 'aluno'),
        ne(progressoDaAula.userId, userId),
      ),
    )
  const total = Number(linha?.total ?? 0)
  return total >= MINIMO_DE_COLEGAS ? total : null
}

export function textoDosColegas(total: number): string {
  return `${total} colegas assistiram esta semana`
}
