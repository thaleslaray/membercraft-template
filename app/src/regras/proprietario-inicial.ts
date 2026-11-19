import { eq } from 'drizzle-orm'

import { user } from '#/db/schema'
import { normalizarEmail } from '#/regras/login'
import type { Banco } from '#/regras/tipos'

// Instalação nova (banco sem Proprietário): o e-mail do segredo PROPRIETARIO_INICIAL (de cada instalação, fora do git) vira o primeiro
// Proprietário (cria a conta ou promove a existente). Com qualquer Proprietário no banco, ou variável
// vazia, não faz nada. Devolve se agiu.
export async function garantirProprietarioInicial(
  db: Banco,
  emailPedido: string,
  emailConfigurado: string | undefined,
): Promise<boolean> {
  const configurado = normalizarEmail(emailConfigurado ?? '')
  const email = normalizarEmail(emailPedido)
  if (!configurado || configurado !== email) return false

  const [dono] = await db
    .select()
    .from(user)
    .where(eq(user.perfil, 'proprietario'))
    .limit(1)
  if (dono) return false

  const [conta] = await db.select().from(user).where(eq(user.email, email))
  if (conta) {
    await db
      .update(user)
      .set({ perfil: 'proprietario' })
      .where(eq(user.id, conta.id))
    return true
  }
  await db.insert(user).values({
    id: crypto.randomUUID(),
    name: email.split('@')[0],
    email,
    perfil: 'proprietario',
    emailVerified: false,
  })
  return true
}
