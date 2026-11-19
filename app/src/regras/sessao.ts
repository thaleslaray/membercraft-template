import { lt } from 'drizzle-orm'
import { session, verification } from '#/db/schema'
import type { Perfil } from '#/regras/permissoes'
import { type Banco, comoLibsql, type Relogio } from '#/regras/tipos'

const DIA_MS = 86_400_000

// Aluno 30 dias (renova com o uso, em vários aparelhos); Equipe e Proprietário 7 dias.
export function diasDeSessao(perfil: Perfil): number {
  return perfil === 'aluno' ? 30 : 7
}

export function expiracaoDaSessao(perfil: Perfil, agora: Date): Date {
  return new Date(agora.getTime() + diasDeSessao(perfil) * DIA_MS)
}

/**
 * A sessão já passou 1 dia de uso desde a última renovação, SEGUNDO O PRAZO DO PERFIL? É a regra
 * "renova a cada 1 dia de uso" do Better Auth (`expiresAt - expiresIn + updateAge <= agora`), mas com o
 * `expiresIn` do perfil (aluno 30 dias, Equipe 7) em vez do teto global de 30. Com o teto global a conta
 * dava "renovar" em TODA leitura da Equipe (a sessão dela vence em 7 dias, então `expiresAt - 30 dias`
 * já está no passado) e cada pedido regravava a sessão no D1.
 */
export function precisaRenovar(
  perfil: Perfil,
  expiresAt: Date,
  agora: Date,
): boolean {
  return (
    expiresAt.getTime() - diasDeSessao(perfil) * DIA_MS + DIA_MS <=
    agora.getTime()
  )
}

/**
 * Nova validade quando o Better Auth renova a sessão (ele propõe agora + 30 dias, o teto global dele).
 * O prazo vem do perfil: aluno 30 dias, Equipe 7. Sem saber o perfil (o contexto do pedido veio
 * vazio), vale o menor: nunca mais que 7 dias, para a sessão da Equipe nunca voltar a 30.
 */
export function expiracaoNaRenovacao(
  perfil: Perfil | undefined,
  agora: Date,
  proposta?: Date,
): Date {
  if (perfil) return expiracaoDaSessao(perfil, agora)
  const teto = expiracaoDaSessao('equipe', agora)
  return proposta && proposta < teto ? proposta : teto
}

/** Apaga sessões e códigos de verificação (OTP, links) já expirados, de uma vez (`db.batch`). */
export async function limparExpirados(
  banco: Banco,
  agora: Relogio,
): Promise<{ sessoes: number; verificacoes: number }> {
  const db = comoLibsql(banco)
  const agoraMesmo = agora()
  const [sessoes, verificacoes] = await db.batch([
    db
      .delete(session)
      .where(lt(session.expiresAt, agoraMesmo))
      .returning({ id: session.id }),
    db
      .delete(verification)
      .where(lt(verification.expiresAt, agoraMesmo))
      .returning({ id: verification.id }),
  ])
  return { sessoes: sessoes.length, verificacoes: verificacoes.length }
}
