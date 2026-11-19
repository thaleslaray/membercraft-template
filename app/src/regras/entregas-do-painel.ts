// Entregas dos exercícios (quizzes) vistas pela Equipe: a lista de todas as tentativas, com filtros,
// e o detalhe de uma tentativa (o que a aluna respondeu em cada pergunta). Só leitura; a correção
// continua em `quiz-correcao.ts`. O detalhe usa a cópia das perguntas guardada na tentativa, não o
// quiz de hoje.

import { and, count, desc, eq, like, or, type SQL, sql } from 'drizzle-orm'
import {
  arquivoDaResposta,
  aula,
  curso,
  matricula,
  modulo,
  quiz,
  respostaAbertaDoQuiz,
  tentativaDoQuiz,
  turma,
  user,
} from '#/db/schema'
import { ehAberta, ID_DO_OUTRO, passaPelaEquipe } from '#/regras/entregas'
import type { TomDeEstado } from '#/regras/painel'
import type {
  ArquivoDaEntrega,
  EstadoDaTentativa,
  PerguntaCopiada,
  Respostas,
  SituacaoDaResposta,
} from '#/regras/quiz'
import { type Banco, comoLibsql } from '#/regras/tipos'

export const POR_PAGINA_DE_ENTREGAS = 50

export const ESTADO_DA_ENTREGA: Record<
  EstadoDaTentativa,
  { rotulo: string; tom: TomDeEstado }
> = {
  aguardando_correcao: { rotulo: 'Aguardando correção', tom: 'atencao' },
  aprovada: { rotulo: 'Aprovada', tom: 'ok' },
  reprovada: { rotulo: 'Reprovada', tom: 'perigo' },
}

export const ESTADOS_DA_ENTREGA = Object.keys(
  ESTADO_DA_ENTREGA,
) as EstadoDaTentativa[]

export const estadoDaEntregaValido = (
  valor: unknown,
): EstadoDaTentativa | undefined => ESTADOS_DA_ENTREGA.find((e) => e === valor)

// ---------- O que a aluna respondeu (puro) ----------

export interface EscolhaDaEntrega {
  id: string
  texto: string
  marcada: boolean
  correta: boolean
}

export interface PerguntaDaEntrega {
  id: string
  tipo: string
  enunciado: string
  /** Id da resposta aberta (só texto livre e arquivo): é o que a Equipe corrige. */
  respostaId: string | null
  texto: string | null
  arquivos: ArquivoDaEntrega[]
  /** Alternativas das perguntas de escolha, com a marcada pela aluna e a correta. */
  escolhas: EscolhaDaEntrega[]
  situacao: SituacaoDaResposta | null
  comentario: string | null
}

export interface RespostaAbertaGuardada {
  id: string
  perguntaId: string
  texto: string | null
  situacao: SituacaoDaResposta
  comentario: string | null
}

export interface ArquivoGuardado extends ArquivoDaEntrega {
  perguntaId: string
}

/** Junta a cópia das perguntas, o que foi marcado, as respostas abertas e os arquivos. */
export function montarPerguntasDaEntrega(
  copia: PerguntaCopiada[],
  respostas: Respostas,
  abertas: RespostaAbertaGuardada[],
  arquivos: ArquivoGuardado[],
): PerguntaDaEntrega[] {
  return copia.map((p) => {
    const aberta = ehAberta(p.tipo)
    const r = passaPelaEquipe(p)
      ? abertas.find((x) => x.perguntaId === p.id)
      : undefined
    const marcadas = new Set(respostas[p.id] ?? [])
    return {
      id: p.id,
      tipo: p.tipo,
      enunciado: p.enunciado,
      respostaId: r?.id ?? null,
      texto: r?.texto ?? null,
      arquivos: aberta
        ? arquivos
            .filter((a) => a.perguntaId === p.id)
            .map(({ id, nome, tipo, tamanho }) => ({ id, nome, tipo, tamanho }))
        : [],
      escolhas: aberta
        ? []
        : [
            ...p.alternativas.map((a) => ({
              id: a.id,
              texto: a.texto,
              marcada: marcadas.has(a.id),
              correta: a.correta,
            })),
            ...(p.outro
              ? [
                  {
                    id: ID_DO_OUTRO,
                    texto: 'Outro',
                    marcada: marcadas.has(ID_DO_OUTRO),
                    correta: false,
                  },
                ]
              : []),
          ],
      situacao: r?.situacao ?? null,
      comentario: r?.comentario ?? null,
    }
  })
}

