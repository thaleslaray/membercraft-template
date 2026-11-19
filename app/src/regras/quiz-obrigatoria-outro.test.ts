import { describe, expect, it } from 'vitest'
import { user } from '#/db/schema'
import { criarAula, criarCurso, criarModulo } from '#/regras/conteudo'
import { ID_DO_OUTRO, perguntasSemResposta } from '#/regras/entregas'
import {
  type DefinicaoDoQuiz,
  ErroDeQuiz,
  enviarTentativa,
  obterQuizDoAluno,
  obterQuizDoPainel,
  salvarQuiz,
} from '#/regras/quiz'
import {
  corrigirResposta,
  listarAguardandoCorrecao,
} from '#/regras/quiz-correcao'
import { criarBancoDeTeste } from '#/test/banco'

const agora = () => new Date('2026-06-01T12:00:00Z')

const base = (perguntas: DefinicaoDoQuiz['perguntas']): DefinicaoDoQuiz => ({
  soQuiz: false,
  obrigatorio: false,
  obrigatorioParaCertificado: false,
  minimoDeAcertos: 100,
  maximoDeTentativas: 3,
  pontos: 0,
  perguntas,
})

async function cenario(perguntas: DefinicaoDoQuiz['perguntas']) {
  const db = await criarBancoDeTeste()
  await db.insert(user).values([
    { id: 'ana', name: 'Ana', email: 'ana@x.test' },
    { id: 'eq', name: 'Equipe', email: 'eq@x.test' },
  ])
  const cursoId = await criarCurso(db, { nome: 'Coloração' })
  const moduloId = await criarModulo(db, cursoId, { nome: 'Base' })
  const aulaId = await criarAula(db, moduloId, { titulo: 'Cores' })
  await salvarQuiz(db, aulaId, base(perguntas))
  const quiz = await obterQuizDoAluno(db, 'ana', aulaId)
  if (!quiz) throw new Error('quiz')
  const enviar = (
    respostas: Record<string, string[]>,
    textos: Record<string, string> = {},
  ) => enviarTentativa(db, agora, 'ana', aulaId, respostas, {}, { textos })
  return { db, aulaId, quiz, enviar }
}

const escolhaSemGabarito = (extra = {}) => ({
  tipo: 'unica',
  enunciado: 'Qual é a opção certa?',
  alternativas: [
    { texto: 'Opção A', correta: false },
    { texto: 'Opção B', correta: false },
  ],
  ...extra,
})

describe('perguntasSemResposta', () => {
  const ps = [
    { id: 'a' },
    { id: 'b', obrigatoria: false },
    { id: 'c', grupoUmDe: 'g' },
    { id: 'd', grupoUmDe: 'g', obrigatoria: false },
  ]
  it('obrigatória (padrão) sem resposta falta; opcional não', () => {
    expect(perguntasSemResposta(ps, (id) => id === 'c')).toEqual(['a'])
  })
  it('o grupo só falta inteiro, quando nenhuma foi respondida', () => {
    expect(perguntasSemResposta(ps, (id) => id === 'a')).toEqual(['c', 'd'])
    expect(perguntasSemResposta(ps, (id) => id === 'a' || id === 'd')).toEqual(
      [],
    )
  })
})

describe('escolha sem gabarito', () => {
  it('é aceita na definição e vira escolha aberta: aguarda correção, sem erro automático', async () => {
    const { db, aulaId, quiz, enviar } = await cenario([escolhaSemGabarito()])
    const [p] = quiz.perguntas
    expect(p?.corrigidaPelaEquipe).toBe(true)
    const t = await enviar({ [p?.id ?? '']: [p?.alternativas[0]?.id ?? ''] })
    expect(t.estado).toBe('aguardando_correcao')
    const [item] = await listarAguardandoCorrecao(db)
    const pergunta = item?.perguntas[0]
    expect(pergunta?.respostaId).toBeTruthy()
    expect(pergunta?.escolhas.map((e) => [e.texto, e.marcada])).toEqual([
      ['Opção A', true],
      ['Opção B', false],
    ])
    const fim = await corrigirResposta(
      db,
      agora,
      'eq',
      pergunta?.respostaId ?? '',
      { correta: true },
    )
    expect(fim).toEqual({ fechada: true, estado: 'aprovada' })
    expect(
      (await obterQuizDoPainel(db, aulaId))?.perguntas[0]?.alternativas,
    ).toHaveLength(2)
  })

  it('a equipe pode marcar errada e a tentativa reprova', async () => {
    const { db, quiz, enviar } = await cenario([escolhaSemGabarito()])
    const [p] = quiz.perguntas
    await enviar({ [p?.id ?? '']: [p?.alternativas[1]?.id ?? ''] })
    const [item] = await listarAguardandoCorrecao(db)
    const fim = await corrigirResposta(
      db,
      agora,
      'eq',
      item?.perguntas[0]?.respostaId ?? '',
      { correta: false },
    )
    expect(fim.estado).toBe('reprovada')
  })

  it('"Outro" só vale sem alternativa correta', async () => {
    const { db, aulaId } = await cenario([escolhaSemGabarito()])
    await expect(
      salvarQuiz(
        db,
        aulaId,
        base([
          {
            tipo: 'unica',
            enunciado: 'P',
            outro: true,
            alternativas: [
              { texto: 'A', correta: true },
              { texto: 'B', correta: false },
            ],
          },
        ]),
      ),
    ).rejects.toThrow(/Outro/)
  })
})

