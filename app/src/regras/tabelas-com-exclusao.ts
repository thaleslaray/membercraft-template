import { eq, inArray, type SQLWrapper } from 'drizzle-orm'
import {
  alternativaDaPergunta,
  anexoDaPublicacao,
  arquivoDaResposta,
  aula,
  banner,
  categoria,
  certificado,
  comentarioDaAula,
  comentarioDaPublicacao,
  comunidade,
  conversaDeAtendimento,
  curso,
  favorito,
  lancamentoDePontos,
  liberacaoDeTentativa,
  ligacaoDeVenda,
  materialDaAula,
  matricula,
  mensagemDeAtendimento,
  modeloDeCertificado,
  modulo,
  origemDaMatricula,
  pedidoDoMec,
  perguntaDoQuiz,
  publicacao,
  quiz,
  regraDeLiberacao,
  respostaAbertaDoQuiz,
  tentativaDoQuiz,
  turma,
} from '#/db/schema'
import { chaveDasImagensDoTexto } from '#/regras/anexos-da-comunidade'
import {
  type Comando,
  colunas,
  type TabelaComExclusao,
} from '#/regras/exclusao-protegida'
import { type Banco, comoLibsql } from '#/regras/tipos'

// Subconsulta que devolve ids (nunca uma lista: o D1 limita 100 parâmetros por consulta).
type Ids = SQLWrapper

const comValor = (valores: (string | null)[]): string[] =>
  valores.filter((v): v is string => typeof v === 'string' && v !== '')

// Imagens das perguntas e das alternativas dos quizzes.
async function imagensDosQuizzes(
  banco: Banco,
  quizIds: Ids,
): Promise<string[]> {
  const db = comoLibsql(banco)
  const perguntas = await db
    .select({ imagem: perguntaDoQuiz.imagem })
    .from(perguntaDoQuiz)
    .where(inArray(perguntaDoQuiz.quizId, quizIds))
  const alternativas = await db
    .select({ imagem: alternativaDaPergunta.imagem })
    .from(alternativaDaPergunta)
    .where(
      inArray(
        alternativaDaPergunta.perguntaId,
        db
          .select({ id: perguntaDoQuiz.id })
          .from(perguntaDoQuiz)
          .where(inArray(perguntaDoQuiz.quizId, quizIds)),
      ),
    )
  return comValor([
    ...perguntas.map((p) => p.imagem),
    ...alternativas.map((a) => a.imagem),
  ])
}

// Anexos (guardados no R2) de publicações, mesmo os já tirados ao editar.
async function anexosDasPublicacoes(
  banco: Banco,
  publicacaoIds: Ids,
): Promise<string[]> {
  const linhas = await comoLibsql(banco)
    .select({ chave: anexoDaPublicacao.chave })
    .from(anexoDaPublicacao)
    .where(inArray(anexoDaPublicacao.publicacaoId, publicacaoIds))
  return linhas.map((l) => l.chave)
}

// ---- Dependentes sem cascata no banco ----
// As chaves estrangeiras das fatias não têm `ON DELETE CASCADE` (mudar uma recria a tabela, e isso
// falha no D1 com dados). Então a limpeza apaga os dependentes aqui, no mesmo batch do pai, do mais
// fundo para o mais raso. Cada função devolve os comandos e recebe uma SUBCONSULTA de ids.

/** Quizzes das aulas, com perguntas, alternativas, tentativas, respostas, entregas e liberações. */
function apagarQuizzesDasAulas(db: Banco, aulas: Ids): Comando[] {
  const c = comoLibsql(db)
  const quizzes = c
    .select({ id: quiz.id })
    .from(quiz)
    .where(inArray(quiz.aulaId, aulas))
  const tentativas = c
    .select({ id: tentativaDoQuiz.id })
    .from(tentativaDoQuiz)
    .where(inArray(tentativaDoQuiz.quizId, quizzes))
  return [
    c
      .delete(arquivoDaResposta)
      .where(inArray(arquivoDaResposta.tentativaId, tentativas)),
    c
      .delete(respostaAbertaDoQuiz)
      .where(inArray(respostaAbertaDoQuiz.tentativaId, tentativas)),
    c.delete(tentativaDoQuiz).where(inArray(tentativaDoQuiz.quizId, quizzes)),
    c
      .delete(liberacaoDeTentativa)
      .where(inArray(liberacaoDeTentativa.quizId, quizzes)),
    ...apagarPerguntas(db, quizzes),
    c.delete(perguntaDoQuiz).where(inArray(perguntaDoQuiz.quizId, quizzes)),
    c.delete(quiz).where(inArray(quiz.aulaId, aulas)),
  ]
}

