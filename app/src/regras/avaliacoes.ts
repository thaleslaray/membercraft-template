// Avaliação de aula: a nota de 1 a 5 que o aluno dá e pode mudar; com nota 1 ou 2 ele diz "o que
// faltou?", texto que só a equipe lê. Esse texto entra na fila "Avaliações para ler" até alguém
// marcar como lido. Um registro por (aluno, aula): gravar de novo muda o mesmo registro.
//
// Ponto de extensão (`Ganchos`, passado por quem chama; nada de registro global):
// - `aoAvaliarPelaPrimeiraVez`: os 25 pontos da primeira avaliação (#54) entram aqui.

import { and, desc, eq, isNotNull, isNull, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/sqlite-core'
import { aula, avaliacaoDaAula, curso, modulo, user } from '#/db/schema'
import { type Banco, comoLibsql, type Relogio } from '#/regras/tipos'

export class ErroDeAvaliacao extends Error {
  constructor(mensagem: string) {
    super(mensagem)
    this.name = 'ErroDeAvaliacao'
  }
}

export const NOTA_MINIMA = 1
export const NOTA_MAXIMA = 5
/** Notas até aqui são "baixas": abrem o "o que faltou?" e contam no percentual de notas baixas. */
export const NOTA_BAIXA_MAXIMA = 2
export const LIMITE_DO_TEXTO = 2000

export interface ContextoDaAvaliacao {
  db: Banco
  agora: Relogio
  userId: string
  aulaId: string
  nota: number
}

export interface Ganchos {
  /** Roda uma vez por (aluno, aula), depois de a primeira avaliação ser gravada. */
  aoAvaliarPelaPrimeiraVez?: (contexto: ContextoDaAvaliacao) => Promise<void>
}

export interface EntradaDaAvaliacao {
  nota: number
  /** Só vale com nota 1 ou 2; com nota maior é descartado. */
  oQueFaltou?: string | null
}

export interface AvaliacaoDoAluno {
  nota: number
  oQueFaltou: string | null
}

async function aulaExiste(db: Banco, aulaId: string) {
  const [encontrada] = await comoLibsql(db)
    .select({ id: aula.id })
    .from(aula)
    .innerJoin(modulo, eq(modulo.id, aula.moduloId))
    .where(
      and(
        eq(aula.id, aulaId),
        isNull(aula.excluidoEm),
        isNull(modulo.excluidoEm),
      ),
    )
  return encontrada !== undefined
}

function textoDaEntrada(entrada: EntradaDaAvaliacao): string | null {
  if (entrada.nota > NOTA_BAIXA_MAXIMA) return null
  const texto = (entrada.oQueFaltou ?? '').trim()
  if (texto.length > LIMITE_DO_TEXTO) {
    throw new ErroDeAvaliacao(
      `Escreva até ${LIMITE_DO_TEXTO} caracteres em "O que faltou?".`,
    )
  }
  return texto === '' ? null : texto
}

/** O que o aluno já avaliou nesta aula; nulo se ainda não avaliou. */
export async function lerAvaliacao(
  db: Banco,
  userId: string,
  aulaId: string,
): Promise<AvaliacaoDoAluno | null> {
  const [linha] = await comoLibsql(db)
    .select({
      nota: avaliacaoDaAula.nota,
      oQueFaltou: avaliacaoDaAula.oQueFaltou,
    })
    .from(avaliacaoDaAula)
    .where(
      and(
        eq(avaliacaoDaAula.userId, userId),
        eq(avaliacaoDaAula.aulaId, aulaId),
      ),
    )
  return linha ?? null
}

/**
 * Grava (ou muda) a nota do aluno. Idempotente: o mesmo aluno e a mesma aula são sempre o mesmo
 * registro. O texto novo volta a avaliação para a fila; o mesmo texto, não.
 */
export async function avaliarAula(
  db: Banco,
  agora: Relogio,
  userId: string,
  aulaId: string,
  entrada: EntradaDaAvaliacao,
  ganchos: Ganchos = {},
): Promise<{ primeiraVez: boolean }> {
  const { nota } = entrada
  if (!Number.isInteger(nota) || nota < NOTA_MINIMA || nota > NOTA_MAXIMA) {
    throw new ErroDeAvaliacao('A nota vai de 1 a 5.')
  }
  const oQueFaltou = textoDaEntrada(entrada)
  if (!(await aulaExiste(db, aulaId))) {
    throw new ErroDeAvaliacao('Aula não encontrada.')
  }
  const instante = agora()
  const conexao = comoLibsql(db)
  const criada = await conexao
    .insert(avaliacaoDaAula)
    .values({
      id: crypto.randomUUID(),
      userId,
      aulaId,
      nota,
      oQueFaltou,
      atualizadaEm: instante,
    })
    .onConflictDoNothing()
    .returning({ id: avaliacaoDaAula.id })
  const primeiraVez = criada.length > 0

  if (!primeiraVez) {
    // Texto diferente do guardado volta a ser "para ler"; sem texto, não há o que ler.
    await conexao
      .update(avaliacaoDaAula)
      .set({
        nota,
        oQueFaltou,
        atualizadaEm: instante,
        ...(oQueFaltou === null
          ? { lidaEm: null, lidaPorId: null }
          : {
              lidaEm: sql`case when ${avaliacaoDaAula.oQueFaltou} = ${oQueFaltou} then ${avaliacaoDaAula.lidaEm} end`,
              lidaPorId: sql`case when ${avaliacaoDaAula.oQueFaltou} = ${oQueFaltou} then ${avaliacaoDaAula.lidaPorId} end`,
            }),
      })
      .where(
        and(
          eq(avaliacaoDaAula.userId, userId),
          eq(avaliacaoDaAula.aulaId, aulaId),
        ),
      )
  }
  if (primeiraVez) {
    await ganchos.aoAvaliarPelaPrimeiraVez?.({
      db,
      agora,
      userId,
      aulaId,
      nota,
    })
  }
  return { primeiraVez }
}

export type SituacaoDaFila = 'para-ler' | 'lidas'

export interface AvaliacaoParaLer {
  id: string
  nota: number
  oQueFaltou: string
  alunoNome: string
  alunoEmail: string
  aulaId: string
  aulaTitulo: string
  cursoNome: string
  atualizadaEm: Date
  lidaEm: Date | null
  lidaPorNome: string | null
}

/** A fila "Avaliações para ler" (ou as já lidas): só notas com "o que faltou?" escrito. */
export async function listarAvaliacoes(
  db: Banco,
  situacao: SituacaoDaFila,
): Promise<AvaliacaoParaLer[]> {
  const leitor = alias(user, 'leitor')
  const linhas = await comoLibsql(db)
    .select({
      id: avaliacaoDaAula.id,
      nota: avaliacaoDaAula.nota,
      oQueFaltou: avaliacaoDaAula.oQueFaltou,
      alunoNome: user.name,
      alunoEmail: user.email,
      aulaId: aula.id,
      aulaTitulo: aula.titulo,
      cursoNome: curso.nome,
      atualizadaEm: avaliacaoDaAula.atualizadaEm,
      lidaEm: avaliacaoDaAula.lidaEm,
      lidaPorNome: leitor.name,
    })
    .from(avaliacaoDaAula)
    .innerJoin(user, eq(user.id, avaliacaoDaAula.userId))
    .innerJoin(aula, eq(aula.id, avaliacaoDaAula.aulaId))
    .innerJoin(modulo, eq(modulo.id, aula.moduloId))
    .innerJoin(curso, eq(curso.id, modulo.cursoId))
    .leftJoin(leitor, eq(leitor.id, avaliacaoDaAula.lidaPorId))
    .where(
      and(
        isNotNull(avaliacaoDaAula.oQueFaltou),
        situacao === 'para-ler'
          ? isNull(avaliacaoDaAula.lidaEm)
          : isNotNull(avaliacaoDaAula.lidaEm),
      ),
    )
    .orderBy(
      situacao === 'para-ler'
        ? avaliacaoDaAula.atualizadaEm
        : desc(avaliacaoDaAula.lidaEm),
    )
  return linhas.map((l) => ({ ...l, oQueFaltou: l.oQueFaltou ?? '' }))
}

/** Quantas avaliações esperam leitura (contador do menu do painel, #104). */
export async function contarParaLer(db: Banco): Promise<number> {
  const [{ total }] = await comoLibsql(db)
    .select({ total: sql<number>`count(*)` })
    .from(avaliacaoDaAula)
    .where(
      and(
        isNotNull(avaliacaoDaAula.oQueFaltou),
        isNull(avaliacaoDaAula.lidaEm),
      ),
    )
  return Number(total)
}

/** A equipe marca como lida. Idempotente: quem já leu não muda de data nem de leitor. */
export async function marcarComoLida(
  db: Banco,
  agora: Relogio,
  equipeId: string,
  avaliacaoId: string,
): Promise<void> {
  const conexao = comoLibsql(db)
  const [existente] = await conexao
    .select({ id: avaliacaoDaAula.id })
    .from(avaliacaoDaAula)
    .where(eq(avaliacaoDaAula.id, avaliacaoId))
  if (!existente) throw new ErroDeAvaliacao('Avaliação não encontrada.')
  await conexao
    .update(avaliacaoDaAula)
    .set({ lidaEm: agora(), lidaPorId: equipeId })
    .where(
      and(eq(avaliacaoDaAula.id, avaliacaoId), isNull(avaliacaoDaAula.lidaEm)),
    )
}

export interface SatisfacaoDaAula {
  aulaId: string
  aulaTitulo: string
  cursoNome: string
  total: number
  /** Média das notas, com uma casa decimal. */
  media: number
  /** 0 a 100, arredondado: parte das notas 1 e 2. */
  percentualDeNotasBaixas: number
}

/** Notas por aula, das piores para as melhores (insumo do relatório Satisfação, #62). */
export async function satisfacaoPorAula(
  db: Banco,
): Promise<SatisfacaoDaAula[]> {
  const linhas = await comoLibsql(db)
    .select({
      aulaId: aula.id,
      aulaTitulo: aula.titulo,
      cursoNome: curso.nome,
      total: sql<number>`count(*)`,
      soma: sql<number>`sum(${avaliacaoDaAula.nota})`,
      baixas: sql<number>`sum(case when ${avaliacaoDaAula.nota} <= ${NOTA_BAIXA_MAXIMA} then 1 else 0 end)`,
    })
    .from(avaliacaoDaAula)
    .innerJoin(aula, eq(aula.id, avaliacaoDaAula.aulaId))
    .innerJoin(modulo, eq(modulo.id, aula.moduloId))
    .innerJoin(curso, eq(curso.id, modulo.cursoId))
    .where(and(isNull(aula.excluidoEm), isNull(modulo.excluidoEm)))
    .groupBy(aula.id, aula.titulo, curso.nome)
  return linhas
    .map((l) => {
      const total = Number(l.total)
      return {
        aulaId: l.aulaId,
        aulaTitulo: l.aulaTitulo,
        cursoNome: l.cursoNome,
        total,
        media: Math.round((Number(l.soma) / total) * 10) / 10,
        percentualDeNotasBaixas: Math.round((Number(l.baixas) / total) * 100),
      }
    })
    .sort((a, b) => a.media - b.media || b.total - a.total)
}
