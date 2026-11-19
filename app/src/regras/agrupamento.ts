// Agrupamento de 15 minutos: avisos da mesma `chave` (ex.: `resposta-ao-comentario:<aluno>`) que
// chegam dentro da janela viram UM e-mail. A janela começa no primeiro aviso da chave; quando ele
// completa 15 minutos, todos os avisos da chave saem juntos.
//
// Uso pelas fatias de gatilho (#46 comentários, #47 Atendimento, #58 certificado):
//   1. `adicionarAviso(banco, agora, { chave, dados })` a cada evento;
//   2. numa rotina a cada poucos minutos, `coletarAvisosProntos(banco, agora)` devolve os grupos
//      prontos (e já os tira da tabela) e quem chamou pede UM e-mail por grupo com `enfileirarEmail`.

import { asc, inArray } from 'drizzle-orm'
import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import type * as schema from '#/db/schema'
import { avisoAgrupado } from '#/db/schema'
import { emPedacos } from '#/regras/lotes'
import type { Banco, Relogio } from '#/regras/tipos'

export const JANELA_DE_AGRUPAMENTO_MS = 15 * 60 * 1000

export interface Aviso {
  id: string
  chave: string
  dados: Record<string, unknown>
  criadoEm: Date
}

export interface GrupoDeAvisos {
  chave: string
  /** Do mais antigo para o mais novo. */
  avisos: Aviso[]
}

/** Regra pura: quais grupos já completaram a janela. */
export function separarProntos(
  avisos: Aviso[],
  agora: Date,
  janelaMs = JANELA_DE_AGRUPAMENTO_MS,
): GrupoDeAvisos[] {
  const porChave = new Map<string, Aviso[]>()
  for (const aviso of avisos) {
    if (aviso.criadoEm.getTime() > agora.getTime()) continue
    const grupo = porChave.get(aviso.chave) ?? []
    grupo.push(aviso)
    porChave.set(aviso.chave, grupo)
  }
  const prontos: GrupoDeAvisos[] = []
  for (const [chave, grupo] of porChave) {
    grupo.sort((a, b) => a.criadoEm.getTime() - b.criadoEm.getTime())
    const primeiro = grupo[0] as Aviso
    if (agora.getTime() - primeiro.criadoEm.getTime() >= janelaMs) {
      prontos.push({ chave, avisos: grupo })
    }
  }
  return prontos
}

export async function adicionarAviso(
  banco: Banco,
  agora: Relogio,
  entrada: { chave: string; dados?: Record<string, unknown> },
): Promise<void> {
  const db = banco as LibSQLDatabase<typeof schema>
  await db.insert(avisoAgrupado).values({
    id: crypto.randomUUID(),
    chave: entrada.chave,
    dados: JSON.stringify(entrada.dados ?? {}),
    criadoEm: agora(),
  })
}

/** Devolve os grupos prontos e os apaga da tabela (quem apagar primeiro leva: sem envio em dobro). */
export async function coletarAvisosProntos(
  banco: Banco,
  agora: Relogio,
  janelaMs = JANELA_DE_AGRUPAMENTO_MS,
  /** Cada gatilho coleta só as suas chaves; sem filtro, coleta todas. */
  daChave: (chave: string) => boolean = () => true,
): Promise<GrupoDeAvisos[]> {
  const db = banco as LibSQLDatabase<typeof schema>
  const hoje = agora()
  const linhas = await db
    .select()
    .from(avisoAgrupado)
    .orderBy(asc(avisoAgrupado.criadoEm))
  const prontos = separarProntos(
    linhas
      .filter((l) => daChave(l.chave))
      .map((l) => ({
        id: l.id,
        chave: l.chave,
        dados: JSON.parse(l.dados) as Record<string, unknown>,
        criadoEm: l.criadoEm,
      })),
    hoje,
    janelaMs,
  )
  const ids = prontos.flatMap((g) => g.avisos.map((a) => a.id))
  const meus = new Set<string>()
  for (const pedaco of emPedacos(ids)) {
    const apagados = await db
      .delete(avisoAgrupado)
      .where(inArray(avisoAgrupado.id, pedaco))
      .returning({ id: avisoAgrupado.id })
    for (const a of apagados) meus.add(a.id)
  }
  return prontos
    .map((g) => ({ ...g, avisos: g.avisos.filter((a) => meus.has(a.id)) }))
    .filter((g) => g.avisos.length > 0)
}
