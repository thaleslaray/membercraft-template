// Coleta periódica do agrupamento de 15 minutos (#45), chamada pelo cron de 15 em 15 minutos.
// Cada gatilho que usa `adicionarAviso` tem um agrupador em `AGRUPADORES` (`agrupadores.ts`): a lista
// constante de quem transforma o grupo pronto em e-mail e/ou sininho. A `chave` do aviso começa com
// o prefixo do gatilho, ex.: `resposta-ao-comentario:<aluno>`.
//
// Grupo pronto sem agrupador NÃO é perdido: volta para a tabela com a hora original e sai quando o
// agrupador existir.

import { avisoAgrupado } from '#/db/schema'
import { coletarAvisosProntos, type GrupoDeAvisos } from '#/regras/agrupamento'
import type { DependenciasDosAvisos } from '#/regras/avisos-agendados'
import { type Banco, comoLibsql, type Relogio } from '#/regras/tipos'

export interface DependenciasDoAgrupamento extends DependenciasDosAvisos {
  /** Endereço da área (https://...), para os links dos e-mails. */
  baseDoApp: string
}

export type Agrupador = (
  grupo: GrupoDeAvisos,
  deps: DependenciasDoAgrupamento & { banco: Banco; agora: Relogio },
) => Promise<void>

/** Os agrupadores por prefixo da chave do aviso. */
export type Agrupadores = Readonly<Record<string, Agrupador>>

const prefixoDe = (chave: string) => chave.split(':')[0] ?? chave

export async function enviarAgrupamentosProntos(
  banco: Banco,
  agora: Relogio,
  deps: DependenciasDoAgrupamento,
  agrupadores: Agrupadores,
): Promise<{ enviados: number; devolvidos: number }> {
  const db = comoLibsql(banco)
  const grupos = await coletarAvisosProntos(banco, agora)
  let enviados = 0
  let devolvidos = 0
  for (const grupo of grupos) {
    const agrupador = agrupadores[prefixoDe(grupo.chave)]
    try {
      if (!agrupador) throw new Error(`sem agrupador para ${grupo.chave}`)
      await agrupador(grupo, { ...deps, banco, agora })
      enviados++
    } catch (erro) {
      console.error(`[agrupamento] ${grupo.chave} voltou para a fila`, erro)
      await db.insert(avisoAgrupado).values(
        grupo.avisos.map((a) => ({
          id: a.id,
          chave: a.chave,
          dados: JSON.stringify(a.dados),
          criadoEm: a.criadoEm,
        })),
      )
      devolvidos++
    }
  }
  return { enviados, devolvidos }
}
