// Correção das entregas do quiz pela Equipe (#52): a fila "Aguardando correção", a marcação de cada
// resposta aberta como certa ou errada (com comentário) e "liberar nova tentativa".
//
// Pontos de extensão (`GanchosDaCorrecao`, passados por quem chama; nada de registro global):
// - `aoCorrigir`: o aviso no sininho do aluno (#46) entra aqui, quando a tentativa termina de ser
//   corrigida;
// - `aoAprovarPelaPrimeiraVez`: os pontos (#54), o mesmo gancho do envio.

import { and, asc, eq, inArray, isNotNull, isNull, sql } from 'drizzle-orm'
import {
  arquivoDaResposta,
  aula,
  curso,
  liberacaoDeTentativa,
  modulo,
  quiz,
  respostaAbertaDoQuiz,
  tentativaDoQuiz,
  user,
} from '#/db/schema'
import {
  montarPerguntasDaEntrega,
  type PerguntaDaEntrega,
} from '#/regras/entregas-do-painel'
import type { ContextoDaAula } from '#/regras/progresso'
import {
  type ArquivoDaEntrega,
  corrigirTentativa,
  ErroDeQuiz,
  type EstadoDaTentativa,
  type GanchosDoQuiz,
  liberacoesDoAluno,
  limiteDoAluno,
  type PerguntaCopiada,
  puladasDaTentativa,
  type Respostas,
  type SituacaoDaResposta,
  situacaoDoAluno,
} from '#/regras/quiz'
import { type Banco, comoLibsql, type Relogio } from '#/regras/tipos'

const novoId = () => crypto.randomUUID()

export const LIMITE_DO_COMENTARIO = 2000

export interface GanchosDaCorrecao extends GanchosDoQuiz {
  /** Roda quando a última resposta aberta da tentativa é marcada e ela ganha a nota. */
  aoCorrigir?: (
    contexto: ContextoDaAula & {
      quizId: string
      tentativaId: string
      numero: number
      aprovada: boolean
    },
  ) => Promise<void>
}

// ---------- Fila ----------

export interface RespostaNaFila {
  id: string
  perguntaId: string
  tipo: string
  enunciado: string
  texto: string | null
  situacao: SituacaoDaResposta
  comentario: string | null
  arquivos: ArquivoDaEntrega[]
}

export interface ItemDaFila {
  tentativaId: string
  quizId: string
  aulaId: string
  aulaTitulo: string
  cursoNome: string
  alunoId: string
  alunoNome: string
  alunoEmail: string
  numero: number
  enviadaEm: Date
  respostas: RespostaNaFila[]
  /** Todas as perguntas da tentativa, na ordem, com o que a aluna respondeu (inclusive múltipla). */
  perguntas: PerguntaDaEntrega[]
}

