import type { DrizzleD1Database } from 'drizzle-orm/d1'
import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import type * as schema from '#/db/schema'

// Banco Drizzle SQLite assíncrono: o D1 em produção e o libsql em memória nos testes.
// Os módulos de regra recebem o banco por parâmetro e usam só o que os dois têm em comum
// (inclusive `db.batch`, a forma de escrever atômico no D1).
export type Banco =
  | DrizzleD1Database<typeof schema>
  | LibSQLDatabase<typeof schema>

// Relógio injetável: as regras nunca chamam `new Date()` direto.
export type Relogio = () => Date

// As regras escrevem com a API completa do Drizzle (`db.select`, `db.batch`...); o D1 e o libsql a têm
// igual, só os tipos divergem. Um só lugar faz a conversão.
export const comoLibsql = (banco: Banco) =>
  banco as LibSQLDatabase<typeof schema>