/** Como mostrar um arquivo: imagem e PDF abrem na própria tela; o resto só baixa. */
export type FormaDoArquivo = 'imagem' | 'pdf' | 'outro'

// Só formatos raster: SVG pode trazer script e, aberto direto, rodaria na origem do app.
const IMAGENS_SEGURAS = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/avif',
])

export function formaDoArquivo(tipo: string): FormaDoArquivo {
  const t = tipo.toLowerCase().split(';')[0]?.trim() ?? ''
  if (IMAGENS_SEGURAS.has(t)) return 'imagem'
  if (t === 'application/pdf') return 'pdf'
  return 'outro'
}

// ---------- Lista ----------

export interface FiltrosDeEntregas {
  cursoId?: string
  quizId?: string
  turmaId?: string
  /** Busca por parte do nome ou do e-mail. */
  aluno?: string
  /** Uma aluna só, pelo id (ficha da aluna). */
  alunoId?: string
  estado?: EstadoDaTentativa
}

export interface LinhaDeEntrega {
  id: string
  numero: number
  estado: EstadoDaTentativa
  enviadaEm: Date
  acertos: number
  total: number
  percentual: number
  alunoId: string
  alunoNome: string
  alunoEmail: string
  quizId: string
  aulaTitulo: string
  cursoNome: string
  corrigidaPor: string | null
}

export interface PaginaDeEntregas {
  itens: LinhaDeEntrega[]
  pagina: number
  porPagina: number
  total: number
  totalDePaginas: number
}

const comoTexto = (t: string) => t.trim().replace(/[%_]/g, '')

function condicoes(f: FiltrosDeEntregas): SQL | undefined {
  const termo = comoTexto(f.aluno ?? '')
  const partes: (SQL | undefined)[] = [
    f.cursoId ? eq(curso.id, f.cursoId) : undefined,
    f.quizId ? eq(tentativaDoQuiz.quizId, f.quizId) : undefined,
    f.turmaId
      ? sql`${tentativaDoQuiz.userId} in (select ${matricula.userId} from ${matricula} where ${matricula.turmaId} = ${f.turmaId})`
      : undefined,
    f.alunoId ? eq(tentativaDoQuiz.userId, f.alunoId) : undefined,
    termo
      ? or(
          like(user.email, `%${termo.toLowerCase()}%`),
          like(user.name, `%${termo}%`),
        )
      : undefined,
    f.estado ? eq(tentativaDoQuiz.estado, f.estado) : undefined,
  ]
  return and(...partes)
}

const DA_TENTATIVA = {
  id: tentativaDoQuiz.id,
  numero: tentativaDoQuiz.numero,
  estado: tentativaDoQuiz.estado,
  enviadaEm: tentativaDoQuiz.enviadaEm,
  acertos: tentativaDoQuiz.acertos,
  total: tentativaDoQuiz.total,
  percentual: tentativaDoQuiz.percentual,
  alunoId: tentativaDoQuiz.userId,
  alunoNome: user.name,
  alunoEmail: user.email,
  aulaTitulo: aula.titulo,
  cursoNome: curso.nome,
}

// Quem corrigiu: o autor da última marcação de uma resposta da tentativa (nulo se nunca passou
// pela fila). Subconsulta, para sair na mesma ida da lista.
const corrigidaPor = sql<
  string | null
>`(select coalesce(nullif(u.name, ''), u.email) from ${respostaAbertaDoQuiz} r inner join "user" u on u.id = r.corrigida_por_id where r.tentativa_id = ${tentativaDoQuiz.id} and r.corrigida_por_id is not null order by r.corrigida_em desc limit 1)`

