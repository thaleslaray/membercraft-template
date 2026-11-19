import { describe, expect, it, vi } from 'vitest'
import { perguntaDoQuiz, quiz as quizTabela, user } from '#/db/schema'
import { criarAula, criarCurso, criarModulo } from '#/regras/conteudo'
import { limparExclusoesVencidas } from '#/regras/exclusao-protegida'
import { concluirAula, ErroDeProgresso } from '#/regras/progresso'
import {
  corrigirPergunta,
  corrigirTentativa,
  type DefinicaoDoQuiz,
  ErroDeQuiz,
  enviarTentativa,
  obterQuizDoAluno,
  obterQuizDoPainel,
  type PerguntaCopiada,
  podeConcluirComQuiz,
  type Respostas,
  removerQuiz,
  salvarQuiz,
  tentativasRestantes,
} from '#/regras/quiz'
import { TABELAS_COM_EXCLUSAO } from '#/regras/tabelas-com-exclusao'
import { criarBancoDeTeste } from '#/test/banco'

const agora = () => new Date('2026-06-01T12:00:00Z')

const copia = (
  tipo: string,
  corretas: boolean[],
  id = 'p',
): PerguntaCopiada => ({
  id,
  tipo,
  enunciado: 'Pergunta?',
  imagem: null,
  alternativas: corretas.map((correta, i) => ({
    id: `${id}${i}`,
    texto: `Alt ${i}`,
    correta,
    comentario: null,
  })),
})

describe('correção das perguntas', () => {
  it('única: só acerta marcando a correta', () => {
    const p = copia('unica', [false, true, false])
    expect(corrigirPergunta(p, ['p1'])).toBe(true)
    expect(corrigirPergunta(p, ['p0'])).toBe(false)
    expect(corrigirPergunta(p, [])).toBe(false)
    expect(corrigirPergunta(p, ['p0', 'p1'])).toBe(false)
  })

  it('múltipla é exata: todas as certas e nenhuma errada', () => {
    const p = copia('multipla', [true, false, true])
    expect(corrigirPergunta(p, ['p2', 'p0'])).toBe(true)
    expect(corrigirPergunta(p, ['p0'])).toBe(false)
    expect(corrigirPergunta(p, ['p0', 'p1', 'p2'])).toBe(false)
    expect(corrigirPergunta(p, [])).toBe(false)
  })

  it('pergunta aberta não se corrige sozinha: quem corrige é a Equipe', () => {
    expect(() => corrigirPergunta(copia('texto_livre', []), [])).toThrow(
      ErroDeQuiz,
    )
  })
})

describe('nota e aprovação', () => {
  const tres = [
    copia('unica', [true, false], 'a'),
    copia('unica', [true, false], 'b'),
    copia('unica', [true, false], 'c'),
  ]

  it('aprova quando os acertos alcançam o mínimo em %', () => {
    const r = corrigirTentativa(tres, { a: ['a0'], b: ['b0'], c: ['c1'] }, 60)
    expect(r).toMatchObject({ acertos: 2, total: 3, percentual: 66 })
    expect(r.aprovada).toBe(true)
  })

  it('compara a conta exata: 2 de 3 não aprova com mínimo de 67%', () => {
    const r = corrigirTentativa(tres, { a: ['a0'], b: ['b0'], c: ['c1'] }, 67)
    expect(r.aprovada).toBe(false)
  })

  it('mínimo de 100% pede tudo certo; resposta em branco conta como erro', () => {
    expect(
      corrigirTentativa(tres, { a: ['a0'], b: ['b0'] }, 100).aprovada,
    ).toBe(false)
    expect(
      corrigirTentativa(tres, { a: ['a0'], b: ['b0'], c: ['c0'] }, 100)
        .aprovada,
    ).toBe(true)
  })

  it('conta as tentativas restantes (nulo = ilimitado)', () => {
    expect(tentativasRestantes(null, 40)).toBeNull()
    expect(tentativasRestantes(3, 1)).toBe(2)
    expect(tentativasRestantes(3, 5)).toBe(0)
  })
})

