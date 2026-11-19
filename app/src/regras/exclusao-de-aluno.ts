// Excluir um aluno de vez (#61, pedido de exclusão de dados): só o Proprietário, com registro.
// Apaga a conta e tudo o que é dele. Não é a exclusão protegida de 30 dias: aqui não há volta.
//
// COMO UMA FATIA ADERE: tabela nova com dado do aluno (comentário, tentativa de quiz, pontos...)
// acrescenta o seu apagador em `APAGADORES_DE_ALUNO`. Ele devolve os comandos (sem executar) que
// apagam as linhas daquele aluno; entram no mesmo `db.batch`, na ordem da lista (filhos antes dos pais).

import { and, eq, inArray, like, or, sql } from 'drizzle-orm'
import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import type * as schema from '#/db/schema'
import {
  anexoDaPublicacao,
  arquivoDaResposta,
  avaliacaoDaAula,
  avisoAgrupado,
  avisoDeVenda,
  certificado,
  comentarioDaAula,
  comentarioDaPublicacao,
  envioDeEmail,
  favorito,
  lancamentoDePontos,
  leituraDaPublicacao,
  liberacaoDeTentativa,
  matricula,
  origemDaMatricula,
  pedidoDoMec,
  progressoDaAula,
  publicacao,
  registroDeAcoes,
  respostaAbertaDoQuiz,
  seguidorDaPublicacao,
  tentativaDoQuiz,
  user,
} from '#/db/schema'
import { chaveDasImagensDoTexto } from '#/regras/anexos-da-comunidade'
import { PREFIXO_DA_FOTO } from '#/regras/minha-conta'
import { prepararRegistro } from '#/regras/registro-de-acoes'
import { type Banco, comoLibsql, type Relogio } from '#/regras/tipos'

export class ErroDeExclusao extends Error {
  constructor(mensagem: string) {
    super(mensagem)
    this.name = 'ErroDeExclusao'
  }
}

export interface AlunoAExcluir {
  id: string
  email: string
  /** Todos os e-mails que ele já teve (o atual e os de trocas anteriores). */
  emails: string[]
}

// biome-ignore lint/suspicious/noExplicitAny: comandos do Drizzle de tipos variados, só passam ao batch
export type ComandoDeApagar = any

export type ApagadorDeAluno = (
  db: LibSQLDatabase<typeof schema>,
  aluno: AlunoAExcluir,
) => ComandoDeApagar[]

