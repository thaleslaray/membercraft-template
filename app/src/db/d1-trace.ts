// Rastreio das idas ao D1. Serve para contar quantas consultas uma página faz e quantas ficam em
// fila (cada ida em fila custa uma viagem de rede até o banco). Sem bindings aqui; quem liga é
// `src/server.ts`, em dois modos:
//  - dev + header de pedido `x-d1-trace: 1`: uma linha `[d1]` por consulta e o resumo no terminal;
//  - `PERF_LOG=1` (qualquer ambiente): UMA linha JSON por pedido (`montarRegistroPerf`), para medir
//    o painel local ou no ambiente de teste.
// Desligado, o custo é zero: nada é envolvido.
import type { RequestD1Session } from '#/db/d1-session'

export const D1_TRACE_HEADER = 'x-d1-trace'

type Ida = { sql: string; start: number; end: number }

const PREFIXO_SERVER_FN = '/_serverFn/'

/**
 * Nome da server function de um caminho `/_serverFn/<id>`. O id é base64url de um JSON que traz o
 * nome em `export` (`nomeFn_createServerFn_handler`). Se não der para decodificar (build de
 * produção pode usar hash), devolve o id cru. Outro caminho: null.
 */
export function nomeDaServerFn(caminho: string): string | null {
  if (!caminho.startsWith(PREFIXO_SERVER_FN)) return null
  const id = caminho.slice(PREFIXO_SERVER_FN.length).split('?')[0]
  try {
    const base64 = id.replace(/-/g, '+').replace(/_/g, '/')
    const texto = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '='))
    const nome = /"export":"([^"]+)"/.exec(texto)?.[1]
    if (!nome) return id
    return nome.replace(/_createServerFn_handler$/, '')
  } catch {
    return id
  }
}

export type RegistroPerf = {
  perf: 1
  metodo: string
  caminho: string
  fn: string | null
  tela: string | null
  status: number
  ms: number
  idas: number
  emFila: number
  consultas: { t: string; ms: number; em: number }[]
  colo: string | null
}

const umaCasa = (n: number) => Math.round(n * 10) / 10

/** Pathname do header `referer` (a tela de onde o pedido saiu), ou null. */
export function telaDoReferer(referer: string | null): string | null {
  if (!referer) return null
  try {
    return new URL(referer).pathname
  } catch {
    return null
  }
}

/** Monta o registro de um pedido (uma linha JSON no log). Puro: quem mede é `server.ts`. */
export function montarRegistroPerf(entrada: {
  metodo: string
  url: string
  referer: string | null
  status: number
  ms: number
  idas: Ida[]
  colo?: string | null
}): RegistroPerf {
  const caminho = new URL(entrada.url).pathname
  const { idas, emFila } = resumirIdas(entrada.idas)
  return {
    perf: 1,
    metodo: entrada.metodo,
    caminho,
    fn: nomeDaServerFn(caminho),
    tela: telaDoReferer(entrada.referer),
    status: entrada.status,
    ms: umaCasa(entrada.ms),
    idas,
    emFila,
    consultas: [...entrada.idas]
      .sort((a, b) => a.start - b.start)
      .map((i) => ({
        t: i.sql,
        ms: umaCasa(i.end - i.start),
        em: umaCasa(i.start),
      })),
    colo: entrada.colo ?? null,
  }
}

/** Quantas idas e qual a fila mais longa (idas que esperam a anterior acabar). */
export function resumirIdas(idas: Pick<Ida, 'start' | 'end'>[]) {
  const ordenadas = [...idas].sort((a, b) => a.start - b.start)
  const fundura: number[] = []
  for (const [i, ida] of ordenadas.entries()) {
    let melhor = 0
    for (let j = 0; j < i; j++) {
      if (ordenadas[j].end <= ida.start) {
        melhor = Math.max(melhor, fundura[j])
      }
    }
    fundura[i] = melhor + 1
  }
  return { idas: idas.length, emFila: Math.max(0, ...fundura) }
}

function resumirSql(sql: string) {
  const limpo = sql.replace(/\s+/g, ' ').trim()
  const de = /\bfrom\s+"?(\w+)"?/i.exec(limpo)?.[1]
  const into = /\binto\s+"?(\w+)"?/i.exec(limpo)?.[1]
  const update = /^update\s+"?(\w+)"?/i.exec(limpo)?.[1]
  const verbo = limpo.split(' ', 1)[0]?.toLowerCase() ?? '?'
  const tabela = de ?? into ?? update ?? '?'
  return `${verbo} ${tabela}`
}

type Rastreado = D1PreparedStatement & { __real: D1PreparedStatement }

/**
 * Envolve a sessão D1 do pedido: cada `all/run/raw/first` e cada `batch` vira
 * uma linha `[d1]` no terminal. `fim()` imprime o resumo do pedido.
 */
export function rastrearD1(
  session: RequestD1Session,
  rotulo: string,
  /** Falso no modo `PERF_LOG`: o pedido vira uma linha JSON só, sem as linhas por consulta. */
  imprimirConsultas = true,
) {
  const inicio = performance.now()
  const idas: Ida[] = []

  async function medir<T>(sql: string, fn: () => Promise<T>): Promise<T> {
    const start = performance.now() - inicio
    try {
      return await fn()
    } finally {
      const end = performance.now() - inicio
      idas.push({ sql, start, end })
      if (imprimirConsultas) {
        console.log(
          `[d1] ${rotulo} +${start.toFixed(0)}ms (${(end - start).toFixed(0)}ms) ${sql}`,
        )
      }
    }
  }

  function envolver(real: D1PreparedStatement, sql: string): Rastreado {
    const resumo = resumirSql(sql)
    return {
      __real: real,
      bind: (...valores: unknown[]) => envolver(real.bind(...valores), sql),
      first: (...args: unknown[]) =>
        medir(resumo, () =>
          (real.first as (...a: unknown[]) => Promise<unknown>)(...args),
        ),
      run: () => medir(resumo, () => real.run()),
      all: () => medir(resumo, () => real.all()),
      raw: (...args: unknown[]) =>
        medir(resumo, () =>
          (real.raw as (...a: unknown[]) => Promise<unknown>)(...args),
        ),
    } as unknown as Rastreado
  }

  const rastreada: RequestD1Session = {
    prepare: (sql: string) => envolver(session.prepare(sql), sql),
    batch: ((declaracoes: Rastreado[]) =>
      medir(`batch(${declaracoes.length})`, () =>
        session.batch(declaracoes.map((d) => d.__real ?? d)),
      )) as RequestD1Session['batch'],
    getBookmark: () => session.getBookmark(),
  }

  return {
    sessao: rastreada,
    /** As idas feitas até agora (instantes em ms desde o começo do rastreio). */
    idas: () => idas,
    fim() {
      const { idas: total, emFila } = resumirIdas(idas)
      console.log(
        `[d1] ${rotulo} RESUMO: ${total} ida(s) ao D1, ${emFila} em fila`,
      )
    },
  }
}