const definicao = (extra: Partial<DefinicaoDoQuiz> = {}): DefinicaoDoQuiz => ({
  soQuiz: false,
  obrigatorio: false,
  obrigatorioParaCertificado: false,
  minimoDeAcertos: 50,
  maximoDeTentativas: 2,
  pontos: 100,
  perguntas: [
    {
      tipo: 'unica',
      enunciado: 'Qual é a cor primária?',
      imagem: 'conteudo/imagens/x/cor.png',
      alternativas: [
        { texto: 'Verde', correta: false, comentario: 'Verde é secundária.' },
        { texto: 'Azul', correta: true, comentario: 'Isso!' },
      ],
    },
    {
      tipo: 'multipla',
      enunciado: 'Quais são quentes?',
      alternativas: [
        { texto: 'Vermelho', correta: true },
        { texto: 'Azul', correta: false, comentario: 'Azul é fria.' },
        { texto: 'Laranja', correta: true },
      ],
    },
  ],
  ...extra,
})

async function cenario(extra: Partial<DefinicaoDoQuiz> = {}) {
  const db = await criarBancoDeTeste()
  await db.insert(user).values({ id: 'ana', name: 'Ana', email: 'ana@x.test' })
  const cursoId = await criarCurso(db, { nome: 'Coloração' })
  const moduloId = await criarModulo(db, cursoId, { nome: 'Base' })
  const aulaId = await criarAula(db, moduloId, { titulo: 'Cores' })
  await salvarQuiz(db, aulaId, definicao(extra))
  const quiz = await obterQuizDoAluno(db, 'ana', aulaId)
  if (!quiz) throw new Error('quiz não criado')
  // Monta as respostas a partir do painel (que conhece as corretas): ids vêm do aluno.
  const painel = await obterQuizDoPainel(db, aulaId)
  const respostas = (acertaTudo: boolean): Respostas =>
    Object.fromEntries(
      quiz.perguntas.map((p, i) => {
        const def = painel?.perguntas[i]
        const marcar = p.alternativas
          .filter(
            (_, j) => (def?.alternativas[j]?.correta ?? false) === acertaTudo,
          )
          .map((a) => a.id)
        return [p.id, marcar]
      }),
    )
  return { db, aulaId, quiz, respostas }
}

describe('salvar o quiz', () => {
  it('guarda a definição e devolve para a edição, com as corretas', async () => {
    const { db, aulaId } = await cenario()
    const painel = await obterQuizDoPainel(db, aulaId)
    expect(painel).toMatchObject({
      minimoDeAcertos: 50,
      maximoDeTentativas: 2,
      pontos: 100,
    })
    expect(painel?.perguntas[0]?.imagem).toBe('conteudo/imagens/x/cor.png')
    expect(painel?.perguntas[0]?.alternativas[1]).toEqual({
      texto: 'Azul',
      correta: true,
      comentario: 'Isso!',
      imagem: null,
    })
  })

  it('salvar de novo substitui as perguntas sem duplicar o quiz', async () => {
    const { db, aulaId } = await cenario()
    await salvarQuiz(
      db,
      aulaId,
      definicao({
        perguntas: [
          {
            tipo: 'unica',
            enunciado: 'Só uma agora',
            alternativas: [
              { texto: 'A', correta: true },
              { texto: 'B', correta: false },
            ],
          },
        ],
      }),
    )
    const painel = await obterQuizDoPainel(db, aulaId)
    expect(painel?.perguntas).toHaveLength(1)
    expect(painel?.perguntas[0]?.enunciado).toBe('Só uma agora')
  })

  it.each([
    ['mínimo acima de 100', { minimoDeAcertos: 101 }],
    ['zero tentativas', { maximoDeTentativas: 0 }],
    ['16 tentativas', { maximoDeTentativas: 16 }],
    ['sem perguntas', { perguntas: [] }],
  ])('recusa %s', async (_, extra) => {
    const { db, aulaId } = await cenario()
    await expect(
      salvarQuiz(db, aulaId, definicao(extra as Partial<DefinicaoDoQuiz>)),
    ).rejects.toThrow(ErroDeQuiz)
  })

  it('única aceita no máximo uma correta; sem nenhuma a escolha é aberta', async () => {
    const { db, aulaId } = await cenario()
    const duas = (tipo: string, a: boolean, b: boolean) =>
      definicao({
        perguntas: [
          {
            tipo,
            enunciado: 'P',
            alternativas: [
              { texto: 'A', correta: a },
              { texto: 'B', correta: b },
            ],
          },
        ],
      })
    await expect(
      salvarQuiz(db, aulaId, duas('unica', true, true)),
    ).rejects.toThrow(/no máximo uma/)
    await expect(
      salvarQuiz(db, aulaId, duas('multipla', false, false)),
    ).resolves.toBeTruthy()
    await expect(
      salvarQuiz(db, aulaId, duas('unica', false, false)),
    ).resolves.toBeTruthy()
    await expect(
      salvarQuiz(db, aulaId, duas('multipla', true, true)),
    ).resolves.toBeTruthy()
  })

  it('aceita 1 a 15 tentativas e ilimitado', async () => {
    const { db, aulaId } = await cenario()
    for (const maximoDeTentativas of [1, 15, null]) {
      await salvarQuiz(db, aulaId, definicao({ maximoDeTentativas }))
      expect((await obterQuizDoPainel(db, aulaId))?.maximoDeTentativas).toBe(
        maximoDeTentativas,
      )
    }
  })
})