function apagarPerguntas(db: Banco, quizzes: Ids): Comando[] {
  const c = comoLibsql(db)
  return [
    c
      .delete(alternativaDaPergunta)
      .where(
        inArray(
          alternativaDaPergunta.perguntaId,
          c
            .select({ id: perguntaDoQuiz.id })
            .from(perguntaDoQuiz)
            .where(inArray(perguntaDoQuiz.quizId, quizzes)),
        ),
      ),
  ]
}

/** O que depende das aulas: quiz, favoritos, regras de liberação e materiais. */
function apagarDependentesDasAulas(db: Banco, aulas: Ids): Comando[] {
  const c = comoLibsql(db)
  return [
    ...apagarQuizzesDasAulas(db, aulas),
    c.delete(favorito).where(inArray(favorito.aulaId, aulas)),
    c.delete(regraDeLiberacao).where(inArray(regraDeLiberacao.aulaId, aulas)),
    c.delete(materialDaAula).where(inArray(materialDaAula.aulaId, aulas)),
  ]
}

/** O que depende dos módulos: as regras deles e as aulas (com tudo o que depende delas). */
function apagarDependentesDosModulos(db: Banco, modulos: Ids): Comando[] {
  const c = comoLibsql(db)
  const aulas = c
    .select({ id: aula.id })
    .from(aula)
    .where(inArray(aula.moduloId, modulos))
  return [
    ...apagarDependentesDasAulas(db, aulas),
    c
      .delete(regraDeLiberacao)
      .where(inArray(regraDeLiberacao.moduloId, modulos)),
    c.delete(aula).where(inArray(aula.moduloId, modulos)),
  ]
}

/**
 * O que depende dos cursos: módulos e aulas (com o que depende deles), turmas com matrículas, regras e
 * ligações da Voomp, o modelo e os certificados emitidos (e os Pedidos do MEC). Os pontos do aluno ficam,
 * sem o curso.
 */
function apagarDependentesDosCursos(db: Banco, cursos: Ids): Comando[] {
  const c = comoLibsql(db)
  const modulos = c
    .select({ id: modulo.id })
    .from(modulo)
    .where(inArray(modulo.cursoId, cursos))
  const turmas = c
    .select({ id: turma.id })
    .from(turma)
    .where(inArray(turma.cursoId, cursos))
  const matriculas = c
    .select({ id: matricula.id })
    .from(matricula)
    .where(inArray(matricula.turmaId, turmas))
  return [
    ...apagarDependentesDosModulos(db, modulos),
    c.delete(modulo).where(inArray(modulo.cursoId, cursos)),
    c
      .delete(origemDaMatricula)
      .where(inArray(origemDaMatricula.matriculaId, matriculas)),
    c.delete(matricula).where(inArray(matricula.turmaId, turmas)),
    c.delete(regraDeLiberacao).where(inArray(regraDeLiberacao.turmaId, turmas)),
    c.delete(ligacaoDeVenda).where(inArray(ligacaoDeVenda.turmaId, turmas)),
    c.delete(turma).where(inArray(turma.cursoId, cursos)),
    c.delete(pedidoDoMec).where(inArray(pedidoDoMec.cursoId, cursos)),
    c.delete(certificado).where(inArray(certificado.cursoId, cursos)),
    c
      .delete(modeloDeCertificado)
      .where(inArray(modeloDeCertificado.cursoId, cursos)),
    c
      .update(lancamentoDePontos)
      .set({ cursoId: null })
      .where(inArray(lancamentoDePontos.cursoId, cursos)),
  ]
}

