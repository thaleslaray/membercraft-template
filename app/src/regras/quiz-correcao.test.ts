// Testes de caracterização da correção do quiz pela Equipe (fila, notas, limites do comentário,
// ganchos e "liberar nova tentativa"). O comportamento atual é o esperado; os fluxos felizes
// principais também aparecem em quiz-entregas.test.ts, aqui entram os limites e os ramos de borda.
import { eq } from 'drizzle-orm'
import { describe, expect, it, vi } from 'vitest'
import { aula, user } from '#/db/schema'
import { criarAula, criarCurso, criarModulo } from '#/regras/conteudo'
import {
  type Armazenamento,
  type DefinicaoDoQuiz,
  ErroDeQuiz,
  enviarTentativa,
  obterQuizDoAluno,
  obterQuizDoPainel,
  salvarQuiz,
} from '#/regras/quiz'
import {
  arquivoDeEntrega,
  contarAguardandoCorrecao,
  corrigirResposta,
  LIMITE_DO_COMENTARIO,
  liberarTentativa,
  listarAguardandoCorrecao,
  listarSemTentativas,
} from '#/regras/quiz-correcao'
import { criarBancoDeTeste } from '#/test/banco'

const T0 = new Date('2026-06-01T12:00:00Z')
let relogio = T0
const agora = () => relogio

const definicao = (extra: Partial<DefinicaoDoQuiz> = {}): DefinicaoDoQuiz => ({
  soQuiz: false,
  obrigatorio: true,
  obrigatorioParaCertificado: false,
  minimoDeAcertos: 100,
  maximoDeTentativas: 1,
  pontos: 80,
  perguntas: [
    {
      tipo: 'unica',
      enunciado: 'Qual é a cor primária?',
      alternativas: [
        { texto: 'Verde', correta: false },
        { texto: 'Azul', correta: true },
      ],
    },
    { tipo: 'texto_livre', enunciado: 'Conte.', alternativas: [] },
    { tipo: 'arquivo', enunciado: 'Envie a foto.', alternativas: [] },
  ],
  ...extra,
})

const ARQUIVO = {
  chave: 'quiz/entregas/ana/u1/foto.jpg',
  nome: 'foto.jpg',
  tipo: 'image/jpeg',
}
const armazenamento: Armazenamento = {
  tamanhoDoObjeto: async () => 10,
}