describe('o aluno envia uma tentativa', () => {
  it('o quiz que o aluno vê não traz corretas nem comentários', async () => {
    const { quiz } = await cenario()
    expect(JSON.stringify(quiz.perguntas)).not.toMatch(/correta|comentario/)
    expect(quiz).toMatchObject({
      restantes: 2,
      minimoDeAcertos: 50,
      podeEnviar: true,
      revelar: false,
    })
  })

  it('aprova, mostra o certo e o comentário da marcada e guarda a tentativa', async () => {
    const { db, aulaId, respostas } = await cenario()
    const t = await enviarTentativa(db, agora, 'ana', aulaId, respostas(true))
    expect(t).toMatchObject({
      numero: 1,
      estado: 'aprovada',
      acertos: 2,
      total: 2,
      percentual: 100,
    })
    expect(t.perguntas.every((p) => p.acertou)).toBe(true)
    // Aprovado: a correta aparece.
    expect(t.perguntas[0]?.alternativas.map((a) => a.correta)).toEqual([
      false,
      true,
    ])
    const depois = await obterQuizDoAluno(db, 'ana', aulaId)
    expect(depois).toMatchObject({ aprovado: true, podeEnviar: false })
  })

  it('reprovada com tentativas sobrando: não revela a correta, mas dá o comentário do que marcou', async () => {
    const { db, aulaId, respostas } = await cenario({ minimoDeAcertos: 100 })
    const t = await enviarTentativa(db, agora, 'ana', aulaId, respostas(false))
    expect(t.estado).toBe('reprovada')
    const alternativas = t.perguntas[0]?.alternativas ?? []
    expect(alternativas.every((a) => a.correta === null)).toBe(true)
    expect(alternativas[0]).toMatchObject({
      marcada: true,
      comentario: 'Verde é secundária.',
    })
    expect(alternativas[1]).toMatchObject({ marcada: false, comentario: null })
  })

  it('ao esgotar as tentativas a correta passa a aparecer e não dá para enviar mais', async () => {
    const { db, aulaId, respostas } = await cenario({
      minimoDeAcertos: 100,
      maximoDeTentativas: 2,
    })
    await enviarTentativa(db, agora, 'ana', aulaId, respostas(false))
    const segunda = await enviarTentativa(
      db,
      agora,
      'ana',
      aulaId,
      respostas(false),
    )
    expect(segunda.numero).toBe(2)
    expect(segunda.perguntas[0]?.alternativas.map((a) => a.correta)).toEqual([
      false,
      true,
    ])
    const aluno = await obterQuizDoAluno(db, 'ana', aulaId)
    expect(aluno).toMatchObject({
      restantes: 0,
      revelar: true,
      podeEnviar: false,
      aprovado: false,
    })
    await expect(
      enviarTentativa(db, agora, 'ana', aulaId, respostas(true)),
    ).rejects.toThrow(/acabaram/)
  })

  it('tentativas ilimitadas nunca esgotam', async () => {
    const { db, aulaId, respostas } = await cenario({
      minimoDeAcertos: 100,
      maximoDeTentativas: null,
    })
    for (let i = 0; i < 4; i++) {
      await enviarTentativa(db, agora, 'ana', aulaId, respostas(false))
    }
    const aluno = await obterQuizDoAluno(db, 'ana', aulaId)
    expect(aluno).toMatchObject({
      restantes: null,
      podeEnviar: true,
      revelar: false,
    })
    expect(aluno?.tentativas.map((t) => t.numero)).toEqual([1, 2, 3, 4])
  })

  it('depois de aprovado não envia de novo', async () => {
    const { db, aulaId, respostas } = await cenario()
    await enviarTentativa(db, agora, 'ana', aulaId, respostas(true))
    await expect(
      enviarTentativa(db, agora, 'ana', aulaId, respostas(true)),
    ).rejects.toThrow(/já foi aprovado/)
  })

  it('tentativa aguardando correção trava um novo envio (estado reservado à #52)', async () => {
    const { db, aulaId, respostas } = await cenario()
    await enviarTentativa(db, agora, 'ana', aulaId, respostas(false))
    const { tentativaDoQuiz } = await import('#/db/schema')
    const { eq } = await import('drizzle-orm')
    await db
      .update(tentativaDoQuiz)
      .set({ estado: 'aguardando_correcao' })
      .where(eq(tentativaDoQuiz.numero, 1))
    const aluno = await obterQuizDoAluno(db, 'ana', aulaId)
    expect(aluno).toMatchObject({ aguardandoCorrecao: true, podeEnviar: false })
    await expect(
      enviarTentativa(db, agora, 'ana', aulaId, respostas(true)),
    ).rejects.toThrow(/aguardando correção/)
  })

  it('recusa alternativa que não é da pergunta', async () => {
    const { db, aulaId, quiz } = await cenario()
    const p = quiz.perguntas[0]
    await expect(
      enviarTentativa(db, agora, 'ana', aulaId, { [p?.id ?? '']: ['xxx'] }),
    ).rejects.toThrow(/inválida/)
  })

  it('cada aluno tem as próprias tentativas', async () => {
    const { db, aulaId, respostas } = await cenario({ minimoDeAcertos: 100 })
    await db
      .insert(user)
      .values({ id: 'bia', name: 'Bia', email: 'bia@x.test' })
    await enviarTentativa(db, agora, 'ana', aulaId, respostas(false))
    const bia = await obterQuizDoAluno(db, 'bia', aulaId)
    expect(bia?.tentativas).toEqual([])
    expect(bia?.restantes).toBe(2)
  })

  it('editar o quiz não muda o que a tentativa antiga mostra', async () => {
    const { db, aulaId, respostas } = await cenario({ minimoDeAcertos: 100 })
    await enviarTentativa(db, agora, 'ana', aulaId, respostas(false))
    await salvarQuiz(
      db,
      aulaId,
      definicao({
        perguntas: [
          {
            tipo: 'unica',
            enunciado: 'Pergunta nova',
            alternativas: [
              { texto: 'X', correta: true },
              { texto: 'Y', correta: false },
            ],
          },
        ],
      }),
    )
    const aluno = await obterQuizDoAluno(db, 'ana', aulaId)
    expect(aluno?.perguntas[0]?.enunciado).toBe('Pergunta nova')
    expect(aluno?.ultimaTentativa?.perguntas).toHaveLength(2)
    expect(aluno?.ultimaTentativa?.perguntas[0]?.enunciado).toBe(
      'Qual é a cor primária?',
    )
  })

  it('chama o gancho de pontos só na primeira aprovação', async () => {
    const { db, aulaId, respostas } = await cenario({ pontos: 80 })
    const aoAprovarPelaPrimeiraVez = vi.fn().mockResolvedValue(undefined)
    await enviarTentativa(db, agora, 'ana', aulaId, respostas(true), {
      aoAprovarPelaPrimeiraVez,
    })
    expect(aoAprovarPelaPrimeiraVez).toHaveBeenCalledOnce()
    expect(aoAprovarPelaPrimeiraVez.mock.calls[0]?.[0]).toMatchObject({
      userId: 'ana',
      aulaId,
      pontos: 80,
    })
    await expect(
      enviarTentativa(db, agora, 'ana', aulaId, respostas(true), {
        aoAprovarPelaPrimeiraVez,
      }),
    ).rejects.toThrow(ErroDeQuiz)
    expect(aoAprovarPelaPrimeiraVez).toHaveBeenCalledOnce()
  })

  it('não chama o gancho quando reprova', async () => {
    const { db, aulaId, respostas } = await cenario({ minimoDeAcertos: 100 })
    const aoAprovarPelaPrimeiraVez = vi.fn()
    await enviarTentativa(db, agora, 'ana', aulaId, respostas(false), {
      aoAprovarPelaPrimeiraVez,
    })
    expect(aoAprovarPelaPrimeiraVez).not.toHaveBeenCalled()
  })
})