describe('"Outro"', () => {
  it('guarda o texto, mostra na fila e exige o texto quando marcado', async () => {
    const { db, quiz, enviar } = await cenario([
      escolhaSemGabarito({ outro: true }),
    ])
    const [p] = quiz.perguntas
    expect(p?.outro).toBe(true)
    const id = p?.id ?? ''
    await expect(enviar({ [id]: [ID_DO_OUTRO] })).rejects.toThrow(/Outro/)
    const t = await enviar({ [id]: [ID_DO_OUTRO] }, { [id]: 'Opção C' })
    expect(t.estado).toBe('aguardando_correcao')
    expect(t.perguntas[0]?.aberta?.texto).toBe('Opção C')
    const [item] = await listarAguardandoCorrecao(db)
    expect(item?.perguntas[0]?.texto).toBe('Opção C')
    expect(
      item?.perguntas[0]?.escolhas.find((e) => e.id === ID_DO_OUTRO)?.marcada,
    ).toBe(true)
  })

  it('recusa "Outro" em pergunta que não o oferece', async () => {
    const { quiz, enviar } = await cenario([escolhaSemGabarito()])
    const id = quiz.perguntas[0]?.id ?? ''
    await expect(
      enviar({ [id]: [ID_DO_OUTRO] }, { [id]: 'x' }),
    ).rejects.toThrow(ErroDeQuiz)
  })
})

describe('obrigatória e grupo "um destes"', () => {
  const link = {
    tipo: 'texto_livre',
    enunciado: 'Link',
    obrigatoria: false,
    grupoUmDe: 'link-ou-arquivo',
    alternativas: [],
  }
  const arquivo = {
    tipo: 'arquivo',
    enunciado: 'Arquivo',
    obrigatoria: false,
    grupoUmDe: 'link-ou-arquivo',
    alternativas: [],
  }

  it('o grupo link/arquivo aceita só o link e a tentativa vai para a equipe', async () => {
    const { db, quiz, enviar } = await cenario([link, arquivo])
    const [l, a] = quiz.perguntas
    expect(l?.grupoUmDe).toBe('link-ou-arquivo')
    const t = await enviar(
      {},
      { [l?.id ?? '']: 'https://exemplo.com/planilha' },
    )
    expect(t.estado).toBe('aguardando_correcao')
    expect(t.perguntas.find((p) => p.id === a?.id)?.pulada).toBe(true)
    const [item] = await listarAguardandoCorrecao(db)
    expect(item?.respostas).toHaveLength(1)
    // Marcar a única resposta certa fecha a tentativa: o arquivo pulado fica fora da nota.
    const fim = await corrigirResposta(
      db,
      agora,
      'eq',
      item?.respostas[0]?.id ?? '',
      { correta: true },
    )
    expect(fim).toEqual({ fechada: true, estado: 'aprovada' })
  })

  it('recusa o envio sem nenhum dos dois', async () => {
    const { quiz, enviar } = await cenario([link, arquivo])
    expect(quiz.perguntas).toHaveLength(2)
    await expect(enviar({})).rejects.toThrow(/link ou arquivo/i)
  })

  it('opcional pode ficar vazia e fica fora da nota', async () => {
    const { quiz, enviar } = await cenario([
      {
        tipo: 'unica',
        enunciado: 'Obrigatória',
        alternativas: [
          { texto: 'A', correta: true },
          { texto: 'B', correta: false },
        ],
      },
      {
        tipo: 'unica',
        enunciado: 'Opcional',
        obrigatoria: false,
        alternativas: [
          { texto: 'C', correta: true },
          { texto: 'D', correta: false },
        ],
      },
    ])
    const [o] = quiz.perguntas
    expect(quiz.perguntas[1]?.obrigatoria).toBe(false)
    await expect(enviar({})).rejects.toThrow(/Responda a pergunta 1/)
    const t = await enviar({ [o?.id ?? '']: [o?.alternativas[0]?.id ?? ''] })
    expect(t).toMatchObject({ estado: 'aprovada', acertos: 1, total: 1 })
  })

  it('a cópia na tentativa leva os campos e o painel devolve o que foi salvo', async () => {
    const { db, aulaId } = await cenario([link, arquivo])
    const painel = await obterQuizDoPainel(db, aulaId)
    expect(painel?.perguntas.map((p) => [p.obrigatoria, p.grupoUmDe])).toEqual([
      [false, 'link-ou-arquivo'],
      [false, 'link-ou-arquivo'],
    ])
  })
})