async function cenario(extra: Partial<DefinicaoDoQuiz> = {}) {
  relogio = T0
  const db = await criarBancoDeTeste()
  await db.insert(user).values([
    { id: 'ana', name: 'Ana', email: 'ana@x.test' },
    { id: 'bia', name: 'Bia', email: 'bia@x.test' },
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
  const iCerta =
    painel?.perguntas[0]?.alternativas.findIndex((a) => a.correta) ?? 0
  const certa = unica.alternativas[iCerta]?.id ?? ''
  const errada = unica.alternativas.find((a) => a.id !== certa)?.id ?? ''
  const enviar = (
    userId: string,
    escolha: 'certa' | 'errada' = 'certa',
    ganchos = {},
  ) =>
    enviarTentativa(
      db,
      agora,
      userId,
      aulaId,
      { [unica.id]: [escolha === 'certa' ? certa : errada] },
      ganchos,
      {
        textos: { [texto.id]: 'Aprendi.' },
        arquivos: {
          [arquivo.id]: [
            { ...ARQUIVO, chave: `quiz/entregas/${userId}/u1/foto.jpg` },
          ],
        },
      },
      armazenamento,
    )
  return { db, aulaId, quiz, enviar }
}

type Cenario = Awaited<ReturnType<typeof cenario>>

// A primeira tentativa da fila, com as duas respostas abertas (texto e arquivo).
async function fila(c: Cenario) {
  const [item] = await listarAguardandoCorrecao(c.db)
  if (!item) throw new Error('fila vazia')
  const [texto, arquivo] = item.respostas
  if (!texto || !arquivo) throw new Error('respostas')
  return { item, texto, arquivo }
}

describe('fila de correção', () => {
  it('vazia: lista [] e conta 0', async () => {
    const { db } = await cenario()
    expect(await listarAguardandoCorrecao(db)).toEqual([])
    expect(await contarAguardandoCorrecao(db)).toBe(0)
  })

  it('traz todas as perguntas, inclusive a de escolha com a marcada e a correta', async () => {
    const c = await cenario()
    await c.enviar('ana', 'errada')
    const { item } = await fila(c)
    expect(item.perguntas.map((p) => p.tipo)).toEqual([
      'unica',
      'texto_livre',
      'arquivo',
    ])
    const [unica, texto, arquivo] = item.perguntas
    expect(unica?.respostaId).toBeNull()
    expect(unica?.escolhas.find((e) => e.marcada)?.correta).toBe(false)
    expect(unica?.escolhas.some((e) => e.correta)).toBe(true)
    expect(texto?.texto).toBe('Aprendi.')
    expect(arquivo?.arquivos[0]?.nome).toBe('foto.jpg')
  })

  it('a tentativa corrigida sai da fila', async () => {
    const c = await cenario()
    await c.enviar('ana')
    const { texto, arquivo } = await fila(c)
    await corrigirResposta(c.db, agora, 'eq', texto.id, { correta: true })
    expect(await contarAguardandoCorrecao(c.db)).toBe(1)
    await corrigirResposta(c.db, agora, 'eq', arquivo.id, { correta: true })
    expect(await contarAguardandoCorrecao(c.db)).toBe(0)
    expect(await listarAguardandoCorrecao(c.db)).toEqual([])
  })
})

describe('corrigirResposta', () => {
  it('recusa resposta que não existe', async () => {
    const { db } = await cenario()
    await expect(
      corrigirResposta(db, agora, 'eq', 'nao-existe', { correta: true }),
    ).rejects.toThrow(new ErroDeQuiz('Resposta não encontrada.'))
  })

  it('o comentário aceita até o limite e recusa acima dele, sem gravar a marcação', async () => {
    const c = await cenario()
    await c.enviar('ana')
    const { texto } = await fila(c)
    await expect(
      corrigirResposta(c.db, agora, 'eq', texto.id, {
        correta: true,
        comentario: 'x'.repeat(LIMITE_DO_COMENTARIO + 1),
      }),
    ).rejects.toThrow(/passa de 2000/)
    expect((await fila(c)).texto.situacao).toBe('pendente')
    await corrigirResposta(c.db, agora, 'eq', texto.id, {
      correta: true,
      comentario: 'x'.repeat(LIMITE_DO_COMENTARIO),
    })
    expect((await fila(c)).texto.comentario).toHaveLength(LIMITE_DO_COMENTARIO)
  })

  it('apara o comentário e guarda nulo quando só tem espaços', async () => {
    const c = await cenario()
    await c.enviar('ana')
    const { texto } = await fila(c)
    await corrigirResposta(c.db, agora, 'eq', texto.id, {
      correta: false,
      comentario: '   ',
    })
    expect((await fila(c)).texto).toMatchObject({
      situacao: 'errada',
      comentario: null,
    })
    await corrigirResposta(c.db, agora, 'eq', texto.id, {
      correta: false,
      comentario: '  Reveja a aula.  ',
    })
    expect((await fila(c)).texto.comentario).toBe('Reveja a aula.')
  })

  it('enquanto falta marcar, devolve fechada=false e aguardando correção', async () => {
    const c = await cenario()
    await c.enviar('ana')
    const { texto } = await fila(c)
    expect(
      await corrigirResposta(c.db, agora, 'eq', texto.id, { correta: true }),
    ).toEqual({ fechada: false, estado: 'aguardando_correcao' })
  })

  it('a última marcação fecha: tudo certo aprova e roda os dois ganchos (com os pontos do quiz)', async () => {
    const c = await cenario()
    await c.enviar('ana')
    const { item, texto, arquivo } = await fila(c)
    const aoCorrigir = vi.fn(async () => {})
    const aoAprovarPelaPrimeiraVez = vi.fn(async () => {})
    const ganchos = { aoCorrigir, aoAprovarPelaPrimeiraVez }
    await corrigirResposta(
      c.db,
      agora,
      'eq',
      texto.id,
      { correta: true },
      ganchos,
    )
    expect(aoCorrigir).not.toHaveBeenCalled()
    const r = await corrigirResposta(
      c.db,
      agora,
      'eq',
      arquivo.id,
      { correta: true },
      ganchos,
    )
    expect(r).toEqual({ fechada: true, estado: 'aprovada' })
    expect(aoCorrigir).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'ana',
        aulaId: c.aulaId,
        tentativaId: item.tentativaId,
        numero: 1,
        aprovada: true,
      }),
    )
    expect(aoAprovarPelaPrimeiraVez).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'ana', aulaId: c.aulaId, pontos: 80 }),
    )
    expect((await obterQuizDoAluno(c.db, 'ana', c.aulaId))?.aprovado).toBe(true)
  })

  it('reprova (100% exigido) com uma errada: avisa, mas não dá pontos', async () => {
    const c = await cenario()
    await c.enviar('ana')
    const { texto, arquivo } = await fila(c)
    const aoCorrigir = vi.fn(async () => {})
    const aoAprovarPelaPrimeiraVez = vi.fn(async () => {})
    const ganchos = { aoCorrigir, aoAprovarPelaPrimeiraVez }
    await corrigirResposta(
      c.db,
      agora,
      'eq',
      texto.id,
      { correta: true },
      ganchos,
    )
    const r = await corrigirResposta(
      c.db,
      agora,
      'eq',
      arquivo.id,
      { correta: false },
      ganchos,
    )
    expect(r).toEqual({ fechada: true, estado: 'reprovada' })
    expect(aoCorrigir).toHaveBeenCalledWith(
      expect.objectContaining({ aprovada: false }),
    )
    expect(aoAprovarPelaPrimeiraVez).not.toHaveBeenCalled()
  })

  it('o mínimo em % vale também com as abertas: 2 de 3 reprova com 67% e aprova com 66%', async () => {
    const reprova = await cenario({ minimoDeAcertos: 67 })
    await reprova.enviar('ana')
    const a = await fila(reprova)
    await corrigirResposta(reprova.db, agora, 'eq', a.texto.id, {
      correta: true,
    })
    expect(
      await corrigirResposta(reprova.db, agora, 'eq', a.arquivo.id, {
        correta: false,
      }),
    ).toMatchObject({ estado: 'reprovada' })

    const aprova = await cenario({ minimoDeAcertos: 66 })
    await aprova.enviar('ana')
    const b = await fila(aprova)
    await corrigirResposta(aprova.db, agora, 'eq', b.texto.id, {
      correta: true,
    })
    expect(
      await corrigirResposta(aprova.db, agora, 'eq', b.arquivo.id, {
        correta: false,
      }),
    ).toMatchObject({ estado: 'aprovada' })
  })

  it('a pergunta de escolha errada pesa na nota mesmo com as abertas certas', async () => {
    const c = await cenario()
    await c.enviar('ana', 'errada')
    const { texto, arquivo } = await fila(c)
    await corrigirResposta(c.db, agora, 'eq', texto.id, { correta: true })
    expect(
      await corrigirResposta(c.db, agora, 'eq', arquivo.id, { correta: true }),
    ).toEqual({ fechada: true, estado: 'reprovada' })
  })

  it('depois de fechada recusa nova marcação', async () => {
    const c = await cenario()
    await c.enviar('ana')
    const { texto, arquivo } = await fila(c)
    await corrigirResposta(c.db, agora, 'eq', texto.id, { correta: true })
    await corrigirResposta(c.db, agora, 'eq', arquivo.id, { correta: true })
    await expect(
      corrigirResposta(c.db, agora, 'eq', texto.id, { correta: false }),
    ).rejects.toThrow(/já foi corrigida/)
  })
})