describe('conclusão da aula com quiz', () => {
  const ganchos = { podeConcluir: podeConcluirComQuiz }

  it('quiz opcional não trava a conclusão', async () => {
    const { db, aulaId } = await cenario()
    await expect(
      concluirAula(db, agora, 'ana', aulaId, ganchos),
    ).resolves.toEqual({ concluiuAgora: true })
  })

  it('quiz obrigatório só libera a conclusão com aprovação', async () => {
    const { db, aulaId, respostas } = await cenario({
      obrigatorio: true,
      minimoDeAcertos: 100,
    })
    await expect(
      concluirAula(db, agora, 'ana', aulaId, ganchos),
    ).rejects.toThrow(ErroDeProgresso)
    await enviarTentativa(db, agora, 'ana', aulaId, respostas(false))
    await expect(
      concluirAula(db, agora, 'ana', aulaId, ganchos),
    ).rejects.toThrow(ErroDeProgresso)
    await enviarTentativa(db, agora, 'ana', aulaId, respostas(true))
    await expect(
      concluirAula(db, agora, 'ana', aulaId, ganchos),
    ).resolves.toEqual({ concluiuAgora: true })
  })

  it('a aula do tipo quiz sempre exige aprovação, mesmo sem "obrigatório"', async () => {
    const { db, aulaId, respostas } = await cenario({
      soQuiz: true,
      obrigatorio: false,
    })
    expect(
      await podeConcluirComQuiz({ db, agora, userId: 'ana', aulaId }),
    ).toBe(false)
    await enviarTentativa(db, agora, 'ana', aulaId, respostas(true))
    expect(
      await podeConcluirComQuiz({ db, agora, userId: 'ana', aulaId }),
    ).toBe(true)
  })

  it('a aprovação de um aluno não libera a conclusão de outro', async () => {
    const { db, aulaId, respostas } = await cenario({ obrigatorio: true })
    await db
      .insert(user)
      .values({ id: 'bia', name: 'Bia', email: 'bia@x.test' })
    await enviarTentativa(db, agora, 'ana', aulaId, respostas(true))
    expect(
      await podeConcluirComQuiz({ db, agora, userId: 'bia', aulaId }),
    ).toBe(false)
  })

  it('aula sem quiz conclui livre', async () => {
    const { db } = await cenario()
    const cursoId = await criarCurso(db, { nome: 'Outro' })
    const m = await criarModulo(db, cursoId, { nome: 'M' })
    const a = await criarAula(db, m, { titulo: 'Sem quiz' })
    expect(
      await podeConcluirComQuiz({ db, agora, userId: 'ana', aulaId: a }),
    ).toBe(true)
  })
})

