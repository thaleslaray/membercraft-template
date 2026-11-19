// Marcos que as rotinas de aviso guardam entre uma execução e outra (`estado_de_aviso`): o último
// instante de liberação já processado, a última contagem de uma fila... Um só lugar para ler e gravar.
import { eq } from 'drizzle-orm'
import { estadoDeAviso } from '#/db/schema'
import { type Banco, comoLibsql, type Relogio } from '#/regras/tipos'

/** O número guardado para a chave, ou nulo se a rotina nunca gravou. */
export async function lerEstadoDeAviso(
  banco: Banco,
  chave: string,
): Promise<number | null> {
  const [linha] = await comoLibsql(banco)
    .select()
    .from(estadoDeAviso)
    .where(eq(estadoDeAviso.chave, chave))
  return linha?.numero ?? null
}

/** O comando que grava (ou troca) o número da chave, para entrar num `db.batch` com outras escritas. */
export function prepararEstadoDeAviso(
  banco: Banco,
  agora: Relogio,
  chave: string,
  numero: number,
) {
  const quando = agora()
  return comoLibsql(banco)
    .insert(estadoDeAviso)
    .values({ chave, numero, atualizadoEm: quando })
    .onConflictDoUpdate({
      target: estadoDeAviso.chave,
      set: { numero, atualizadoEm: quando },
    })
}

export async function gravarEstadoDeAviso(
  banco: Banco,
  agora: Relogio,
  chave: string,
  numero: number,
): Promise<void> {
  await prepararEstadoDeAviso(banco, agora, chave, numero)
}