describe('liberar nova tentativa (bordas)', () => {
  it('libera mais de uma vez e cada liberação soma uma tentativa', async () => {
    const c = await cenario({ semCorrecao: true })
    await c.enviar('ana', 'errada')
    await liberarTentativa(c.db, agora, 'eq', c.quiz.id, 'ana')
    await c.enviar('ana', 'errada')
    await liberarTentativa(c.db, agora, 'eq', c.quiz.id, 'ana')
    expect(await obterQuizDoAluno(c.db, 'ana', c.aulaId)).toMatchObject({
      maximoDeTentativas: 3,
      restantes: 1,
    })
  })

  it('recusa quando o aluno ainda tem tentativas', async () => {
    const c = await cenario({ semCorrecao: true, maximoDeTentativas: 3 })
    await c.enviar('ana', 'errada')
    await expect(
      liberarTentativa(c.db, agora, 'eq', c.quiz.id, 'ana'),
    ).rejects.toThrow(/ainda tem tentativas/)
  })

  it('a liberação vale só para o aluno liberado', async () => {
    const c = await cenario({ semCorrecao: true })
    await c.enviar('ana', 'errada')
    await c.enviar('bia', 'errada')
    await liberarTentativa(c.db, agora, 'eq', c.quiz.id, 'ana')
    expect((await listarSemTentativas(c.db)).map((l) => l.alunoId)).toEqual([
      'bia',
    ])
  })
})