/** Tentativas "Aguardando correção", das mais antigas para as mais novas. */
export async function listarAguardandoCorrecao(
  db: Banco,
): Promise<ItemDaFila[]> {
  const c = comoLibsql(db)
  // Tentativas, respostas e arquivos saem numa ida só: respostas e arquivos pedem "as tentativas
  // aguardando correção" por subconsulta, em vez de esperar a lista de tentativas chegar.
  const aguardando = c
    .select({ id: tentativaDoQuiz.id })
    .from(tentativaDoQuiz)
    .where(eq(tentativaDoQuiz.estado, 'aguardando_correcao'))
  const [tentativas, respostas, arquivosBrutos] = await c.batch([
    c
      .select({
        t: tentativaDoQuiz,
        // Apelidos: no `batch` do D1 colunas de mesmo nome (`id`) se fundem (veja `conferirColunas`
        // em src/test/banco.ts).
        quizId: sql<string>`${quiz.id}`.as('quiz_chave'),
        aulaId: sql<string>`${aula.id}`.as('aula_chave'),
        aulaTitulo: aula.titulo,
        cursoNome: curso.nome,
        alunoNome: user.name,
        alunoEmail: user.email,
      })
      .from(tentativaDoQuiz)
      .innerJoin(quiz, eq(quiz.id, tentativaDoQuiz.quizId))
      .innerJoin(aula, eq(aula.id, quiz.aulaId))
      .innerJoin(modulo, eq(modulo.id, aula.moduloId))
      .innerJoin(curso, eq(curso.id, modulo.cursoId))
      .innerJoin(user, eq(user.id, tentativaDoQuiz.userId))
      .where(eq(tentativaDoQuiz.estado, 'aguardando_correcao'))
      .orderBy(asc(tentativaDoQuiz.enviadaEm), asc(tentativaDoQuiz.id)),
    c
      .select()
      .from(respostaAbertaDoQuiz)
      .where(inArray(respostaAbertaDoQuiz.tentativaId, aguardando)),
    c
      .select()
      .from(arquivoDaResposta)
      .where(inArray(arquivoDaResposta.tentativaId, aguardando)),
  ])
  if (tentativas.length === 0) return []
  const arquivos = [...arquivosBrutos].sort(
    (a, b) =>
      a.enviadoEm.getTime() - b.enviadoEm.getTime() ||
      (a.nome < b.nome ? -1 : a.nome > b.nome ? 1 : 0),
  )
  return tentativas.map((l) => {
    // A pergunta vem da cópia guardada na tentativa, não do quiz de hoje.
    const copia = JSON.parse(l.t.perguntas) as PerguntaCopiada[]
    return {
      tentativaId: l.t.id,
      quizId: l.quizId,
      aulaId: l.aulaId,
      aulaTitulo: l.aulaTitulo,
      cursoNome: l.cursoNome,
      alunoId: l.t.userId,
      alunoNome: l.alunoNome,
      alunoEmail: l.alunoEmail,
      numero: l.t.numero,
      enviadaEm: l.t.enviadaEm,
      perguntas: montarPerguntasDaEntrega(
        copia,
        JSON.parse(l.t.respostas) as Respostas,
        respostas.filter((x) => x.tentativaId === l.t.id),
        arquivos.filter((a) => a.tentativaId === l.t.id),
      ),
      respostas: copia.flatMap((p) => {
        const r = respostas.find(
          (x) => x.tentativaId === l.t.id && x.perguntaId === p.id,
        )
        if (!r) return []
        return [
          {
            id: r.id,
            perguntaId: p.id,
            tipo: p.tipo,
            enunciado: p.enunciado,
            texto: r.texto,
            situacao: r.situacao,
            comentario: r.comentario,
            arquivos: arquivos
              .filter((a) => a.tentativaId === l.t.id && a.perguntaId === p.id)
              .map((a) => ({
                id: a.id,
                nome: a.nome,
                tipo: a.tipo,
                tamanho: a.tamanho,
              })),
          },
        ]
      }),
    }
  })
}

/** Quantas tentativas esperam correção (contador do menu do painel). */
export async function contarAguardandoCorrecao(db: Banco): Promise<number> {
  const linhas = await comoLibsql(db)
    .select({ id: tentativaDoQuiz.id })
    .from(tentativaDoQuiz)
    .where(eq(tentativaDoQuiz.estado, 'aguardando_correcao'))
  return linhas.length
}

// ---------- Correção ----------

export interface Correcao {
  correta: boolean
  comentario?: string | null
}

/**
 * A Equipe marca uma resposta aberta como certa ou errada, com comentário opcional. Dá para mudar
 * a marcação enquanto a tentativa ainda aguarda; quando a última resposta é marcada a tentativa
 * ganha a nota (aprovada ou reprovada) e os ganchos rodam.
 */
