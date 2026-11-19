import { describe, expect, it, vi } from 'vitest'
import { tentativaDoQuiz, user } from '#/db/schema'
import { criarAula, criarCurso, criarModulo } from '#/regras/conteudo'
import { LIMITE_DO_ARQUIVO } from '#/regras/entregas'
import {
  type Armazenamento,
  type DefinicaoDoQuiz,
  type EntregaDoAluno,
  ErroDeQuiz,
  enviarTentativa,
  obterQuizDoAluno,
  obterQuizDoPainel,
  podeConcluirComQuiz,
  salvarQuiz,
} from '#/regras/quiz'
import {
  arquivoDeEntrega,
  contarAguardandoCorrecao,
  corrigirResposta,
  liberarTentativa,
  listarAguardandoCorrecao,
  listarSemTentativas,
} from '#/regras/quiz-correcao'
import { criarBancoDeTeste } from '#/test/banco'

const agora = () => new Date('2026-06-01T12:00:00Z')

const definicao = (extra: Partial<DefinicaoDoQuiz> = {}): DefinicaoDoQuiz => ({
  soQuiz: false,
  obrigatorio: true,
  obrigatorioParaCertificado: false,
  minimoDeAcertos: 100,
  maximoDeTentativas: 1,
  pontos: 100,
  perguntas: [
    {
      tipo: 'unica',
      enunciado: 'Qual é a cor primária?',
      alternativas: [
        { texto: 'Verde', correta: false },
        { texto: 'Azul', correta: true },
      ],
    },
    {
      tipo: 'texto_livre',
      enunciado: 'Conte o que aprendeu.',
      alternativas: [],
    },
    {
      tipo: 'arquivo',
      enunciado: 'Envie a foto do resultado.',
      alternativas: [],
    },
  ],
  ...extra,
})

// Armazenamento falso: só existe o que o teste "enviou".
const armazenamento = (objetos: Record<string, number>): Armazenamento => ({
  tamanhoDoObjeto: async (chave) => objetos[chave] ?? null,
})

const ARQUIVO = {
  chave: 'quiz/entregas/ana/u1/foto.jpg',
  nome: 'foto.jpg',
  tipo: 'image/jpeg',
}

async function cenario(extra: Partial<DefinicaoDoQuiz> = {}) {
  const db = await criarBancoDeTeste()
  await db.insert(user).values([
    { id: 'ana', name: 'Ana', email: 'ana@x.test' },
    { id: 'eq', name: 'Equipe', email: 'eq@x.test' },
  ])
  const cursoId = await criarCurso(db, { nome: 'Coloração' })
  const moduloId = await criarModulo(db, cursoId, { nome: 'Base' })
  const aulaId = await criarAula(db, moduloId, { titulo: 'Cores' })
  await salvarQuiz(db, aulaId, definicao(extra))
  const quiz = await obterQuizDoAluno(db, 'ana', aulaId)
  if (!quiz) throw new Error('quiz não criado')
  const painel = await obterQuizDoPainel(db, aulaId)
  const [unica, texto, arquivo] = quiz.perguntas
  if (!unica || !texto || !arquivo) throw new Error('perguntas')
  const certa =
    unica.alternativas[
      painel?.perguntas[0]?.alternativas.findIndex((a) => a.correta) ?? 0
    ]
  const errada = unica.alternativas.find((a) => a.id !== certa?.id)
  const entrega = (
    escolha: 'certa' | 'errada' = 'certa',
    mais: Partial<EntregaDoAluno> = {},
  ) => ({
    respostas: {
      [unica.id]: [(escolha === 'certa' ? certa : errada)?.id ?? ''],
    },
    entrega: {
      textos: { [texto.id]: 'Aprendi a misturar tintas.' },
      arquivos: { [arquivo.id]: [ARQUIVO] },
      ...mais,
    } satisfies EntregaDoAluno,
  })
  const enviar = (
    userId: string,
    e: ReturnType<typeof entrega>,
    ganchos = {},
    armaz = armazenamento({ [ARQUIVO.chave]: 1234 }),
  ) =>
    enviarTentativa(
      db,
      agora,
      userId,
      aulaId,
      e.respostas,
      ganchos,
      e.entrega,
      armaz,
    )
  return {
    db,
    aulaId,
    quiz,
    entrega,
    enviar,
    perguntas: { unica, texto, arquivo },
  }
}

