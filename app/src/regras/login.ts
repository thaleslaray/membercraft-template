import { eq } from 'drizzle-orm'

import { user } from '#/db/schema'
import type { Banco } from '#/regras/tipos'

export function normalizarEmail(email: string): string {
  return email.trim().toLowerCase()
}

// Só e-mail cadastrado (criado pela matrícula ou pela Equipe) recebe código.
export async function emailCadastrado(
  db: Banco,
  email: string,
): Promise<boolean> {
  const [achado] = await db
    .select()
    .from(user)
    .where(eq(user.email, normalizarEmail(email)))
  return Boolean(achado)
}

// Chave do limite de pedidos de código por e-mail (o limite por IP usa a chave padrão).
// Chave do limite de verificação do código por e-mail: escopo próprio, que não consome o limite
// de envio (`codigo-email`).
export function chaveDeLimiteDeVerificacao(email: string): string {
  return `verificar:${normalizarEmail(email)}`
}

export function chaveDeLimitePorEmail(email: string): string {
  return `codigo-email:${normalizarEmail(email)}`
}
