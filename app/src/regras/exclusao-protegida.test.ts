import { sql } from 'drizzle-orm'
import {
  getTableConfig,
  integer,
  sqliteTable,
  text,
} from 'drizzle-orm/sqlite-core'
import { describe, expect, it } from 'vitest'
import * as schema from '#/db/schema'
import {
  DIAS_DE_PROTECAO,
  limparExclusoesVencidas,
} from '#/regras/exclusao-protegida'
import { TABELAS_COM_EXCLUSAO } from '#/regras/tabelas-com-exclusao'
import { criarBancoDeTeste } from '#/test/banco'

const arquivo = sqliteTable('arquivo_teste', {
  id: text('id').primaryKey(),
  excluidoEm: integer('excluido_em', { mode: 'timestamp_ms' }),
})
const nota = sqliteTable('nota_teste', {
  id: text('id').primaryKey(),
  excluidoEm: integer('excluido_em', { mode: 'timestamp_ms' }),
})

const agora = () => new Date('2026-06-01T12:00:00Z')
const diasAtras = (n: number) => agora().getTime() - n * 86_400_000

async function banco() {
  const db = await criarBancoDeTeste()
  await db.run(
    sql.raw(
      `create table arquivo_teste (id text primary key, excluido_em integer)`,
    ),
  )
  await db.run(
    sql.raw(
      `create table nota_teste (id text primary key, excluido_em integer)`,
    ),
  )
  return db
}

describe('limparExclusoesVencidas', () => {
  it('a proteção é de 30 dias', () => {
    expect(DIAS_DE_PROTECAO).toBe(30)
  })

  it('apaga de vez só o que foi excluído há mais de 30 dias', async () => {
    const db = await banco()
    await db.run(
      sql.raw(
        `insert into arquivo_teste values ('velho', ${diasAtras(31)}), ('limite', ${diasAtras(30)}), ('recente', ${diasAtras(5)}), ('vivo', null)`,
      ),
    )
    const resultado = await limparExclusoesVencidas(db, agora, [
      { nome: 'arquivo_teste', tabela: arquivo },
    ])
    const sobrou = await db.all(
      sql.raw(`select id from arquivo_teste order by id`),
    )
    expect(sobrou.map((l) => (l as { id: string }).id)).toEqual([
      'limite',
      'recente',
      'vivo',
    ])
    expect(resultado.apagadas).toEqual({ arquivo_teste: 1 })
  })

  it('limpa todas as tabelas recebidas e conta por tabela', async () => {
    const db = await banco()
    await db.run(
      sql.raw(
        `insert into arquivo_teste values ('a', ${diasAtras(40)}), ('b', ${diasAtras(90)})`,
      ),
    )
    await db.run(
      sql.raw(
        `insert into nota_teste values ('c', ${diasAtras(31)}), ('d', null)`,
      ),
    )
    const resultado = await limparExclusoesVencidas(db, agora, [
      { nome: 'arquivo_teste', tabela: arquivo },
      { nome: 'nota_teste', tabela: nota },
    ])
    expect(resultado.apagadas).toEqual({ arquivo_teste: 2, nota_teste: 1 })
  })

  it('sem tabelas não faz nada', async () => {
    expect(
      (await limparExclusoesVencidas(await criarBancoDeTeste(), agora, []))
        .apagadas,
    ).toEqual({})
  })

  it('um erro numa tabela não impede as seguintes e volta como falha dela', async () => {
    const db = await banco()
    await db.run(
      sql.raw(
        `insert into nota_teste values ('c', ${diasAtras(31)}), ('d', null)`,
      ),
    )
    const naoExiste = sqliteTable('tabela_que_nao_existe', {
      id: text('id').primaryKey(),
      excluidoEm: integer('excluido_em', { mode: 'timestamp_ms' }),
    })
    const resultado = await limparExclusoesVencidas(db, agora, [
      { nome: 'tabela_que_nao_existe', tabela: naoExiste },
      { nome: 'nota_teste', tabela: nota },
    ])
    expect(resultado.apagadas).toEqual({ nota_teste: 1 })
    expect(resultado.falhas.map((f) => f.tabela)).toEqual([
      'tabela_que_nao_existe',
    ])
    expect(resultado.falhas[0].erro).not.toBe('')
  })

  it('devolve os arquivos do R2 das linhas apagadas, e só delas', async () => {
    const db = await banco()
    await db.run(sql.raw(`alter table arquivo_teste add column chave text`))
    await db.run(
      sql.raw(
        `insert into arquivo_teste values ('velho', ${diasAtras(40)}, 'r2/velho.png'), ('novo', ${diasAtras(2)}, 'r2/novo.png'), ('vivo', null, 'r2/vivo.png')`,
      ),
    )
    const comChave = sqliteTable('arquivo_teste', {
      id: text('id').primaryKey(),
      excluidoEm: integer('excluido_em', { mode: 'timestamp_ms' }),
      chave: text('chave'),
    })
    const apagados: string[][] = []
    const resultado = await limparExclusoesVencidas(
      db,
      agora,
      [
        {
          nome: 'arquivo_teste',
          tabela: comChave,
          chaves: (linha) => [String(linha.chave)],
          filhos: async () => ['r2/filho-do-velho.png'],
        },
      ],
      async (chaves) => {
        apagados.push(chaves)
      },
    )
    expect(apagados).toEqual([['r2/velho.png', 'r2/filho-do-velho.png']])
    expect(resultado.arquivosApagados).toBe(2)
  })

  it('se o R2 falhar, a limpeza das linhas vale e a falha é informada', async () => {
    const db = await banco()
    await db.run(
      sql.raw(`insert into nota_teste values ('c', ${diasAtras(31)})`),
    )
    const resultado = await limparExclusoesVencidas(
      db,
      agora,
      [
        {
          nome: 'nota_teste',
          tabela: nota,
          chaves: () => ['r2/x.png'],
        },
      ],
      async () => {
        throw new Error('R2 fora do ar')
      },
    )
    expect(resultado.apagadas).toEqual({ nota_teste: 1 })
    expect(resultado.falhas).toEqual([{ tabela: 'r2', erro: 'R2 fora do ar' }])
  })
})

describe('TABELAS_COM_EXCLUSAO', () => {
  it('lista toda tabela do schema que tem a coluna excluidoEm', () => {
    const comColuna = Object.values(schema)
      .filter((v) => typeof v === 'object' && v !== null)
      .map((v) => {
        try {
          return getTableConfig(v as never)
        } catch {
          return null
        }
      })
      .filter((c) => c?.columns.some((col) => col.name === 'excluido_em'))
      .map((c) => c?.name)
      .sort()
    const listadas = TABELAS_COM_EXCLUSAO.map((t) => t.nome).sort()
    expect(listadas).toEqual(comColuna)
  })
})