describe('tipo de arquivo aceito', () => {
  const comAceita = (aceita?: string) =>
    definicao({
      perguntas: [
        {
          tipo: 'arquivo',
          aceita,
          enunciado: 'Envie a foto.',
          alternativas: [],
        },
      ],
    })

  async function preparar(aceita?: string) {
    const db = await criarBancoDeTeste()
    await db.insert(user).values({ id: 'ana', name: 'Ana', email: 'a@x.test' })
    const cursoId = await criarCurso(db, { nome: 'C' })
    const moduloId = await criarModulo(db, cursoId, { nome: 'M' })
    const aulaId = await criarAula(db, moduloId, { titulo: 'A' })
    await salvarQuiz(db, aulaId, comAceita(aceita))
    const quiz = await obterQuizDoAluno(db, 'ana', aulaId)
    const p = quiz?.perguntas[0]
    if (!p) throw new Error('pergunta')
    const enviar = (tipo: string, nome = 'foto.jpg') =>
      enviarTentativa(
        db,
        agora,
        'ana',
        aulaId,
        {},
        {},
        { arquivos: { [p.id]: [{ chave: ARQUIVO.chave, nome, tipo }] } },
        armazenamento({ [ARQUIVO.chave]: 100 }),
      )
    return { db, aulaId, pergunta: p, enviar }
  }

  it('grava e devolve o tipo aceito; sem informar é qualquer', async () => {
    const a = await preparar('imagem')
    expect(a.pergunta.aceita).toBe('imagem')
    expect(
      (await obterQuizDoPainel(a.db, a.aulaId))?.perguntas[0]?.aceita,
    ).toBe('imagem')
    const b = await preparar()
    expect(b.pergunta.aceita).toBe('qualquer')
  })

  it('recusa tipo de arquivo inválido na definição', async () => {
    await expect(preparar('zip')).rejects.toThrow('tipo de arquivo inválido')
  })

  it('recusa PDF numa pergunta de foto e aceita imagem (inclusive HEIC)', async () => {
    const { enviar } = await preparar('imagem')
    await expect(enviar('application/pdf', 'a.pdf')).rejects.toThrow(
      'Esta pergunta pede foto',
    )
    await expect(enviar('image/png', 'a.png')).resolves.toBeDefined()
  })

  it('HEIC conta como imagem', async () => {
    const { enviar } = await preparar('imagem')
    await expect(enviar('image/heic', 'a.heic')).resolves.toBeDefined()
  })

  it('pergunta "qualquer" aceita PDF', async () => {
    const { enviar } = await preparar('qualquer')
    await expect(enviar('application/pdf', 'a.pdf')).resolves.toBeDefined()
  })

  it('a tentativa guarda o tipo aceito na cópia da pergunta', async () => {
    const { db, enviar } = await preparar('pdf')
    await enviar('application/pdf', 'a.pdf')
    const [t] = await db.select().from(tentativaDoQuiz)
    expect(JSON.parse(t?.perguntas ?? '[]')[0].aceita).toBe('pdf')
  })
})

describe('definir perguntas abertas', () => {
  it('texto livre e arquivo não têm alternativas', async () => {
    const { db, aulaId } = await cenario()
    const painel = await obterQuizDoPainel(db, aulaId)
    expect(painel?.perguntas.map((p) => p.tipo)).toEqual([
      'unica',
      'texto_livre',
      'arquivo',
    ])
    expect(painel?.perguntas[1]?.alternativas).toEqual([])
  })

  it('o aluno vê as perguntas abertas sem alternativas e o quiz "sem correção" volta no painel', async () => {
    const { db, aulaId, quiz } = await cenario({ semCorrecao: true })
    expect(quiz.perguntas[1]).toMatchObject({
      tipo: 'texto_livre',
      alternativas: [],
    })
    expect((await obterQuizDoPainel(db, aulaId))?.semCorrecao).toBe(true)
  })
})