export async function corrigirResposta(
  db: Banco,
  agora: Relogio,
  corretorId: string,
  respostaId: string,
  correcao: Correcao,
  ganchos: GanchosDaCorrecao = {},
): Promise<{ fechada: boolean; estado: EstadoDaTentativa }> {
  const c = comoLibsql(db)
  const [achada] = await c
    .select({ t: tentativaDoQuiz, aulaId: quiz.aulaId, pontos: quiz.pontos })
    .from(respostaAbertaDoQuiz)
    .innerJoin(
      tentativaDoQuiz,
      eq(tentativaDoQuiz.id, respostaAbertaDoQuiz.tentativaId),
    )
    .innerJoin(quiz, eq(quiz.id, tentativaDoQuiz.quizId))
    .where(eq(respostaAbertaDoQuiz.id, respostaId))
  if (!achada) throw new ErroDeQuiz('Resposta não encontrada.')
  const { t } = achada
  if (t.estado !== 'aguardando_correcao') {
    throw new ErroDeQuiz('Esta resposta já foi corrigida.')
  }
  const comentario = correcao.comentario?.trim() || null
  if (comentario && comentario.length > LIMITE_DO_COMENTARIO) {
    throw new ErroDeQuiz(
      `O comentário passa de ${LIMITE_DO_COMENTARIO} caracteres.`,
    )
  }
  await c
    .update(respostaAbertaDoQuiz)
    .set({
      situacao: correcao.correta ? 'certa' : 'errada',
      comentario,
      corrigidaPorId: corretorId,
      corrigidaEm: agora(),
    })
    .where(eq(respostaAbertaDoQuiz.id, respostaId))

  const todas = await c
    .select({
      perguntaId: respostaAbertaDoQuiz.perguntaId,
      situacao: respostaAbertaDoQuiz.situacao,
    })
    .from(respostaAbertaDoQuiz)
    .where(eq(respostaAbertaDoQuiz.tentativaId, t.id))
  if (todas.some((r) => r.situacao === 'pendente')) {
    return { fechada: false, estado: 'aguardando_correcao' }
  }

  const copia = JSON.parse(t.perguntas) as PerguntaCopiada[]
  const marcadas = JSON.parse(t.respostas) as Respostas
  const nota = corrigirTentativa(
    copia,
    marcadas,
    t.minimoDeAcertos,
    Object.fromEntries(todas.map((r) => [r.perguntaId, r.situacao])),
    puladasDaTentativa(
      copia,
      marcadas,
      new Set(todas.map((r) => r.perguntaId)),
    ),
  )
  const estado: EstadoDaTentativa = nota.aprovada ? 'aprovada' : 'reprovada'
  // O `where` no estado impede que duas correções simultâneas fechem (e avisem) duas vezes.
  const fechadas = await c
    .update(tentativaDoQuiz)
    .set({
      estado,
      acertos: nota.acertos,
      total: nota.total,
      percentual: nota.percentual,
      corrigidaEm: agora(),
    })
    .where(
      and(
        eq(tentativaDoQuiz.id, t.id),
        eq(tentativaDoQuiz.estado, 'aguardando_correcao'),
      ),
    )
    .returning({ id: tentativaDoQuiz.id })
  if (fechadas.length === 0) return { fechada: false, estado }

  await ganchos.aoCorrigir?.({
    db,
    agora,
    userId: t.userId,
    aulaId: achada.aulaId,
    quizId: t.quizId,
    tentativaId: t.id,
    numero: t.numero,
    aprovada: nota.aprovada,
  })
  if (nota.aprovada) {
    await ganchos.aoAprovarPelaPrimeiraVez?.({
      db,
      agora,
      userId: t.userId,
      aulaId: achada.aulaId,
      quizId: t.quizId,
      pontos: achada.pontos,
    })
  }
  return { fechada: true, estado }
}

// ---------- Liberar nova tentativa ----------

/**
 * Soma uma tentativa ao limite do aluno neste quiz, sem apagar as já feitas. Só faz sentido para
 * quem esgotou o limite, não foi aprovado e não está aguardando correção.
 */
export async function liberarTentativa(
  db: Banco,
  agora: Relogio,
  liberadaPorId: string,
  quizId: string,
  userId: string,
): Promise<void> {
  const c = comoLibsql(db)
  const [linha] = await c.select().from(quiz).where(eq(quiz.id, quizId))
  if (!linha) throw new ErroDeQuiz('Exercício não encontrado.')
  const tentativas = await c
    .select({ estado: tentativaDoQuiz.estado })
    .from(tentativaDoQuiz)
    .where(
      and(
        eq(tentativaDoQuiz.quizId, quizId),
        eq(tentativaDoQuiz.userId, userId),
      ),
    )
  const limite = limiteDoAluno(
    linha.maximoDeTentativas,
    await liberacoesDoAluno(db, quizId, userId),
  )
  const s = situacaoDoAluno(limite, tentativas)
  if (s.aprovado)
    throw new ErroDeQuiz('O aluno já foi aprovado neste exercício.')
  if (s.aguardandoCorrecao) {
    throw new ErroDeQuiz(
      'A tentativa do aluno está aguardando correção. Corrija primeiro.',
    )
  }
  if (limite === null) {
    throw new ErroDeQuiz('Este exercício tem tentativas ilimitadas.')
  }
  if (!s.esgotado) {
    throw new ErroDeQuiz('O aluno ainda tem tentativas neste exercício.')
  }
  await c.insert(liberacaoDeTentativa).values({
    id: novoId(),
    quizId,
    userId,
    liberadaPorId,
    liberadaEm: agora(),
  })
}

