import { resumirIdas } from '#/db/d1-trace'
import type { criarBancoDeTeste } from '#/test/banco'

type BancoDeTeste = Awaited<ReturnType<typeof criarBancoDeTeste>>

// Mede as idas ao banco de uma operação, como o `PERF_LOG` mede no Worker: quantas foram e qual a fila
// mais longa (idas que esperam a anterior acabar). Cada ida ganha um ATRASO artificial: o banco de teste
// é em memória e responde em microssegundos, e sem atraso uma consulta em fila e uma em paralelo parecem
// iguais. Com o atraso, a fila aparece (cada elo custa o atraso) e o paralelo não (todas começam juntas).
// Um `db.batch` conta como UMA ida, como no D1.
export function medirIdas(db: BancoDeTeste, atrasoMs = 12) {
  const cliente = db.$client
  const idas: { sql: string; start: number; end: number }[] = []
  const execute = cliente.execute.bind(cliente)
  const batch = cliente.batch.bind(cliente)
  const comAtraso = async <T>(sql: string, ida: () => Promise<T>) => {
    const start = performance.now()
    await new Promise((resolve) => setTimeout(resolve, atrasoMs))
    try {
      return await ida()
    } finally {
      idas.push({ sql, start, end: performance.now() })
    }
  }
  cliente.execute = ((instrucao: Parameters<typeof execute>[0]) =>
    comAtraso(
      typeof instrucao === 'string'
        ? instrucao
        : (instrucao as { sql: string }).sql,
      () => execute(instrucao),
    )) as typeof cliente.execute
  cliente.batch = ((...args: Parameters<typeof batch>) =>
    comAtraso('batch', () => batch(...args))) as typeof cliente.batch

  return {
    async medir<T>(operacao: () => Promise<T>) {
      idas.length = 0
      const valor = await operacao()
      return { valor, ...resumirIdas(idas), consultas: idas.map((i) => i.sql) }
    },
  }
}