describe('o aluno entrega e fica aguardando correção', () => {
  it('guarda a tentativa como aguardando correção, sem nota final', async () => {
    const { enviar, entrega, db, aulaId } = await cenario()
    const t = await enviar('ana', entrega())
    expect(t.estado).toBe('aguardando_correcao')
    expect(t.perguntas.map((p) => p.acertou)).toEqual([true, null, null])
    expect(t.perguntas[1]?.aberta).toMatchObject({
      texto: 'Aprendi a misturar tintas.',
      situacao: 'pendente',
    })
    expect(t.perguntas[2]?.aberta?.arquivos).toHaveLength(1)
    expect(t.perguntas[2]?.aberta?.arquivos[0]).toMatchObject({
      nome: 'foto.jpg',
      tamanho: 1234,
    })
    const aluno = await obterQuizDoAluno(db, 'ana', aulaId)
    expect(aluno).toMatchObject({
      aguardandoCorrecao: true,
      podeEnviar: false,
      aprovado: false,
    })
    expect(
      await podeConcluirComQuiz({ db, agora, userId: 'ana', aulaId }),
    ).toBe(false)
  })

  it('o aluno não refaz enquanto aguarda, mesmo com tentativas sobrando', async () => {
    const { enviar, entrega } = await cenario({ maximoDeTentativas: 5 })
    await enviar('ana', entrega())
    await expect(enviar('ana', entrega())).rejects.toThrow(
      /aguardando correção/,
    )
  })

  it('exige texto, ao menos um arquivo e no máximo 3', async () => {
    const { enviar, entrega, perguntas } = await cenario()
    await expect(
      enviar(
        'ana',
        entrega('certa', { textos: { [perguntas.texto.id]: '   ' } }),
      ),
    ).rejects.toThrow(/Responda/)
    await expect(
      enviar(
        'ana',
        entrega('certa', { arquivos: { [perguntas.arquivo.id]: [] } }),
      ),
    ).rejects.toThrow(/Envie/)
    const quatro = [1, 2, 3, 4].map((n) => ({
      chave: `quiz/entregas/ana/u${n}/f.jpg`,
      nome: 'f.jpg',
      tipo: 'image/jpeg',
    }))
    await expect(
      enviar(
        'ana',
        entrega('certa', { arquivos: { [perguntas.arquivo.id]: quatro } }),
        {},
        armazenamento(Object.fromEntries(quatro.map((a) => [a.chave, 10]))),
      ),
    ).rejects.toThrow(/até 3/)
  })

  it('recusa arquivo de outro aluno, que não está no R2 ou maior que 500 MB', async () => {
    const { enviar, entrega, perguntas } = await cenario()
    const de = (a: typeof ARQUIVO) =>
      entrega('certa', { arquivos: { [perguntas.arquivo.id]: [a] } })
    await expect(
      enviar('ana', de({ ...ARQUIVO, chave: 'quiz/entregas/bia/u1/foto.jpg' })),
    ).rejects.toThrow(ErroDeQuiz)
    await expect(
      enviar('ana', de(ARQUIVO), {}, armazenamento({})),
    ).rejects.toThrow(/não chegou/)
    await expect(
      enviar(
        'ana',
        de(ARQUIVO),
        {},
        armazenamento({ [ARQUIVO.chave]: LIMITE_DO_ARQUIVO + 1 }),
      ),
    ).rejects.toThrow(/500 MB/)
  })
})

describe('toda pergunta é obrigatória', () => {
  it('o servidor recusa o envio em branco e não grava nada', async () => {
    const { enviar, entrega, perguntas, db, aulaId } = await cenario()
    await expect(
      enviar('ana', { respostas: {}, entrega: { textos: {}, arquivos: {} } }),
    ).rejects.toThrow(/Faltam 3 perguntas/)
    await expect(
      enviar('ana', {
        ...entrega('certa'),
        respostas: { [perguntas.unica.id]: [] },
      }),
    ).rejects.toThrow(/Faltam 1 pergunta|Falta 1 pergunta/)
    const quiz = await obterQuizDoAluno(db, 'ana', aulaId)
    expect(quiz?.ultimaTentativa).toBeNull()
  })
})

