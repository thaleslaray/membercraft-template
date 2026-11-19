import { eq } from 'drizzle-orm'

import { user } from '#/db/schema'
import type { Banco, Relogio } from '#/regras/tipos'

export async function concluirPrimeiroAcesso(
  db: Banco,
  agora: Relogio,
  userId: string,
  entrada: { nome?: string; aceitouTermos: boolean; versaoDosTermos: string },
): Promise<void> {
  if (!entrada.aceitouTermos) {
    throw new Error('É preciso aceitar os termos de uso para continuar.')
  }
  const [atual] = await db.select().from(user).where(eq(user.id, userId))
  if (!atual) throw new Error('Usuário não encontrado.')

  const nome = atual.name.trim() ? atual.name : (entrada.nome ?? '').trim()
  if (!nome) throw new Error('Informe o seu nome para continuar.')

  const quando = agora()
  await db
    .update(user)
    .set({
      name: nome,
      termosVersao: entrada.versaoDosTermos,
      termosAceitoEm: quando,
      updatedAt: quando,
    })
    .where(eq(user.id, userId))
}

export {
  type Pendencias,
  pendenciasDoPrimeiroAcesso,
} from '#/regras/primeiro-acesso-pendencias'
