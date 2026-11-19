import { eq, sql } from 'drizzle-orm'
import { avisoDeVenda, configuracaoDaArea, ligacaoDeVenda } from '#/db/schema'
import { type Banco, comoLibsql } from '#/regras/tipos'

/**
 * A Voomp só aparece em Vendas e Produtos quando está em uso (#146): a equipe ligou o interruptor
 * "Usar a Voomp" (aba Plataformas), ou já existe aviso ou ligação da Voomp.
 */
export function voompEmUso(entrada: {
  interruptor: boolean
  temAviso: boolean
  temLigacao: boolean
}): boolean {
  return entrada.interruptor || entrada.temAviso || entrada.temLigacao
}

/** Lê as três condições numa ida só ao banco. */
export async function situacaoDaVoomp(
  db: Banco,
): Promise<{ interruptor: boolean; emUso: boolean }> {
  const [linha] = await comoLibsql(db)
    .select({
      interruptor: sql<number>`coalesce((select ${configuracaoDaArea.voompLigada} from ${configuracaoDaArea} where ${eq(configuracaoDaArea.id, 'padrao')}), 0)`,
      temAviso: sql<number>`exists (select 1 from ${avisoDeVenda} where ${eq(avisoDeVenda.gateway, 'voomp')})`,
      temLigacao: sql<number>`exists (select 1 from ${ligacaoDeVenda} where ${eq(ligacaoDeVenda.gateway, 'voomp')})`,
    })
    .from(sql`(select 1)`)
  const interruptor = Boolean(linha?.interruptor)
  return {
    interruptor,
    emUso: voompEmUso({
      interruptor,
      temAviso: Boolean(linha?.temAviso),
      temLigacao: Boolean(linha?.temLigacao),
    }),
  }
}