describe('a equipe corrige na fila', () => {
  it('lista a tentativa na fila com as respostas abertas e conta', async () => {
    const { db, enviar, entrega } = await cenario()
    await enviar('ana', entrega())
    expect(await contarAguardandoCorrecao(db)).toBe(1)
    const [item] = await listarAguardandoCorrecao(db)
    expect(item).toMatchObject({
      alunoNome: 'Ana',
      aulaTitulo: 'Cores',
      cursoNome: 'Coloração',
      numero: 1,
    })
    expect(item?.respostas.map((r) => r.tipo)).toEqual([
      'texto_livre',
      'arquivo',
    ])
    expect(item?.respostas[0]).toMatchObject({
      enunciado: 'Conte o que aprendeu.',
      texto: 'Aprendi a misturar tintas.',
      situacao: 'pendente',
    })
  })

  it('só fecha a tentativa quando todas as respostas foram marcadas; aprova com tudo certo', async () => {
    const { db, enviar, entrega } = await cenario()
    await enviar('ana', entrega())
    const [item] = await listarAguardandoCorrecao(db)
    const [texto, arquivo] = item?.respostas ?? []
    const aoCorrigir = vi.fn(async () => {})
    const aoAprovarPelaPrimeiraVez = vi.fn(async () => {})
    const ganchos = { aoCorrigir, aoAprovarPelaPrimeiraVez }

    await corrigirResposta(
      db,
      agora,
      'eq',
      texto?.id ?? '',
      { correta: true, comentario: 'Boa!' },
      ganchos,
    )
    expect(aoCorrigir).not.toHaveBeenCalled()
    expect(await contarAguardandoCorrecao(db)).toBe(1)

    await corrigirResposta(
      db,
      agora,
      'eq',
      arquivo?.id ?? '',
      { correta: true },
      ganchos,
    )
    expect(aoCorrigir).toHaveBeenCalledOnce()
    expect(aoCorrigir).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'ana', aprovada: true, numero: 1 }),
    )
    expect(aoAprovarPelaPrimeiraVez).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'ana', pontos: 100 }),
    )
    expect(await contarAguardandoCorrecao(db)).toBe(0)

    const aluno = await obterQuizDoAluno(db, 'ana', item?.aulaId ?? '')
    expect(aluno).toMatchObject({ aprovado: true, aguardandoCorrecao: false })
    expect(aluno?.ultimaTentativa).toMatchObject({
      estado: 'aprovada',
      acertos: 3,
      total: 3,
      percentual: 100,
    })
    expect(aluno?.ultimaTentativa?.perguntas[1]?.aberta).toMatchObject({
      situacao: 'certa',
      comentario: 'Boa!',
    })
    expect(
      await podeConcluirComQuiz({
        db,
        agora,
        userId: 'ana',
        aulaId: item?.aulaId ?? '',
      }),
    ).toBe(true)
  })

  it('uma resposta errada reprova pelo mínimo e avisa o aluno sem pontos', async () => {
    const { db, enviar, entrega } = await cenario({ maximoDeTentativas: 2 })
    await enviar('ana', entrega())
    const [item] = await listarAguardandoCorrecao(db)
    const aoCorrigir = vi.fn(async () => {})
    const aoAprovarPelaPrimeiraVez = vi.fn(async () => {})
    const ganchos = { aoCorrigir, aoAprovarPelaPrimeiraVez }
    const [texto, arquivo] = item?.respostas ?? []
    await corrigirResposta(
      db,
      agora,
      'eq',
      texto?.id ?? '',
      { correta: false, comentario: 'Faltou detalhe.' },
      ganchos,
    )
    await corrigirResposta(
      db,
      agora,
      'eq',
      arquivo?.id ?? '',
      { correta: true },
      ganchos,
    )
    expect(aoCorrigir).toHaveBeenCalledWith(
      expect.objectContaining({ aprovada: false }),
    )
    expect(aoAprovarPelaPrimeiraVez).not.toHaveBeenCalled()
    const aluno = await obterQuizDoAluno(db, 'ana', item?.aulaId ?? '')
    expect(aluno).toMatchObject({
      aprovado: false,
      podeEnviar: true,
      restantes: 1,
    })
    expect(aluno?.ultimaTentativa).toMatchObject({
      estado: 'reprovada',
      acertos: 2,
      total: 3,
    })
  })

  it('dá para mudar a marcação enquanto a tentativa aguarda, mas não depois de fechada', async () => {
    const { db, enviar, entrega } = await cenario()
    await enviar('ana', entrega())
    const [item] = await listarAguardandoCorrecao(db)
    const [texto, arquivo] = item?.respostas ?? []
    await corrigirResposta(
      db,
      agora,
      'eq',
      texto?.id ?? '',
      { correta: false },
      {},
    )
    await corrigirResposta(
      db,
      agora,
      'eq',
      texto?.id ?? '',
      { correta: true },
      {},
    )
    await corrigirResposta(
      db,
      agora,
      'eq',
      arquivo?.id ?? '',
      { correta: true },
      {},
    )
    await expect(
      corrigirResposta(
        db,
        agora,
        'eq',
        texto?.id ?? '',
        { correta: false },
        {},
      ),
    ).rejects.toThrow(/já foi corrigida/)
    await expect(
      corrigirResposta(db, agora, 'eq', 'nao-existe', { correta: true }, {}),
    ).rejects.toThrow(/não encontrada/)
  })

  it('editar o quiz depois não estraga a tentativa guardada', async () => {
    const { db, aulaId, enviar, entrega } = await cenario()
    await enviar('ana', entrega())
    await salvarQuiz(
      db,
      aulaId,
      definicao({
        perguntas: [
          { tipo: 'texto_livre', enunciado: 'Pergunta nova', alternativas: [] },
        ],
      }),
    )
    const [item] = await listarAguardandoCorrecao(db)
    expect(item?.respostas[0]?.enunciado).toBe('Conte o que aprendeu.')
  })
})

