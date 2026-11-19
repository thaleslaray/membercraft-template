// Resumo diário da Equipe (#61, user story 105): todo dia às 8h (Brasília) um e-mail com as filas
// que têm pendência. Sem pendência, não sai e-mail. Cada pessoa da equipe pode desligar o seu.

import { and, eq, gt, inArray } from 'drizzle-orm'
import { emailDesligado, envioDeEmail, user } from '#/db/schema'
import { primeiroNome } from '#/regras/email-modelos'
import {
  type ContadorDeFila,
  contarFilas,
  FILAS,
  type FilaDoPainel,
} from '#/regras/filas'
import { type Banco, comoLibsql, type Relogio } from '#/regras/tipos'

export const TIPO_DO_RESUMO = 'resumo-diario'
// Se o cron disparar duas vezes no mesmo dia, o segundo disparo não manda de novo.
const JANELA_ANTI_REPETICAO_MS = 20 * 3_600_000

/** Uma linha por fila com pendência; `null` quando não há nada esperando (nesse caso não sai e-mail). */
export function montarResumo(
  contadores: readonly ContadorDeFila[],
): string | null {
  const linhas = contadores
    .filter((c) => c.total > 0)
    .map(
      (c) => `${c.rotulo}: ${c.total}${c.destaque ? ` (${c.destaque})` : ''}`,
    )
  return linhas.length > 0 ? linhas.join('\n') : null
}

export async function resumoDiarioLigado(
  banco: Banco,
  userId: string,
): Promise<boolean> {
  const [desligado] = await comoLibsql(banco)
    .select({ userId: emailDesligado.userId })
    .from(emailDesligado)
    .where(
      and(
        eq(emailDesligado.userId, userId),
        eq(emailDesligado.tipo, TIPO_DO_RESUMO),
      ),
    )
  return !desligado
}

export async function definirResumoDiario(
  banco: Banco,
  agora: Relogio,
  entrada: { userId: string; ligado: boolean },
): Promise<void> {
  const db = comoLibsql(banco)
  if (entrada.ligado) {
    await db
      .delete(emailDesligado)
      .where(
        and(
          eq(emailDesligado.userId, entrada.userId),
          eq(emailDesligado.tipo, TIPO_DO_RESUMO),
        ),
      )
    return
  }
  await db
    .insert(emailDesligado)
    .values({
      userId: entrada.userId,
      tipo: TIPO_DO_RESUMO,
      desligadoEm: agora(),
    })
    .onConflictDoNothing()
}

export interface PedidoDoResumo {
  tipo: typeof TIPO_DO_RESUMO
  para: string
  userId: string
  variaveis: { nome: string; resumo: string; link: string }
}

/**
 * Pede o resumo a cada pessoa da equipe que não o desligou. Devolve quantos pediu (0 sem pendência).
 * `pedir` é o gancho que põe o e-mail na fila (`pedirEmail`); falha de uma pessoa não barra as outras.
 */
export async function enviarResumosDiarios(
  banco: Banco,
  agora: Relogio,
  entrada: {
    link: string
    pedir: (pedido: PedidoDoResumo) => Promise<unknown>
    filas?: readonly FilaDoPainel[]
  },
): Promise<number> {
  const db = comoLibsql(banco)
  const resumo = montarResumo(
    await contarFilas(banco, entrada.filas ?? FILAS, agora),
  )
  if (!resumo) return 0
  const equipe = await db
    .select({ id: user.id, nome: user.name, email: user.email })
    .from(user)
    .where(inArray(user.perfil, ['equipe', 'proprietario']))
  const desligaram = new Set(
    (
      await db
        .select({ userId: emailDesligado.userId })
        .from(emailDesligado)
        .where(eq(emailDesligado.tipo, TIPO_DO_RESUMO))
    ).map((l) => l.userId),
  )
  const recentes = new Set(
    (
      await db
        .select({ userId: envioDeEmail.userId })
        .from(envioDeEmail)
        .where(
          and(
            eq(envioDeEmail.tipo, TIPO_DO_RESUMO),
            gt(
              envioDeEmail.criadoEm,
              new Date(agora().getTime() - JANELA_ANTI_REPETICAO_MS),
            ),
          ),
        )
    ).map((l) => l.userId),
  )
  let pedidos = 0
  for (const pessoa of equipe) {
    if (desligaram.has(pessoa.id) || recentes.has(pessoa.id)) continue
    try {
      await entrada.pedir({
        tipo: TIPO_DO_RESUMO,
        para: pessoa.email,
        userId: pessoa.id,
        variaveis: {
          nome: primeiroNome(pessoa.nome),
          resumo,
          link: entrada.link,
        },
      })
      pedidos++
    } catch (erro) {
      console.error(`[resumo] não consegui pedir o resumo a ${pessoa.id}`, erro)
    }
  }
  return pedidos
}
