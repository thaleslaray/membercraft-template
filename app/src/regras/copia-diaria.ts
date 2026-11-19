// Cópia diária do banco para o R2, mantida por 90 dias (além do Time Travel de 30 dias do D1).
//
// A cópia é um arquivo SQL (`INSERT` por linha), compactado em gzip, em `copias/AAAA-MM-DD.sql.gz`.
// Restaurar = aplicar esse SQL num banco que já tem o esquema (passo a passo em `docs/restauracao.md`).
import { sql } from 'drizzle-orm'
import type { Banco, Relogio } from '#/regras/tipos'

export const DIAS_DE_RETENCAO = 90
const PREFIXO = 'copias/'

/** O mínimo que a cópia precisa do R2 (o `R2Bucket` real é adaptado em `src/lib/jobs.ts`). */
export interface Deposito {
  /** Recebe o gzip como fluxo (de tamanho desconhecido); o R2 real é gravado em partes. */
  put: (chave: string, corpo: ReadableStream<Uint8Array>) => Promise<void>
  list: (opcoes: { prefix: string }) => Promise<string[]>
  delete: (chaves: string[]) => Promise<void>
}

type Linha = Record<string, unknown>

function literal(valor: unknown): string {
  if (valor === null || valor === undefined) return 'NULL'
  if (typeof valor === 'number' || typeof valor === 'bigint')
    return String(valor)
  if (typeof valor === 'boolean') return valor ? '1' : '0'
  if (valor instanceof ArrayBuffer || ArrayBuffer.isView(valor)) {
    const bytes = new Uint8Array(
      valor instanceof ArrayBuffer ? valor : (valor.buffer as ArrayBuffer),
    )
    return `X'${[...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')}'`
  }
  return `'${String(valor).replaceAll("'", "''")}'`
}

const identificador = (nome: string) => `"${nome.replaceAll('"', '""')}"`

/** Tabelas que ficam fora da cópia: `session` guarda tokens de login ativos e `verification` guarda códigos
 * (OTP) de uso único. Nenhuma das duas serve para restaurar, e ficariam 90 dias no R2. */
export const TABELAS_FORA_DA_COPIA = ['session', 'verification']

const LINHAS_POR_PAGINA = 1000

/** Gera o dump (uma instrução por linha, pronto para `wrangler d1 execute --file`), lendo cada tabela em
 * páginas de 1.000 linhas ordenadas pela chave primária, para nunca ter a tabela inteira em memória. */
async function* gerarLinhasDeSql(db: Banco): AsyncGenerator<string> {
  const tabelas = (await db.all(
    sql`select name from sqlite_master where type = 'table'
        and name not like 'sqlite!_%' escape '!' and name not like '!_cf!_%' escape '!'
        and name not in ('d1_migrations', '__drizzle_migrations')
        order by name`,
  )) as Linha[]

  // Sem isso, a ordem alfabética das tabelas quebraria as chaves estrangeiras (session antes de user).
  yield 'PRAGMA defer_foreign_keys = on;\n'
  for (const { name } of tabelas) {
    const tabela = String(name)
    if (TABELAS_FORA_DA_COPIA.includes(tabela)) continue
    const info = (await db.all(
      sql.raw(`pragma table_info(${identificador(tabela)})`),
    )) as Linha[]
    const colunas = info.map((c) => String(c.name))
    const lista = colunas.map(identificador).join(', ')
    const chave = info
      .filter((c) => Number(c.pk) > 0)
      .sort((x, y) => Number(x.pk) - Number(y.pk))
      .map((c) => identificador(String(c.name)))
    const ordem = chave.length > 0 ? chave.join(', ') : 'rowid'
    for (let deslocamento = 0; ; deslocamento += LINHAS_POR_PAGINA) {
      const linhas = (await db.all(
        sql.raw(
          `select ${lista} from ${identificador(tabela)} order by ${ordem} limit ${LINHAS_POR_PAGINA} offset ${deslocamento}`,
        ),
      )) as Linha[]
      if (linhas.length > 0) {
        yield `${linhas
          .map(
            (linha) =>
              `INSERT INTO ${identificador(tabela)} (${lista}) VALUES (${colunas.map((c) => literal(linha[c])).join(', ')});`,
          )
          .join('\n')}\n`
      }
      if (linhas.length < LINHAS_POR_PAGINA) break
    }
  }
}

/** A cópia como fluxo de bytes gzip, produzido sob demanda (uma página por vez). */
export function gerarCopiaCompactada(db: Banco): ReadableStream<Uint8Array> {
  const linhas = gerarLinhasDeSql(db)
  const texto = new ReadableStream<string>({
    async pull(controle) {
      const { value, done } = await linhas.next()
      if (done) controle.close()
      else controle.enqueue(value)
    },
    async cancel() {
      await linhas.return(undefined)
    },
  })
  return texto
    .pipeThrough(new TextEncoderStream())
    .pipeThrough(new CompressionStream('gzip'))
}

/** O dump inteiro como texto. Só para testes e uso pontual: carrega tudo em memória. */
export async function gerarCopiaSql(db: Banco): Promise<string> {
  let texto = ''
  for await (const parte of gerarLinhasDeSql(db)) texto += parte
  return texto
}

async function transformar(
  bytes: Uint8Array,
  fluxo: CompressionStream | DecompressionStream,
): Promise<Uint8Array> {
  const resposta = new Response(
    new Blob([bytes as BlobPart]).stream().pipeThrough(fluxo),
  )
  return new Uint8Array(await resposta.arrayBuffer())
}

export async function compactarCopia(texto: string): Promise<Uint8Array> {
  return transformar(
    new TextEncoder().encode(texto),
    new CompressionStream('gzip'),
  )
}

export async function descompactarCopia(bytes: Uint8Array): Promise<string> {
  return new TextDecoder().decode(
    await transformar(bytes, new DecompressionStream('gzip')),
  )
}

const chaveDoDia = (dia: Date) =>
  `${PREFIXO}${dia.toISOString().slice(0, 10)}.sql.gz`

/** Apaga as cópias com mais de 90 dias (pela data no nome da chave). Devolve quantas apagou. */
export async function podarCopiasAntigas(
  deposito: Deposito,
  agora: Relogio,
): Promise<number> {
  const limite = chaveDoDia(
    new Date(agora().getTime() - DIAS_DE_RETENCAO * 86_400_000),
  )
  const velhas = (await deposito.list({ prefix: PREFIXO })).filter(
    (chave) =>
      /^copias\/\d{4}-\d{2}-\d{2}\.sql\.gz$/.test(chave) && chave < limite,
  )
  if (velhas.length > 0) await deposito.delete(velhas)
  return velhas.length
}

/** Grava a cópia de hoje e poda as antigas. Devolve a chave gravada. */
export async function copiarBancoParaDeposito(
  db: Banco,
  deposito: Deposito,
  agora: Relogio,
): Promise<string> {
  const chave = chaveDoDia(agora())
  await deposito.put(chave, gerarCopiaCompactada(db))
  await podarCopiasAntigas(deposito, agora)
  return chave
}