describe('sem correção', () => {
  it('aceita as respostas abertas ao enviar, aprova e dá os pontos na hora', async () => {
    const { db, aulaId, enviar, entrega } = await cenario({ semCorrecao: true })
    const aoAprovarPelaPrimeiraVez = vi.fn(async () => {})
    const t = await enviar('ana', entrega(), { aoAprovarPelaPrimeiraVez })
    expect(t).toMatchObject({ estado: 'aprovada', acertos: 3, total: 3 })
    expect(aoAprovarPelaPrimeiraVez).toHaveBeenCalledOnce()
    expect(await contarAguardandoCorrecao(db)).toBe(0)
    expect(
      await podeConcluirComQuiz({ db, agora, userId: 'ana', aulaId }),
    ).toBe(true)
  })

  it('as perguntas de escolha continuam corrigidas sozinhas', async () => {
    const { enviar, entrega } = await cenario({ semCorrecao: true })
    const t = await enviar('ana', entrega('errada'))
    expect(t).toMatchObject({ estado: 'reprovada', acertos: 2, total: 3 })
  })
})

describe('liberar nova tentativa', () => {
  async function reprovado() {
    const c = await cenario({ semCorrecao: true, maximoDeTentativas: 1 })
    await c.enviar('ana', c.entrega('errada'))
    return c
  }

  it('soma uma tentativa sem apagar as anteriores', async () => {
    const { db, aulaId, enviar, entrega } = await reprovado()
    expect(await obterQuizDoAluno(db, 'ana', aulaId)).toMatchObject({
      restantes: 0,
      podeEnviar: false,
    })
    const quizId = (await obterQuizDoAluno(db, 'ana', aulaId))?.id ?? ''
    await liberarTentativa(db, agora, 'eq', quizId, 'ana')
    const depois = await obterQuizDoAluno(db, 'ana', aulaId)
    expect(depois).toMatchObject({
      restantes: 1,
      podeEnviar: true,
      maximoDeTentativas: 2,
    })
    expect(depois?.tentativas).toHaveLength(1)
    const segunda = await enviar('ana', entrega('certa'))
    expect(segunda).toMatchObject({ numero: 2, estado: 'aprovada' })
  })

  it('aparece na lista de quem ficou sem tentativas e sai depois de liberar', async () => {
    const { db, aulaId } = await reprovado()
    const [linha] = await listarSemTentativas(db)
    expect(linha).toMatchObject({
      alunoNome: 'Ana',
      aulaTitulo: 'Cores',
      tentativas: 1,
    })
    await liberarTentativa(db, agora, 'eq', linha?.quizId ?? '', 'ana')
    expect(await listarSemTentativas(db)).toEqual([])
    expect(aulaId).toBeTruthy()
  })

  it('recusa quando o aluno já foi aprovado, o quiz é ilimitado ou o quiz não existe', async () => {
    const aprovado = await cenario({ semCorrecao: true })
    await aprovado.enviar('ana', aprovado.entrega('certa'))
    await expect(
      liberarTentativa(aprovado.db, agora, 'eq', aprovado.quiz.id, 'ana'),
    ).rejects.toThrow(/já foi aprovado/)

    const livre = await cenario({ maximoDeTentativas: null })
    await expect(
      liberarTentativa(livre.db, agora, 'eq', livre.quiz.id, 'ana'),
    ).rejects.toThrow(/ilimitadas/)
    await expect(
      liberarTentativa(livre.db, agora, 'eq', 'nao-existe', 'ana'),
    ).rejects.toThrow(/não encontrado/)
  })

  it('recusa enquanto a tentativa aguarda correção', async () => {
    const { db, quiz, enviar, entrega } = await cenario()
    await enviar('ana', entrega())
    await expect(
      liberarTentativa(db, agora, 'eq', quiz.id, 'ana'),
    ).rejects.toThrow(/aguardando correção/)
  })
})

describe('arquivos da entrega', () => {
  it('acha o arquivo pelo id com o dono, para a rota conferir a permissão', async () => {
    const { db, enviar, entrega, aulaId } = await cenario()
    const t = await enviar('ana', entrega())
    const arquivoId = t.perguntas[2]?.aberta?.arquivos[0]?.id ?? ''
    expect(await arquivoDeEntrega(db, arquivoId)).toMatchObject({
      chave: ARQUIVO.chave,
      nome: 'foto.jpg',
      tipo: 'image/jpeg',
      alunoId: 'ana',
      aulaId,
    })
    expect(await arquivoDeEntrega(db, 'nao-existe')).toBeNull()
  })
})
