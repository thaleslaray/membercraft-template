import { gunzipSync } from 'node:zlib'
import { sql } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import {
  copiarBancoParaDeposito,
  type Deposito,
  descompactarCopia,
  gerarCopiaSql,
  podarCopiasAntigas,
} from '#/regras/copia-diaria'
import { criarBancoDeTeste } from '#/test/banco'

function depositoEmMemoria(): Deposito & { objetos: Map<string, Uint8Array> } {
  const objetos = new Map<string, Uint8Array>()
  return {
    objetos,
    async put(chave, corpo) {
      objetos.set(
        chave,
        new Uint8Array(await new Response(corpo).arrayBuffer()),
      )
    },
    async list({ prefix }) {
      return [...objetos.keys()].filter((k) => k.startsWith(prefix))
    },
    async delete(chaves) {
      for (const c of chaves) objetos.delete(c)
    },
  }
}

async function bancoComDados() {
  const db = await criarBancoDeTeste()
  await db.run(
    sql.raw(
      `insert into "user" (id, name, email, email_verified) values ('u1', 'Ana d''Ávila', 'ana@exemplo.com', 1)`,
    ),
  )
  return db
}

describe('gerarCopiaSql', () => {
  it('gera INSERTs que recriam os dados em outro banco', async () => {
    const origem = await bancoComDados()
    const copia = await gerarCopiaSql(origem)
    const destino = await criarBancoDeTeste()
    // Como o D1 aplica o arquivo: tudo numa transação (é aí que o defer_foreign_keys vale).
    await destino.$client.executeMultiple(`BEGIN;\n${copia}COMMIT;`)
    const linhas = await destino.all(
      sql.raw(`select id, name, email, email_verified from "user"`),
    )
    expect(linhas).toHaveLength(1)
    expect(linhas[0]).toMatchObject({
      id: 'u1',
      name: "Ana d'Ávila",
      email: 'ana@exemplo.com',
      email_verified: 1,
    })
  })

  it('não inclui tabelas internas do SQLite nem do controle de migrações', async () => {
    const copia = await gerarCopiaSql(await bancoComDados())
    expect(copia).not.toMatch(/sqlite_/)
    expect(copia).not.toMatch(/__drizzle_migrations|d1_migrations/)
  })
})

describe('tabelas fora da cópia e leitura em páginas', () => {
  it('não inclui session nem verification, mas inclui as demais', async () => {
    const db = await bancoComDados()
    await db.run(
      sql.raw(
        `insert into session (id, expires_at, token, updated_at, user_id) values ('s1', 1900000000000, 'tok-secreto', 1, 'u1')`,
      ),
    )
    await db.run(
      sql.raw(
        `insert into verification (id, identifier, value, expires_at) values ('v1', 'ana@exemplo.com', 'otp-123456', 1900000000000)`,
      ),
    )
    const deposito = depositoEmMemoria()
    const chave = await copiarBancoParaDeposito(
      db,
      deposito,
      () => new Date('2026-03-05T03:00:00Z'),
    )
    const texto = await descompactarCopia(
      deposito.objetos.get(chave) as Uint8Array,
    )
    expect(texto).toContain('INSERT INTO "user"')
    expect(texto).not.toContain('INSERT INTO "session"')
    expect(texto).not.toContain('INSERT INTO "verification"')
    expect(texto).not.toContain('tok-secreto')
    expect(texto).not.toContain('otp-123456')
  })

  it('copia todas as linhas de uma tabela maior que uma página', async () => {
    const db = await criarBancoDeTeste()
    await db.run(
      sql.raw(
        `with recursive n(i) as (select 1 union all select i + 1 from n where i < 2500)
         insert into "user" (id, name, email, email_verified) select 'u' || i, 'Nome ' || i, 'e' || i || '@x.com', 1 from n`,
      ),
    )
    const texto = await gerarCopiaSql(db)
    expect(texto.match(/INSERT INTO "user"/g)).toHaveLength(2500)
  })
})

describe('copiarBancoParaDeposito', () => {
  it('grava a cópia compactada em copias/AAAA-MM-DD.sql.gz pela data do relógio', async () => {
    const deposito = depositoEmMemoria()
    const db = await bancoComDados()
    const chave = await copiarBancoParaDeposito(
      db,
      deposito,
      () => new Date('2026-03-05T03:00:00Z'),
    )
    expect(chave).toBe('copias/2026-03-05.sql.gz')
    const bytes = deposito.objetos.get(chave)
    expect(bytes).toBeDefined()
    expect(gunzipSync(bytes as Uint8Array).toString('utf8')).toContain(
      `INSERT INTO "user"`,
    )
    expect(await descompactarCopia(bytes as Uint8Array)).toContain(
      `INSERT INTO "user"`,
    )
  })

  it('apaga as cópias com mais de 90 dias e mantém as demais', async () => {
    const deposito = depositoEmMemoria()
    const db = await bancoComDados()
    const agora = () => new Date('2026-06-01T03:00:00Z')
    // 2026-06-01 menos 90 dias = 2026-03-03
    for (const dia of [
      '2026-03-01',
      '2026-03-02',
      '2026-03-03',
      '2026-05-31',
    ]) {
      deposito.objetos.set(`copias/${dia}.sql.gz`, new Uint8Array([1]))
    }
    deposito.objetos.set('outro/arquivo.txt', new Uint8Array([1]))
    await copiarBancoParaDeposito(db, deposito, agora)
    expect([...deposito.objetos.keys()].sort()).toEqual([
      'copias/2026-03-03.sql.gz',
      'copias/2026-05-31.sql.gz',
      'copias/2026-06-01.sql.gz',
      'outro/arquivo.txt',
    ])
  })
})

describe('podarCopiasAntigas', () => {
  it('devolve quantas apagou e ignora chaves sem data', async () => {
    const deposito = depositoEmMemoria()
    deposito.objetos.set('copias/2020-01-01.sql.gz', new Uint8Array([1]))
    deposito.objetos.set('copias/lixo.sql.gz', new Uint8Array([1]))
    const apagadas = await podarCopiasAntigas(
      deposito,
      () => new Date('2026-06-01T03:00:00Z'),
    )
    expect(apagadas).toBe(1)
    expect(deposito.objetos.has('copias/lixo.sql.gz')).toBe(true)
  })
})