export const APAGADORES_DE_ALUNO: ApagadorDeAluno[] = [
  (db, { id }) => [
    db
      .delete(origemDaMatricula)
      .where(
        inArray(
          origemDaMatricula.matriculaId,
          db
            .select({ id: matricula.id })
            .from(matricula)
            .where(eq(matricula.userId, id)),
        ),
      ),
    db.delete(matricula).where(eq(matricula.userId, id)),
  ],
  (db, { id }) => [
    db.delete(progressoDaAula).where(eq(progressoDaAula.userId, id)),
    db.delete(favorito).where(eq(favorito.userId, id)),
    db.delete(avaliacaoDaAula).where(eq(avaliacaoDaAula.userId, id)),
  ],
  // Quizzes (#51, #52): as tentativas dele (com as respostas abertas e as entregas, em cascata) e as
  // liberações de tentativa que a Equipe deu a ele.
  (db, { id }) => {
    const tentativasDele = db
      .select({ id: tentativaDoQuiz.id })
      .from(tentativaDoQuiz)
      .where(eq(tentativaDoQuiz.userId, id))
    return [
      db
        .delete(arquivoDaResposta)
        .where(inArray(arquivoDaResposta.tentativaId, tentativasDele)),
      db
        .delete(respostaAbertaDoQuiz)
        .where(inArray(respostaAbertaDoQuiz.tentativaId, tentativasDele)),
      db
        .delete(liberacaoDeTentativa)
        .where(eq(liberacaoDeTentativa.userId, id)),
      db.delete(tentativaDoQuiz).where(eq(tentativaDoQuiz.userId, id)),
    ]
  },
  // Comentários das aulas (#47): primeiro as respostas de colegas aos comentários dele, depois o que é dele.
  // Os avisos agrupados esperando para virar e-mail para ele também saem.
  (db, { id }) => [
    db
      .delete(comentarioDaAula)
      .where(
        inArray(
          comentarioDaAula.paiId,
          db
            .select({ id: comentarioDaAula.id })
            .from(comentarioDaAula)
            .where(eq(comentarioDaAula.userId, id)),
        ),
      ),
    db.delete(comentarioDaAula).where(eq(comentarioDaAula.userId, id)),
    db
      .delete(avisoAgrupado)
      .where(eq(avisoAgrupado.chave, `resposta-ao-comentario:${id}`)),
  ],
  // Pontos (#54): os lançamentos do aluno, estornados ou não.
  (db, { id }) => [
    db.delete(lancamentoDePontos).where(eq(lancamentoDePontos.userId, id)),
  ],
  // Pedidos do MEC (#56) e certificados (#55): os do aluno saem de vez (a página pública passa a não
  // achar o código). O pedido sai antes porque aponta para o certificado.
  (db, { id }) => [db.delete(pedidoDoMec).where(eq(pedidoDoMec.userId, id))],
  (db, { id }) => [db.delete(certificado).where(eq(certificado.userId, id))],
  // Comunidades (#59): os comentários e as publicações dele (com o que pende delas) e o que ele
  // seguiu ou leu. Uma melhor resposta que era dele deixa a publicação de outra pessoa Em aberto.
  (db, { id }) => {
    const comentariosDele = db
      .select({ id: comentarioDaPublicacao.id })
      .from(comentarioDaPublicacao)
      .where(eq(comentarioDaPublicacao.autorId, id))
    const publicacoesDele = db
      .select({ id: publicacao.id })
      .from(publicacao)
      .where(eq(publicacao.autorId, id))
    return [
      // Os pontos de melhor resposta de quem respondeu às publicações dele saem com elas.
      db
        .delete(lancamentoDePontos)
        .where(
          and(
            eq(lancamentoDePontos.origemTipo, 'melhor-resposta'),
            inArray(
              lancamentoDePontos.origemId,
              db
                .select({ id: comentarioDaPublicacao.id })
                .from(comentarioDaPublicacao)
                .where(
                  inArray(comentarioDaPublicacao.publicacaoId, publicacoesDele),
                ),
            ),
          ),
        ),
      db
        .update(publicacao)
        .set({ melhorRespostaId: null })
        .where(inArray(publicacao.melhorRespostaId, comentariosDele)),
      db
        .delete(comentarioDaPublicacao)
        .where(inArray(comentarioDaPublicacao.paiId, comentariosDele)),
      db
        .delete(comentarioDaPublicacao)
        .where(eq(comentarioDaPublicacao.autorId, id)),
      db
        .delete(seguidorDaPublicacao)
        .where(eq(seguidorDaPublicacao.userId, id)),
      db.delete(leituraDaPublicacao).where(eq(leituraDaPublicacao.userId, id)),
      db
        .delete(comentarioDaPublicacao)
        .where(inArray(comentarioDaPublicacao.publicacaoId, publicacoesDele)),
      db
        .delete(anexoDaPublicacao)
        .where(inArray(anexoDaPublicacao.publicacaoId, publicacoesDele)),
      db
        .delete(seguidorDaPublicacao)
        .where(inArray(seguidorDaPublicacao.publicacaoId, publicacoesDele)),
      db
        .delete(leituraDaPublicacao)
        .where(inArray(leituraDaPublicacao.publicacaoId, publicacoesDele)),
      db.delete(publicacao).where(eq(publicacao.autorId, id)),
    ]
  },
  // Histórico de e-mails e avisos da Voomp guardam o e-mail e o nome: saem junto.
  (db, { id, emails }) => [
    db
      .delete(envioDeEmail)
      .where(
        or(eq(envioDeEmail.userId, id), inArray(envioDeEmail.para, emails)),
      ),
    db
      .update(avisoDeVenda)
      .set({ email: null, nome: null, corpo: '{}' })
      .where(inArray(avisoDeVenda.email, emails)),
  ],
  // O registro de ações guarda e-mails (de trocas e de matrículas em lote): fica o fato, sai a pessoa.
  (db, { id, emails }) => [
    ...emails.map((email) =>
      db
        .update(registroDeAcoes)
        .set({
          detalhe: sql`replace(${registroDeAcoes.detalhe}, ${email}, '[excluído]')`,
        })
        .where(like(registroDeAcoes.detalhe, `%${email}%`)),
    ),
    db
      .update(registroDeAcoes)
      .set({ detalhe: JSON.stringify({ alunoId: id, apagado: true }) })
      .where(like(registroDeAcoes.detalhe, `%"${id}"%`)),
  ],
]