export interface AlunoSemTentativas {
  quizId: string
  aulaId: string
  aulaTitulo: string
  cursoNome: string
  alunoId: string
  alunoNome: string
  alunoEmail: string
  tentativas: number
  ultimaEm: Date
  ultimoPercentual: number
}

/** Quem reprovou e esgotou as tentativas: candidatos a "liberar nova tentativa". */
export async function listarSemTentativas(
  db: Banco,
): Promise<AlunoSemTentativas[]> {
  const c = comoLibsql(db)
  // As tentativas e as liberações não dependem uma da outra: uma ida só.
  const [linhas, liberacoes] = await c.batch([
    c
      .select({
        t: tentativaDoQuiz,
        maximo: quiz.maximoDeTentativas,
        // Apelido: no `batch` do D1 colunas de mesmo nome (`id`) se fundem.
        aulaId: sql<string>`${aula.id}`.as('aula_chave'),
        aulaTitulo: aula.titulo,
        cursoNome: curso.nome,
        alunoNome: user.name,
        alunoEmail: user.email,
      })
      .from(tentativaDoQuiz)
      .innerJoin(quiz, eq(quiz.id, tentativaDoQuiz.quizId))
      .innerJoin(aula, eq(aula.id, quiz.aulaId))
      .innerJoin(modulo, eq(modulo.id, aula.moduloId))
      .innerJoin(curso, eq(curso.id, modulo.cursoId))
      .innerJoin(user, eq(user.id, tentativaDoQuiz.userId))
      .where(and(isNotNull(quiz.maximoDeTentativas), isNull(aula.excluidoEm)))
      .orderBy(asc(tentativaDoQuiz.enviadaEm), asc(tentativaDoQuiz.numero)),
    c.select().from(liberacaoDeTentativa),
  ])
  const chave = (quizId: string, userId: string) => `${quizId}:${userId}`
  const extras = new Map<string, number>()
  for (const l of liberacoes) {
    const k = chave(l.quizId, l.userId)
    extras.set(k, (extras.get(k) ?? 0) + 1)
  }
  const grupos = new Map<string, typeof linhas>()
  for (const l of linhas) {
    const k = chave(l.t.quizId, l.t.userId)
    grupos.set(k, [...(grupos.get(k) ?? []), l])
  }
  const resultado: AlunoSemTentativas[] = []
  for (const [k, grupo] of grupos) {
    const ultima = grupo[grupo.length - 1]
    if (!ultima) continue
    const limite = limiteDoAluno(ultima.maximo, extras.get(k) ?? 0)
    const s = situacaoDoAluno(
      limite,
      grupo.map((g) => g.t),
    )
    if (s.aprovado || s.aguardandoCorrecao || !s.esgotado) continue
    resultado.push({
      quizId: ultima.t.quizId,
      aulaId: ultima.aulaId,
      aulaTitulo: ultima.aulaTitulo,
      cursoNome: ultima.cursoNome,
      alunoId: ultima.t.userId,
      alunoNome: ultima.alunoNome,
      alunoEmail: ultima.alunoEmail,
      tentativas: grupo.length,
      ultimaEm: ultima.t.enviadaEm,
      ultimoPercentual: ultima.t.percentual,
    })
  }
  return resultado.sort((a, b) => b.ultimaEm.getTime() - a.ultimaEm.getTime())
}

// ---------- Arquivos ----------

export interface ArquivoDeEntrega {
  chave: string
  nome: string
  tipo: string
  alunoId: string
  aulaId: string
}

/** O arquivo entregue, com o dono: a rota de download confere a permissão com isso. */
export async function arquivoDeEntrega(
  db: Banco,
  arquivoId: string,
): Promise<ArquivoDeEntrega | null> {
  const [linha] = await comoLibsql(db)
    .select({
      chave: arquivoDaResposta.chave,
      nome: arquivoDaResposta.nome,
      tipo: arquivoDaResposta.tipo,
      alunoId: tentativaDoQuiz.userId,
      aulaId: quiz.aulaId,
    })
    .from(arquivoDaResposta)
    .innerJoin(
      tentativaDoQuiz,
      eq(tentativaDoQuiz.id, arquivoDaResposta.tentativaId),
    )
    .innerJoin(quiz, eq(quiz.id, tentativaDoQuiz.quizId))
    .where(eq(arquivoDaResposta.id, arquivoId))
  return linha ?? null
}