describe('remover o quiz', () => {
  it('remove quiz sem tentativas e recusa o que já tem tentativa', async () => {
    const { db, aulaId, respostas } = await cenario({ minimoDeAcertos: 100 })
    await enviarTentativa(db, agora, 'ana', aulaId, respostas(false))
    await expect(removerQuiz(db, agora, aulaId)).rejects.toThrow(ErroDeQuiz)

    const limpo = await cenario()
    await removerQuiz(limpo.db, agora, limpo.aulaId)
    expect(await obterQuizDoPainel(limpo.db, limpo.aulaId)).toBeNull()
  })

  it('é exclusão protegida: a linha fica marcada por 30 dias e a limpeza apaga depois', async () => {
    const { db, aulaId } = await cenario()
    await removerQuiz(db, agora, aulaId)
    const [marcado] = await db.select().from(quizTabela)
    expect(marcado.excluidoEm).toEqual(agora())
    const perguntas = (await db.select().from(perguntaDoQuiz)).length
    expect(perguntas).toBeGreaterThan(0)

    const em10Dias = () => new Date(agora().getTime() + 10 * 86_400_000)
    await limparExclusoesVencidas(db, em10Dias, TABELAS_COM_EXCLUSAO)
    expect(await db.select().from(quizTabela)).toHaveLength(1)

    const em31Dias = () => new Date(agora().getTime() + 31 * 86_400_000)
    const { falhas } = await limparExclusoesVencidas(
      db,
      em31Dias,
      TABELAS_COM_EXCLUSAO,
    )
    expect(falhas).toEqual([])
    expect(await db.select().from(quizTabela)).toHaveLength(0)
    expect(await db.select().from(perguntaDoQuiz)).toHaveLength(0)
  })

  it('a aula pode ganhar um quiz novo enquanto o antigo espera a limpeza', async () => {
    const { db, aulaId } = await cenario()
    await removerQuiz(db, agora, aulaId)
    await salvarQuiz(db, aulaId, definicao())
    expect(await obterQuizDoPainel(db, aulaId)).not.toBeNull()
    expect(await db.select().from(quizTabela)).toHaveLength(2)
  })
})
