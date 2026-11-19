// Exclusão protegida: o que o usuário "exclui" só ganha uma data em `excluidoEm`; a linha continua no
// banco (e some das telas) por 30 dias, para desfazer exclusões por engano. Depois disso, a limpeza
// diária apaga de vez.
//
// COMO UMA FATIA ADERE (tabela nova com exclusão protegida):
//   1. Na tabela de `src/db/schema.ts`, crie a coluna
//        excluidoEm: integer('excluido_em', { mode: 'timestamp_ms' })   // nula = não excluída
//   2. Excluir = `update ... set excluidoEm = agora()`; as consultas filtram `isNull(tabela.excluidoEm)`.
//      Desfazer = voltar `excluidoEm` para null (dentro dos 30 dias).
//   3. Acrescente `{ nome: '<nome_da_tabela>', tabela }` em `TABELAS_COM_EXCLUSAO`
//      (`src/regras/tabelas-com-exclusao.ts`). O teste desse arquivo falha se uma tabela do schema
//      tiver `excluidoEm` e não estiver na lista.
//   4. Se a linha (ou algo que sai em cascata com ela) tem arquivo no R2, declare onde está a chave:
//      `chaves` (as da própria linha, ver `colunas`) e `filhos` (as das linhas dependentes que a cascata
//      do banco leva junto). A limpeza devolve as chaves das linhas que apagou e `apagarArquivos` as
//      tira do R2: arquivo e linha somem juntos, 30 dias depois.
//   5. Dependentes (favorito, regra de liberação, quiz, turma...) cujas chaves estrangeiras NÃO têm
//      cascata no banco: declare em `antes` os comandos que os apagam (ou soltam) junto, no mesmo
//      `db.batch` que apaga o pai. (Mudar chave estrangeira no SQLite recria a tabela, e isso falha no
//      D1 com dados; por isso a cascata mora aqui, testada em `exclusao-do-curso.test.ts`.)
import { lt, type SQLWrapper } from 'drizzle-orm'
import type { SQLiteColumn, SQLiteTable } from 'drizzle-orm/sqlite-core'
import { type Banco, comoLibsql, type Relogio } from '#/regras/tipos'

export const DIAS_DE_PROTECAO = 30

type Linha = Record<string, unknown>

// Comando do Drizzle de tipo variado: só passa ao `db.batch`.
// biome-ignore lint/suspicious/noExplicitAny: comandos do Drizzle de tipos variados, só passam ao batch
export type Comando = any

/** Subconsulta com os ids das linhas que a limpeza está apagando (não passa os ids um a um: o D1 limita 100 parâmetros). */
export type IdsVencidos = SQLWrapper

export interface TabelaComExclusao {
  /** Nome da tabela, só para o relatório da limpeza. */
  nome: string
  tabela: SQLiteTable & { id: SQLiteColumn; excluidoEm: SQLiteColumn }
  /** Chaves do R2 guardadas na própria linha que vai ser apagada. */
  chaves?: (linha: Linha) => string[]
  /** Chaves do R2 de linhas dependentes (que saem junto), lidas antes de apagar. */
  filhos?: (db: Banco, vencidas: IdsVencidos) => Promise<string[]>
  /** Comandos que apagam (ou soltam) os dependentes sem cascata no banco; entram no mesmo batch do pai. */
  antes?: (db: Banco, vencidas: IdsVencidos) => Comando[]
}

/** Atalho de `chaves` para colunas que guardam a chave do R2 (nome da propriedade no schema). */
export const colunas =
  (...nomes: string[]) =>
  (linha: Linha): string[] =>
    nomes.flatMap((nome) => {
      const valor = linha[nome]
      return typeof valor === 'string' && valor !== '' ? [valor] : []
    })

export interface FalhaDaLimpeza {
  /** Tabela que falhou (ou `r2`, se foi a retirada dos arquivos). */
  tabela: string
  erro: string
}

export interface ResultadoDaLimpeza {
  /** Quantas linhas foram apagadas, por tabela. */
  apagadas: Record<string, number>
  falhas: FalhaDaLimpeza[]
  arquivosApagados: number
}

const mensagem = (erro: unknown) =>
  erro instanceof Error ? erro.message : String(erro)

/**
 * Apaga de vez as linhas excluídas há mais de 30 dias e, se `apagarArquivos` vier, os arquivos do R2
 * ligados a elas. Cada tabela é isolada: o erro de uma vira `falhas` e não impede as seguintes.
 */
export async function limparExclusoesVencidas(
  db: Banco,
  agora: Relogio,
  tabelas: TabelaComExclusao[],
  apagarArquivos?: (chaves: string[]) => Promise<void>,
): Promise<ResultadoDaLimpeza> {
  const limite = new Date(agora().getTime() - DIAS_DE_PROTECAO * 86_400_000)
  const resultado: ResultadoDaLimpeza = {
    apagadas: {},
    falhas: [],
    arquivosApagados: 0,
  }
  const chaves: string[] = []
  for (const { nome, tabela, chaves: daLinha, filhos, antes } of tabelas) {
    try {
      const c = comoLibsql(db)
      const vencida = lt(tabela.excluidoEm, limite)
      const vencidas = c.select({ id: tabela.id }).from(tabela).where(vencida)
      const linhas = (await c.select().from(tabela).where(vencida)) as Linha[]
      const dessaTabela = [
        ...linhas.flatMap((linha) => daLinha?.(linha) ?? []),
        ...(filhos && linhas.length > 0 ? await filhos(db, vencidas) : []),
      ]
      // Dependentes e pai saem no mesmo batch: ou tudo, ou nada daquela tabela.
      const comandos: Comando[] = [
        ...(antes && linhas.length > 0 ? antes(db, vencidas) : []),
        c.delete(tabela).where(vencida).returning(),
      ]
      const resultados = (await c.batch(
        comandos as unknown as [Comando, ...Comando[]],
      )) as unknown[]
      resultado.apagadas[nome] = (resultados.at(-1) as unknown[]).length
      chaves.push(...dessaTabela)
    } catch (erro) {
      resultado.falhas.push({ tabela: nome, erro: mensagem(erro) })
    }
  }
  if (apagarArquivos && chaves.length > 0) {
    try {
      await apagarArquivos(chaves)
      resultado.arquivosApagados = chaves.length
    } catch (erro) {
      resultado.falhas.push({ tabela: 'r2', erro: mensagem(erro) })
    }
  }
  return resultado
}