// Tabelas com exclusão protegida (coluna `excluidoEm`), limpas todo dia pelo cron.
// Cada fatia que criar uma acrescenta a sua aqui.
// Passo a passo no topo de `src/regras/exclusao-protegida.ts`.
// Filhos antes dos pais: assim os filhos já marcados têm a chave do R2 lida na própria linha. O que
// depende de um pai sem cascata no banco sai pelo `antes` dele (ver acima).
export const TABELAS_COM_EXCLUSAO: TabelaComExclusao[] = [
  { nome: 'comentario_da_aula', tabela: comentarioDaAula },
  {
    nome: 'banner',
    tabela: banner,
    chaves: colunas('imagemComputador', 'imagemCelular'),
  },
  {
    // As imagens anexadas às mensagens ficam no JSON `anexos`; as mensagens saem em cascata.
    nome: 'conversa_de_atendimento',
    tabela: conversaDeAtendimento,
    filhos: async (banco, ids) => {
      const mensagens = await comoLibsql(banco)
        .select({ anexos: mensagemDeAtendimento.anexos })
        .from(mensagemDeAtendimento)
        .where(inArray(mensagemDeAtendimento.conversaId, ids))
      return mensagens.flatMap((m) => {
        try {
          const lista: unknown = JSON.parse(m.anexos)
          return Array.isArray(lista)
            ? lista.filter((a): a is string => typeof a === 'string')
            : []
        } catch {
          return []
        }
      })
    },
  },
  {
    nome: 'material_da_aula',
    tabela: materialDaAula,
    chaves: colunas('chave'),
  },
  {
    // Quiz removido (só sem tentativas): as imagens das perguntas e alternativas saem junto.
    nome: 'quiz',
    tabela: quiz,
    filhos: (banco, vencidas) => imagensDosQuizzes(banco, vencidas),
    // Sem tentativas (só assim o quiz é removido), mas com perguntas e alternativas.
    antes: (banco, vencidas) => {
      const c = comoLibsql(banco)
      return [
        ...apagarPerguntas(banco, vencidas),
        c
          .delete(perguntaDoQuiz)
          .where(inArray(perguntaDoQuiz.quizId, vencidas)),
      ]
    },
  },
  {
    // Aula: miniatura, e o que cai em cascata (quiz com imagens e as entregas dos alunos).
    nome: 'aula',
    tabela: aula,
    chaves: colunas('miniatura'),
    antes: apagarDependentesDasAulas,
    filhos: async (banco, aulas) => {
      const db = comoLibsql(banco)
      const quizzes = db
        .select({ id: quiz.id })
        .from(quiz)
        .where(inArray(quiz.aulaId, aulas))
      const materiais = await db
        .select({ chave: materialDaAula.chave })
        .from(materialDaAula)
        .where(inArray(materialDaAula.aulaId, aulas))
      const entregas = await db
        .select({ chave: arquivoDaResposta.chave })
        .from(arquivoDaResposta)
        .innerJoin(
          tentativaDoQuiz,
          eq(tentativaDoQuiz.id, arquivoDaResposta.tentativaId),
        )
        .where(inArray(tentativaDoQuiz.quizId, quizzes))
      return [
        ...materiais.map((m) => m.chave),
        ...entregas.map((e) => e.chave),
        ...(await imagensDosQuizzes(banco, quizzes)),
      ]
    },
  },
  {
    nome: 'modulo',
    tabela: modulo,
    chaves: colunas('capa'),
    antes: apagarDependentesDosModulos,
  },
  {
    // Curso: capas e destaque, o modelo do certificado e os PDFs já emitidos (saem junto).
    nome: 'curso',
    tabela: curso,
    chaves: colunas('capaHorizontal', 'capaVertical', 'imagemDestaque'),
    antes: apagarDependentesDosCursos,
    filhos: async (banco, ids) => {
      const db = comoLibsql(banco)
      const modelos = await db
        .select({
          frente: modeloDeCertificado.frente,
          verso: modeloDeCertificado.verso,
        })
        .from(modeloDeCertificado)
        .where(inArray(modeloDeCertificado.cursoId, ids))
      const pdfs = await db
        .select({ chave: certificado.pdfChave })
        .from(certificado)
        .where(inArray(certificado.cursoId, ids))
      return comValor([
        ...modelos.flatMap((m) => [m.frente, m.verso]),
        ...pdfs.map((p) => p.chave),
      ])
    },
  },
  {
    // Categoria excluída: os cursos dela ficam sem categoria.
    nome: 'categoria',
    tabela: categoria,
    antes: (banco, categorias) => [
      comoLibsql(banco)
        .update(curso)
        .set({ categoriaId: null })
        .where(inArray(curso.categoriaId, categorias)),
    ],
  },
  { nome: 'comentario_da_publicacao', tabela: comentarioDaPublicacao },
  {
    nome: 'anexo_da_publicacao',
    tabela: anexoDaPublicacao,
    chaves: colunas('chave'),
  },
  {
    nome: 'publicacao',
    tabela: publicacao,
    chaves: (linha) => chaveDasImagensDoTexto(String(linha.textoHtml ?? '')),
    filhos: (banco, ids) => anexosDasPublicacoes(banco, ids),
  },
  {
    nome: 'comunidade',
    tabela: comunidade,
    filhos: async (banco, ids) => {
      const publicacoes = comoLibsql(banco)
        .select({ id: publicacao.id })
        .from(publicacao)
        .where(inArray(publicacao.comunidadeId, ids))
      return anexosDasPublicacoes(banco, publicacoes)
    },
  },
]
