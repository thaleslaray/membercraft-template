import { eq } from 'drizzle-orm'

import { credencialHotmart } from '#/db/schema'
import { cifrar, decifrar } from '#/regras/cifra'
import { prepararRegistro } from '#/regras/registro-de-acoes'
import { type Banco, comoLibsql, type Relogio } from '#/regras/tipos'

/**
 * Credenciais da API da Hotmart (#129): Client ID, Client Secret, Client Token e hottok.
 * Cifradas no D1; a tela só sabe se cada campo está preenchido (sem leitura de volta).
 * Só `lerCredenciais` (uso interno do cliente da API) devolve os valores.
 */

export class ErroDeCredencial extends Error {
  constructor(mensagem: string) {
    super(mensagem)
    this.name = 'ErroDeCredencial'
  }
}

const ID = 'padrao'
const LIMITE = 4000

export type Credenciais = {
  clientId: string
  clientSecret: string
  basic: string
  hottok: string
  sandbox: boolean
}

const CAMPOS = ['clientId', 'clientSecret', 'basic', 'hottok'] as const
type Campo = (typeof CAMPOS)[number]

const COLUNA: Record<Campo, keyof typeof credencialHotmart.$inferSelect> = {
  clientId: 'clientIdCifrado',
  clientSecret: 'clientSecretCifrado',
  basic: 'basicCifrado',
  hottok: 'hottokCifrado',
}

const ROTULO: Record<Campo, string> = {
  clientId: 'Client ID',
  clientSecret: 'Client Secret',
  basic: 'Client Token',
  hottok: 'hottok',
}

export type EntradaDasCredenciais = Partial<Record<Campo, string>> & {
  sandbox: boolean
}

export type SituacaoDasCredenciais = {
  configurada: boolean
  campos: Record<Campo, boolean>
  sandbox: boolean
  atualizadoEm: Date | null
}

async function linhaAtual(db: Banco) {
  const [linha] = await db
    .select()
    .from(credencialHotmart)
    .where(eq(credencialHotmart.id, ID))
  return linha
}

export async function situacaoDasCredenciais(
  db: Banco,
): Promise<SituacaoDasCredenciais> {
  const linha = await linhaAtual(db)
  const preenchido = (c: Campo) => Boolean(linha?.[COLUNA[c]])
  return {
    configurada: Boolean(linha),
    campos: {
      clientId: preenchido('clientId'),
      clientSecret: preenchido('clientSecret'),
      basic: preenchido('basic'),
      hottok: preenchido('hottok'),
    },
    sandbox: linha?.sandbox ?? false,
    atualizadoEm: linha?.atualizadoEm ?? null,
  }
}

/** Uso interno (cliente da API, webhook): devolve os valores em claro. Nunca vai à tela. */
export async function lerCredenciais(
  db: Banco,
  chave: string | undefined,
): Promise<Credenciais | null> {
  const linha = await linhaAtual(db)
  if (!linha) return null
  return {
    clientId: await decifrar(linha.clientIdCifrado, chave),
    clientSecret: await decifrar(linha.clientSecretCifrado, chave),
    basic: await decifrar(linha.basicCifrado, chave),
    hottok: await decifrar(linha.hottokCifrado, chave),
    sandbox: linha.sandbox,
  }
}

/**
 * Só o hottok, em claro, para o webhook: os outros campos não são decifrados (um deles estragado não
 * derruba o aviso). Sem credencial salva devolve `undefined`; chave ausente ou errada lança `ErroDeCifra`.
 */
export async function lerHottok(
  db: Banco,
  chave: string | undefined,
): Promise<string | undefined> {
  const linha = await linhaAtual(db)
  if (!linha) return undefined
  return decifrar(linha.hottokCifrado, chave)
}

/**
 * Campo em branco mantém o valor que já está salvo; preenchido troca. Na primeira vez os quatro são
 * obrigatórios. A troca vai ao registro de ações só com o nome dos campos, nunca o valor, e descarta o
 * token OAuth em cache (ele pertence à credencial antiga).
 */
export async function salvarCredenciais(
  db: Banco,
  relogio: Relogio,
  chave: string | undefined,
  entrada: EntradaDasCredenciais,
  autorId: string,
): Promise<void> {
  const atual = await linhaAtual(db)
  const agora = relogio()
  const trocados: Campo[] = []
  const colunas: Record<string, string> = {}

  for (const campo of CAMPOS) {
    const valor = entrada[campo]?.trim()
    if (valor) {
      if (valor.length > LIMITE) {
        throw new ErroDeCredencial(`${ROTULO[campo]} está longo demais.`)
      }
      colunas[COLUNA[campo]] = await cifrar(valor, chave)
      trocados.push(campo)
    } else if (!atual) {
      throw new ErroDeCredencial(
        `Preencha ${ROTULO[campo]}: na primeira vez os quatro campos são obrigatórios.`,
      )
    }
  }
  const mudouSandbox = atual !== undefined && atual.sandbox !== entrada.sandbox
  if (trocados.length === 0 && !mudouSandbox) {
    throw new ErroDeCredencial('Nada para salvar: preencha um campo.')
  }

  const lib = comoLibsql(db)
  const valores = {
    ...colunas,
    sandbox: entrada.sandbox,
    tokenCifrado: null,
    tokenExpiraEm: null,
    atualizadoEm: agora,
    atualizadoPor: autorId,
  }
  const gravar = atual
    ? lib
        .update(credencialHotmart)
        .set(valores)
        .where(eq(credencialHotmart.id, ID))
    : lib.insert(credencialHotmart).values({
        id: ID,
        clientIdCifrado: colunas.clientIdCifrado,
        clientSecretCifrado: colunas.clientSecretCifrado,
        basicCifrado: colunas.basicCifrado,
        hottokCifrado: colunas.hottokCifrado,
        sandbox: entrada.sandbox,
        atualizadoEm: agora,
        atualizadoPor: autorId,
      })
  await lib.batch([
    gravar,
    prepararRegistro(db, relogio, {
      autorId,
      acao: 'credenciais-hotmart-trocadas',
      detalhe: {
        campos: trocados.map((c) => ROTULO[c]).join(', ') || 'nenhum',
        sandbox: entrada.sandbox,
      },
    }),
  ])
}

export type TokenEmCache = { token: string; expiraEm: Date }

/** O token OAuth em uso, guardado cifrado no D1 para valer entre os pedidos até expirar. */
export function armazenamentoDoToken(db: Banco, chave: string | undefined) {
  const lib = comoLibsql(db)
  return {
    async ler(): Promise<TokenEmCache | null> {
      const linha = await linhaAtual(db)
      if (!linha?.tokenCifrado || !linha.tokenExpiraEm) return null
      return {
        token: await decifrar(linha.tokenCifrado, chave),
        expiraEm: linha.tokenExpiraEm,
      }
    },
    async gravar(token: string, expiraEm: Date): Promise<void> {
      await lib
        .update(credencialHotmart)
        .set({
          tokenCifrado: await cifrar(token, chave),
          tokenExpiraEm: expiraEm,
        })
        .where(eq(credencialHotmart.id, ID))
    },
    async limpar(): Promise<void> {
      await lib
        .update(credencialHotmart)
        .set({ tokenCifrado: null, tokenExpiraEm: null })
        .where(eq(credencialHotmart.id, ID))
    },
  }
}