describe('listarSemTentativas', () => {
  it('vazia sem ninguém reprovado', async () => {
    const { db } = await cenario({ semCorrecao: true })
    expect(await listarSemTentativas(db)).toEqual([])
  })

  it('não inclui aprovado, quem tem tentativa sobrando, quem aguarda correção nem quiz ilimitado', async () => {
    const aprovado = await cenario({ semCorrecao: true })
    await aprovado.enviar('ana', 'certa')
    expect(await listarSemTentativas(aprovado.db)).toEqual([])

    const sobrando = await cenario({ semCorrecao: true, maximoDeTentativas: 2 })
    await sobrando.enviar('ana', 'errada')
    expect(await listarSemTentativas(sobrando.db)).toEqual([])

    const aguardando = await cenario()
    await aguardando.enviar('ana')
    expect(await listarSemTentativas(aguardando.db)).toEqual([])

    const livre = await cenario({ semCorrecao: true, maximoDeTentativas: null })
    await livre.enviar('ana', 'errada')
    expect(await listarSemTentativas(livre.db)).toEqual([])
  })

  it('traz os dados do aluno e da última tentativa, os mais recentes primeiro', async () => {
    const c = await cenario({ semCorrecao: true })
    await c.enviar('ana', 'errada')
    relogio = new Date(T0.getTime() + 3_600_000)
    await c.enviar('bia', 'errada')
    const lista = await listarSemTentativas(c.db)
    expect(lista.map((l) => l.alunoNome)).toEqual(['Bia', 'Ana'])
    expect(lista[0]).toMatchObject({
      alunoEmail: 'bia@x.test',
      aulaTitulo: 'Cores',
      cursoNome: 'Coloração',
      tentativas: 1,
      ultimoPercentual: 66,
      ultimaEm: relogio,
    })
  })

  it('ignora quiz de aula excluída', async () => {
    const c = await cenario({ semCorrecao: true })
    await c.enviar('ana', 'errada')
    await c.db.update(aula).set({ excluidoEm: T0 }).where(eq(aula.id, c.aulaId))
    expect(await listarSemTentativas(c.db)).toEqual([])
  })
})

describe('arquivoDeEntrega', () => {
  it('devolve nulo para arquivo inexistente', async () => {
    const { db } = await cenario()
    expect(await arquivoDeEntrega(db, 'nao-existe')).toBeNull()
  })

  it('devolve o dono e a aula do arquivo entregue', async () => {
    const c = await cenario()
    await c.enviar('ana')
    const { arquivo } = await fila(c)
    const id = arquivo.arquivos[0]?.id ?? ''
    expect(await arquivoDeEntrega(c.db, id)).toEqual({
      chave: ARQUIVO.chave,
      nome: 'foto.jpg',
      tipo: 'image/jpeg',
      alunoId: 'ana',
      aulaId: c.aulaId,
    })
  })
})
