import { createClient, type InStatement } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import { migrate } from 'drizzle-orm/libsql/migrator'
import * as schema from '#/db/schema'

// O D1 recusa comandos com mais de 100 parâmetros; o libsql aceita milhares. O banco de teste
// recusa igual ao D1, para a suíte pegar o defeito (a página da aula de um curso grande deu 500).
export const LIMITE_DE_PARAMETROS_DO_D1 = 100

function conferirParametros(instrucao: InStatement) {
  if (typeof instrucao === 'string') return
  const args = instrucao.args
  const total = Array.isArray(args)
    ? args.length
    : Object.keys(args ?? {}).length
  if (total > LIMITE_DE_PARAMETROS_DO_D1) {
    throw new Error(
      `D1: comando com ${total} parâmetros (o limite é ${LIMITE_DE_PARAMETROS_DO_D1}): ${instrucao.sql.slice(0, 120)}`,
    )
  }
}

// No D1, o `batch` devolve cada linha como OBJETO (coluna -> valor), e o Drizzle remonta a linha pela
// ordem dos valores: duas colunas com o MESMO nome no resultado (ex.: `turma.nome` e `curso.nome`, ou
// `matricula.id` e `turma.id`, ou duas tabelas aninhadas num `select({ a, b })`) viram uma só, e os
// campos seguintes saem deslocados (o perfil do aluno mostrava o curso como "ativa"). O libsql devolve
// as colunas repetidas sem problema, então o banco de teste recusa igual ao D1. Em `db.batch`, dê um
// apelido (`sql\`${coluna}\`.as('turma_nome')`) ou rode a consulta fora do lote.
function conferirColunas(
  instrucoes: InStatement[],
  resultados: { columns: string[] }[],
) {
  resultados.forEach((r, i) => {
    const repetidas = r.columns.filter((c, j) => r.columns.indexOf(c) !== j)
    if (repetidas.length > 0) {
      const instrucao = instrucoes[i]
      const texto = typeof instrucao === 'string' ? instrucao : instrucao.sql
      throw new Error(
        `D1: batch com coluna repetida no resultado (${[...new Set(repetidas)].join(', ')}): ${texto.slice(0, 160)}`,
      )
    }
  })
}

interface Executor {
  execute: (instrucao: InStatement) => Promise<unknown>
  batch: (instrucoes: InStatement[], modo?: never) => Promise<unknown>
}

function limitarComoOD1<T extends Executor>(alvo: T): T {
  const execute = alvo.execute.bind(alvo)
  const batch = alvo.batch.bind(alvo)
  alvo.execute = (instrucao) => {
    conferirParametros(instrucao)
    return execute(instrucao)
  }
  alvo.batch = async (instrucoes, modo) => {
    for (const instrucao of instrucoes) conferirParametros(instrucao)
    const resultados = (await batch(instrucoes, modo)) as {
      columns: string[]
    }[]
    conferirColunas(instrucoes, resultados)
    return resultados
  }
  return alvo
}

// Banco SQLite em memória para os testes das regras, com as MESMAS migrações de `drizzle/`
// que vão para o D1. Cada chamada devolve um banco novo e isolado.
export async function criarBancoDeTeste() {
  const client = limitarComoOD1(createClient({ url: ':memory:' }))
  const transaction = client.transaction.bind(client)
  client.transaction = (async (...a: Parameters<typeof transaction>) =>
    limitarComoOD1(await transaction(...a))) as typeof client.transaction
  const db = drizzle(client, { schema })
  await migrate(db, { migrationsFolder: 'drizzle' })
  return db
}