/** As tentativas dos exercícios, das mais novas para as mais antigas, 50 por página. */
export async function listarEntregas(
  banco: Banco,
  filtros: FiltrosDeEntregas = {},
  pagina = 1,
): Promise<PaginaDeEntregas> {
  const db = comoLibsql(banco)
  const onde = condicoes(filtros)
  const [itens, [totalLinha]] = await Promise.all([
    db
      .select({
        ...DA_TENTATIVA,
        quizId: tentativaDoQuiz.quizId,
        corrigidaPor: corrigidaPor.as('corrigida_por'),
      })
      .from(tentativaDoQuiz)
      .innerJoin(quiz, eq(quiz.id, tentativaDoQuiz.quizId))
      .innerJoin(aula, eq(aula.id, quiz.aulaId))
      .innerJoin(modulo, eq(modulo.id, aula.moduloId))
      .innerJoin(curso, eq(curso.id, modulo.cursoId))
      .innerJoin(user, eq(user.id, tentativaDoQuiz.userId))
      .where(onde)
      .orderBy(desc(tentativaDoQuiz.enviadaEm), desc(tentativaDoQuiz.id))
      .limit(POR_PAGINA_DE_ENTREGAS)
      .offset((pagina - 1) * POR_PAGINA_DE_ENTREGAS),
    db
      .select({ total: count() })
      .from(tentativaDoQuiz)
      .innerJoin(quiz, eq(quiz.id, tentativaDoQuiz.quizId))
      .innerJoin(aula, eq(aula.id, quiz.aulaId))
      .innerJoin(modulo, eq(modulo.id, aula.moduloId))
      .innerJoin(curso, eq(curso.id, modulo.cursoId))
      .innerJoin(user, eq(user.id, tentativaDoQuiz.userId))
      .where(onde),
  ])
  const total = totalLinha?.total ?? 0
  return {
    itens,
    pagina,
    porPagina: POR_PAGINA_DE_ENTREGAS,
    total,
    totalDePaginas: Math.max(1, Math.ceil(total / POR_PAGINA_DE_ENTREGAS)),
  }
}

// ---------- Opções dos filtros ----------

export interface OpcoesDeEntregas {
  cursos: { id: string; nome: string }[]
  exercicios: { id: string; titulo: string; cursoId: string }[]
  turmas: { id: string; nome: string; cursoId: string }[]
}

/** O que cabe nas listas de filtro: cursos, exercícios (quizzes) e turmas. Uma ida só. */
export async function opcoesDeEntregas(
  banco: Banco,
): Promise<OpcoesDeEntregas> {
  const db = comoLibsql(banco)
  const [cursos, exercicios, turmas] = await Promise.all([
    db
      .select({ id: curso.id, nome: curso.nome })
      .from(curso)
      .orderBy(curso.nome),
    db
      .select({
        id: sql<string>`${quiz.id}`.as('quiz_chave'),
        titulo: aula.titulo,
        cursoId: curso.id,
      })
      .from(quiz)
      .innerJoin(aula, eq(aula.id, quiz.aulaId))
      .innerJoin(modulo, eq(modulo.id, aula.moduloId))
      .innerJoin(curso, eq(curso.id, modulo.cursoId))
      .orderBy(aula.titulo),
    db
      .select({ id: turma.id, nome: turma.nome, cursoId: turma.cursoId })
      .from(turma)
      .orderBy(turma.nome),
  ])
  return { cursos, exercicios, turmas }
}

// ---------- Detalhe ----------

export interface EntregaDetalhada extends LinhaDeEntrega {
  corrigidaEm: Date | null
  perguntas: PerguntaDaEntrega[]
}

/** Uma tentativa por inteiro: todas as perguntas, com o que a aluna respondeu. */
export async function detalheDaEntrega(
  banco: Banco,
  tentativaId: string,
): Promise<EntregaDetalhada | null> {
  const db = comoLibsql(banco)
  const [[linha], abertas, arquivos] = await Promise.all([
    db
      .select({
        ...DA_TENTATIVA,
        quizId: tentativaDoQuiz.quizId,
        corrigidaPor: corrigidaPor.as('corrigida_por'),
        corrigidaEm: tentativaDoQuiz.corrigidaEm,
        perguntas: tentativaDoQuiz.perguntas,
        respostas: tentativaDoQuiz.respostas,
      })
      .from(tentativaDoQuiz)
      .innerJoin(quiz, eq(quiz.id, tentativaDoQuiz.quizId))
      .innerJoin(aula, eq(aula.id, quiz.aulaId))
      .innerJoin(modulo, eq(modulo.id, aula.moduloId))
      .innerJoin(curso, eq(curso.id, modulo.cursoId))
      .innerJoin(user, eq(user.id, tentativaDoQuiz.userId))
      .where(eq(tentativaDoQuiz.id, tentativaId)),
    db
      .select()
      .from(respostaAbertaDoQuiz)
      .where(eq(respostaAbertaDoQuiz.tentativaId, tentativaId)),
    db
      .select()
      .from(arquivoDaResposta)
      .where(eq(arquivoDaResposta.tentativaId, tentativaId))
      .orderBy(arquivoDaResposta.enviadoEm, arquivoDaResposta.nome),
  ])
  if (!linha) return null
  const { perguntas, respostas, ...resto } = linha
  return {
    ...resto,
    perguntas: montarPerguntasDaEntrega(
      JSON.parse(perguntas) as PerguntaCopiada[],
      JSON.parse(respostas) as Respostas,
      abertas,
      arquivos,
    ),
  }
}
