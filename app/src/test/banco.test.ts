import { sql } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { user } from '#/db/schema'
import type { Banco } from '#/regras/tipos'
import { criarBancoDeTeste } from '#/test/banco'

function novoUsuario(id: string) {
  return {
    id,
    name: id,
    email: `${id}@exemplo.test`,
  }
}

describe('criarBancoDeTeste', () => {
  it('tem as tabelas do Better Auth depois das migrações', async () => {
    const db = await criarBancoDeTeste()
    const linhas = await db.all<{ name: string }>(
      sql`select name from sqlite_master where type = 'table'`,
    )
    const nomes = linhas.map((l) => l.name)
    for (const tabela of ['user', 'session', 'account', 'verification']) {
      expect(nomes).toContain(tabela)
    }
  })

  it('o banco de teste serve como o tipo Banco das regras', async () => {
    const db: Banco = await criarBancoDeTeste()
    expect(db).toBeDefined()
  })

  it('db.batch de leitura recusa colunas de mesmo nome no resultado, como o D1', async () => {
    const db = await criarBancoDeTeste()
    // `user.id` e `session.id` chegariam como a mesma chave `id` no D1 e as linhas sairiam deslocadas.
    await expect(
      db.batch([db.select({ a: user.id, b: user.id }).from(user)]),
    ).rejects.toThrow(/coluna repetida/)
    // Com apelido, passa.
    await expect(
      db.batch([
        db
          .select({ a: user.id, b: sql<string>`${user.id}`.as('outro_id') })
          .from(user),
      ]),
    ).resolves.toBeDefined()
  })

  it('db.batch grava as duas escritas', async () => {
    const db = await criarBancoDeTeste()
    await db.batch([
      db.insert(user).values(novoUsuario('a')),
      db.insert(user).values(novoUsuario('b')),
    ])
    const ids = (await db.select().from(user)).map((u) => u.id).sort()
    expect(ids).toEqual(['a', 'b'])
  })

  it('dois bancos são isolados entre si', async () => {
    const um = await criarBancoDeTeste()
    const outro = await criarBancoDeTeste()
    await um.insert(user).values(novoUsuario('so-no-um'))
    expect(await um.select().from(user)).toHaveLength(1)
    expect(await outro.select().from(user)).toHaveLength(0)
  })
})