/** Chaves do R2 do que é do aluno: foto, entregas de quiz, PDFs de certificado e arquivos da comunidade. */
async function arquivosDoAluno(
  db: LibSQLDatabase<typeof schema>,
  aluno: { id: string; image: string | null },
): Promise<string[]> {
  const entregas = await db
    .select({ chave: arquivoDaResposta.chave })
    .from(arquivoDaResposta)
    .innerJoin(
      tentativaDoQuiz,
      eq(tentativaDoQuiz.id, arquivoDaResposta.tentativaId),
    )
    .where(eq(tentativaDoQuiz.userId, aluno.id))
  const pdfs = await db
    .select({ chave: certificado.pdfChave })
    .from(certificado)
    .where(eq(certificado.userId, aluno.id))
  const publicacoesDele = await db
    .select({ id: publicacao.id, textoHtml: publicacao.textoHtml })
    .from(publicacao)
    .where(eq(publicacao.autorId, aluno.id))
  // Subconsulta: quem publicou muito passa de 100 publicações (o D1 aceita 100 parâmetros).
  const anexos = await db
    .select({ chave: anexoDaPublicacao.chave })
    .from(anexoDaPublicacao)
    .where(
      inArray(
        anexoDaPublicacao.publicacaoId,
        db
          .select({ id: publicacao.id })
          .from(publicacao)
          .where(eq(publicacao.autorId, aluno.id)),
      ),
    )
  const foto = aluno.image?.startsWith(PREFIXO_DA_FOTO)
    ? [`fotos/${aluno.image.slice(PREFIXO_DA_FOTO.length)}`]
    : []
  return [
    ...foto,
    ...entregas.map((e) => e.chave),
    ...pdfs.flatMap((p) => (p.chave ? [p.chave] : [])),
    ...anexos.map((a) => a.chave),
    ...publicacoesDele.flatMap((p) => chaveDasImagensDoTexto(p.textoHtml)),
  ]
}

/**
 * Apaga o aluno e o que é dele, tudo ou nada, e registra quem pediu. Só aluno: a equipe sai antes.
 * Devolve as chaves dos arquivos dele no R2: quem chama (a cola, com `env.BUCKET`) apaga depois que
 * o banco confirmou.
 */
export async function excluirAluno(
  banco: Banco,
  agora: Relogio,
  entrada: { autorId: string; userId: string },
): Promise<string[]> {
  const db = comoLibsql(banco)
  const [aluno] = await db
    .select()
    .from(user)
    .where(eq(user.id, entrada.userId))
  if (!aluno) throw new ErroDeExclusao('Aluno não encontrado.')
  if (aluno.perfil !== 'aluno') {
    throw new ErroDeExclusao(
      'Essa pessoa é da equipe. Remova-a da equipe antes de excluir.',
    )
  }
  const trocas = await db
    .select({ detalhe: registroDeAcoes.detalhe })
    .from(registroDeAcoes)
    .where(like(registroDeAcoes.detalhe, `%"${aluno.id}"%`))
  const emails = new Set([aluno.email])
  for (const { detalhe } of trocas) {
    try {
      const d = JSON.parse(detalhe) as { de?: unknown; para?: unknown }
      for (const e of [d.de, d.para]) if (typeof e === 'string') emails.add(e)
    } catch {
      // detalhe ilegível não tem e-mail a recolher
    }
  }
  const alvo = { id: aluno.id, email: aluno.email, emails: [...emails] }
  const arquivos = await arquivosDoAluno(db, aluno)
  const comandos = APAGADORES_DE_ALUNO.flatMap((apagar) => apagar(db, alvo))
  await db.batch([
    ...comandos,
    // O registro vai por último: o apagador acima já limpou os registros antigos dele.
    db.delete(user).where(eq(user.id, aluno.id)),
    prepararRegistro(banco, agora, {
      autorId: entrada.autorId,
      acao: 'aluno-excluido',
      detalhe: { alunoId: aluno.id },
    }),
  ] as unknown as [ComandoDeApagar, ...ComandoDeApagar[]])
  return arquivos
}
