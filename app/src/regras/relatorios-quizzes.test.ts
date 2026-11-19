import { describe, expect, it } from 'vitest'
import { user } from '#/db/schema'
import { criarAula, criarCurso, criarModulo } from '#/regras/conteudo'
import {
  type DefinicaoDoQuiz,
  enviarTentativa,
  obterQuizDoAluno,
  obterQuizDoPainel,
  salvarQuiz,
} from '#/regras/quiz'
import { periodoDoRelatorio } from '#/regras/relatorios'
import {
  relatorioDeQuizzes,
  respostasDosQuizzes,
} from '#/regras/relatorios-quizzes'
import { criarBancoDeTeste } from '#/test/banco'

const D = (texto: string) => new Date(texto)
const hoje = D('2026-06-15T15:00:00Z')
const periodo = periodoDoRelatorio(hoje, '2026-06-01', '2026-06-15')

const definicao: DefinicaoDoQuiz = {
  soQuiz: false,
  obrigatorio: false,
  obrigatorioParaCertificado: false,
  minimoDeAcertos: 50,
  maximoDeTentativas: null,
  pontos: 100,
  perguntas: [
    {
      tipo: 'unica',
      enunciado: 'Cor primária?',
      alternativas: [
        { texto: 'Verde', correta: false },
        { texto: 'Azul', correta: true },
      ],
    },
    {
      tipo: 'unica',
      enunciado: 'Cor quente?',
      alternativas: [
        { texto: 'Vermelho', correta: true },
        { texto: 'Azul', correta: false },
      ],
    },
  ],
}

async function cenario() {
  const db = await criarBancoDeTeste()
  await db.insert(user).values([
    { id: 'ana', name: 'Ana', email: 'ana@x.test' },
    { id: 'bia', name: 'Bia', email: 'bia@x.test' },
  ])
  const cursoId = await criarCurso(db, { nome: 'Coloração' })
  const moduloId = await criarModulo(db, cursoId, { nome: 'Base' })
  const aulaId = await criarAula(db, moduloId, { titulo: 'Cores' })
  await salvarQuiz(db, aulaId, definicao)
  const aluno = await obterQuizDoAluno(db, 'ana', aulaId)
  const painel = await obterQuizDoPainel(db, aulaId)
  // Respostas por posição: true = marca a correta, false = marca a errada.
  const responder = async (
    userId: string,
    quando: string,
    acertos: [boolean, boolean],
  ) => {
    const respostas: Record<string, string[]> = {}
    for (const [i, p] of (aluno?.perguntas ?? []).entries()) {
      const certa = acertos[i]
      const def = painel?.perguntas[i]
      respostas[p.id] = p.alternativas
        .filter((_, j) => (def?.alternativas[j]?.correta ?? false) === certa)
        .map((a) => a.id)
    }
    return enviarTentativa(db, () => D(quando), userId, aulaId, respostas)
  }
  return { db, responder, cursoId }
}

describe('relatório de quizzes', () => {
  it('conta tentativas, aprovação e o acerto por pergunta (a mais errada primeiro)', async () => {
    const { db, responder } = await cenario()
    await responder('ana', '2026-06-10T12:00:00Z', [false, false]) // reprovada
    await responder('ana', '2026-06-11T12:00:00Z', [true, false]) // 50%: aprovada
    await responder('bia', '2026-06-12T12:00:00Z', [true, true]) // aprovada
    const r = await relatorioDeQuizzes(db, { periodo })
    expect(r.quizzes).toHaveLength(1)
    expect(r.quizzes[0]).toMatchObject({
      aulaTitulo: 'Cores',
      tentativas: 3,
      alunos: 2,
      aprovadas: 2,
      reprovadas: 1,
      aguardandoCorrecao: 0,
      taxaDeAprovacao: 67,
    })
    expect(
      r.quizzes[0]?.perguntas.map((p) => [p.enunciado, p.percentualDeAcerto]),
    ).toEqual([
      ['Cor quente?', 33],
      ['Cor primária?', 67],
    ])
  })

  it('respeita período e curso', async () => {
    const { db, responder, cursoId } = await cenario()
    await responder('ana', '2026-05-20T12:00:00Z', [true, true])
    expect((await relatorioDeQuizzes(db, { periodo })).quizzes).toEqual([])
    const maio = await relatorioDeQuizzes(db, {
      periodo: periodoDoRelatorio(hoje, '2026-05-01', '2026-05-31'),
      cursoId,
    })
    expect(maio.quizzes[0]?.tentativas).toBe(1)
    const outro = await relatorioDeQuizzes(db, {
      periodo: periodoDoRelatorio(hoje, '2026-05-01', '2026-05-31'),
      cursoId: 'outro',
    })
    expect(outro.quizzes).toEqual([])
  })

  it('as respostas saem uma linha por pergunta, com o que o aluno marcou', async () => {
    const { db, responder } = await cenario()
    await responder('ana', '2026-06-10T12:00:00Z', [true, false])
    const linhas = await respostasDosQuizzes(db, { periodo })
    expect(
      linhas.map((l) => [l.alunoNome, l.pergunta, l.resposta, l.acertou]),
    ).toEqual([
      ['Ana', 'Cor primária?', 'Azul', true],
      ['Ana', 'Cor quente?', 'Azul', false],
    ])
  })
})
