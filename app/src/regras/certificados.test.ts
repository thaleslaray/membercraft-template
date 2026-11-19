import { eq } from 'drizzle-orm'
import { describe, expect, it, vi } from 'vitest'
import {
  certificado,
  curso as cursoDaTabela,
  lancamentoDePontos,
  matricula,
  modeloDeCertificado,
  quiz as quizDaTabela,
  registroDeAcoes,
  tentativaDoQuiz,
  user,
} from '#/db/schema'
import {
  avaliarExigencias,
  CAMPOS_PADRAO,
  certificadoDoCurso,
  certificadosDoAluno,
  certificadosParaReenfileirar,
  confirmarNome,
  corrigirNomeEReemitir,
  dadosParaAvisarEmissao,
  ErroDeCertificado,
  emitirRetroativo,
  gerarCodigo,
  lerModelo,
  marcarPdfFalhou,
  marcarPdfPronto,
  normalizarCampos,
  normalizarCodigo,
  pdfParaBaixar,
  pedirNovoPdf,
  revogarCertificado,
  salvarModelo,
  situacaoDoCertificado,
  textoDoQueFalta,
  validarCodigo,
  verificarEEmitir,
} from '#/regras/certificados'
import { criarAula, criarCurso, criarModulo } from '#/regras/conteudo'
import { criarTurma } from '#/regras/matricula'
import { PermissaoNegada } from '#/regras/permissoes'
import { concluirAula } from '#/regras/progresso'
import { salvarQuiz } from '#/regras/quiz'
import { criarBancoDeTeste } from '#/test/banco'

const agora = () => new Date('2026-06-10T12:00:00Z')
const dia = (d: number) =>
  new Date(`2026-06-${String(d).padStart(2, '0')}T12:00:00Z`)

// Curso com 3 aulas; Ana e Bia matriculadas, Marina é da equipe.
async function cenario(opcoes: { modeloAtivo?: boolean } = {}) {
  const db = await criarBancoDeTeste()
  await db.insert(user).values([
    { id: 'ana', name: 'ana', email: 'ana@x.test' },
    { id: 'bia', name: 'Bia', email: 'bia@x.test' },
    { id: 'eq', name: 'Marina', email: 'eq@x.test', perfil: 'equipe' },
    { id: 'dono', name: 'Helena', email: 'd@x.test', perfil: 'proprietario' },
  ])
  const cursoId = await criarCurso(db, { nome: 'Coloração' })
  const turmaId = await criarTurma(db, { cursoId, nome: 'T1' })
  const moduloId = await criarModulo(db, cursoId, { nome: 'Base' })
  const aulas = [
    await criarAula(db, moduloId, { titulo: 'Raiz' }),
    await criarAula(db, moduloId, { titulo: 'Mechas' }),
    await criarAula(db, moduloId, { titulo: 'Tons' }),
  ]
  for (const userId of ['ana', 'bia', 'eq']) {
    await db.insert(matricula).values({
      id: `m-${userId}`,
      userId,
      turmaId,
      iniciaEm: dia(1),
    })
  }
  if (opcoes.modeloAtivo !== false) {
    await salvarModelo(db, agora, cursoId, {
      ativo: true,
      frente: 'conteudo/imagens/a/frente.png',
      verso: null,
      campos: CAMPOS_PADRAO,
      todasAsAulas: true,
      pontosMinimos: 0,
    })
  }
  return { db, cursoId, aulas }
}

async function confirmar(
  db: Awaited<ReturnType<typeof cenario>>['db'],
  userId: string,
  nome = 'Ana Souza',
) {
  await confirmarNome(db, agora, userId, nome)
}

async function concluir(
  db: Awaited<ReturnType<typeof cenario>>['db'],
  userId: string,
  aulaIds: string[],
  quando = agora,
) {
  for (const a of aulaIds) await concluirAula(db, quando, userId, a)
}

describe('texto do que falta', () => {
  it('junta aulas, quiz e pontos como na spec', () => {
    expect(textoDoQueFalta({ aulas: 3, quizzes: ['A402'], pontos: 1200 })).toBe(
      'Faltam 3 aulas, o exercício A402 e 1.200 pontos',
    )
  })
  it('concorda no singular e no plural', () => {
    expect(textoDoQueFalta({ aulas: 1, quizzes: [], pontos: 0 })).toBe(
      'Falta 1 aula',
    )
    expect(textoDoQueFalta({ aulas: 0, quizzes: ['A', 'B'], pontos: 0 })).toBe(
      'Faltam os exercícios A e B',
    )
    expect(textoDoQueFalta({ aulas: 0, quizzes: [], pontos: 50 })).toBe(
      'Faltam 50 pontos',
    )
  })
  it('não diz nada quando não falta nada', () => {
    expect(textoDoQueFalta({ aulas: 0, quizzes: [], pontos: 0 })).toBeNull()
  })
})

describe('campos do modelo', () => {
  it('descarta campo desconhecido (inclusive CPF), repetido e corrige limites', () => {
    const campos = normalizarCampos([
      { campo: 'cpf', x: 0.5, y: 0.5, tamanho: 12 },
      { campo: 'nome', x: 2, y: -1, tamanho: 9999, cor: 'vermelho' },
      { campo: 'nome', x: 0.1, y: 0.1, tamanho: 12 },
    ])
    expect(campos).toHaveLength(1)
    expect(campos[0]).toMatchObject({
      campo: 'nome',
      x: 1,
      y: 0,
      tamanho: 200,
      cor: '#1a1a1a',
    })
  })
  it('o modelo padrão não tem CPF', () => {
    expect(CAMPOS_PADRAO.map((c) => c.campo)).toEqual([
      'nome',
      'curso',
      'data',
      'codigo',
      'qr',
    ])
  })
})

describe('código de validação', () => {
  it('tem o formato XXXX-XXXX e normaliza o que a pessoa digita', () => {
    expect(gerarCodigo()).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/)
    expect(normalizarCodigo(' ab3d efgh ')).toBe('AB3D-EFGH')
  })
})

describe('exigências', () => {
  it('todas as aulas: a data é a da última aula concluída', async () => {
    const { db, cursoId, aulas } = await cenario()
    await concluir(db, 'ana', [aulas[0]], () => dia(2))
    await concluir(db, 'ana', [aulas[1], aulas[2]], () => dia(5))
    const s = (await avaliarExigencias(db, cursoId, ['ana', 'bia'])).get('ana')
    expect(s?.cumpre).toBe(true)
    expect(s?.concluidoEm).toEqual(dia(5))
    expect(
      (await avaliarExigencias(db, cursoId, ['bia'])).get('bia')?.faltam.aulas,
    ).toBe(3)
  })

  it('quiz obrigatório para o certificado: falta até a aprovação, e a data é a dela', async () => {
    const { db, cursoId, aulas } = await cenario()
    await salvarQuiz(db, aulas[2], {
      soQuiz: false,
      obrigatorio: false,
      obrigatorioParaCertificado: true,
      minimoDeAcertos: 70,
      maximoDeTentativas: null,
      pontos: 100,
      perguntas: [
        {
          tipo: 'unica',
          enunciado: 'Q?',
          alternativas: [
            { texto: 'A', correta: true },
            { texto: 'B', correta: false },
          ],
        },
      ],
    })
    await concluir(db, 'ana', aulas, () => dia(3))
    const antes = (await avaliarExigencias(db, cursoId, ['ana'])).get('ana')
    expect(antes?.cumpre).toBe(false)
    expect(antes?.faltam.quizzes).toEqual(['Tons'])

    const [q] = await db.select().from(quizDaTabela)
    await db.insert(tentativaDoQuiz).values({
      id: 't1',
      quizId: q.id,
      userId: 'ana',
      numero: 1,
      estado: 'aprovada',
      perguntas: '[]',
      respostas: '{}',
      acertos: 1,
      total: 1,
      percentual: 100,
      minimoDeAcertos: 70,
      enviadaEm: dia(8),
    })
    const depois = (await avaliarExigencias(db, cursoId, ['ana'])).get('ana')
    expect(depois?.cumpre).toBe(true)
    expect(depois?.concluidoEm).toEqual(dia(8))
  })

  it('quiz não obrigatório para o certificado não conta', async () => {
    const { db, cursoId, aulas } = await cenario()
    await salvarQuiz(db, aulas[0], {
      soQuiz: false,
      obrigatorio: true,
      obrigatorioParaCertificado: false,
      minimoDeAcertos: 70,
      maximoDeTentativas: null,
      pontos: 100,
      perguntas: [
        {
          tipo: 'unica',
          enunciado: 'Q?',
          alternativas: [
            { texto: 'A', correta: true },
            { texto: 'B', correta: false },
          ],
        },
      ],
    })
    await concluir(db, 'ana', aulas)
    expect(
      (await avaliarExigencias(db, cursoId, ['ana'])).get('ana')?.cumpre,
    ).toBe(true)
  })

  it('pontos mínimos no curso: conta só o vigente do curso e a data é a de quando chegou ao mínimo', async () => {
    const { db, cursoId, aulas } = await cenario()
    await db
      .update(cursoDaTabela)
      .set({ certificadoPontosMinimos: 150 })
      .where(eq(cursoDaTabela.id, cursoId))
    await concluir(db, 'ana', aulas, () => dia(2))
    const lanca = (id: string, pontos: number, quando: Date, extra = {}) =>
      db.insert(lancamentoDePontos).values({
        id,
        userId: 'ana',
        cursoId,
        origemTipo: 'avulso',
        pontos,
        motivo: 'x',
        criadoEm: quando,
        ...extra,
      })
    await lanca('l1', 100, dia(3))
    await lanca('l2', 999, dia(4), { estornadoEm: dia(5) })
    const faltando = (await avaliarExigencias(db, cursoId, ['ana'])).get('ana')
    expect(faltando?.faltam.pontos).toBe(50)
    expect(
      textoDoQueFalta(faltando?.faltam ?? { aulas: 0, quizzes: [], pontos: 0 }),
    ).toBe('Faltam 50 pontos')
    await lanca('l3', 60, dia(6))
    const ok = (await avaliarExigencias(db, cursoId, ['ana'])).get('ana')
    expect(ok?.cumpre).toBe(true)
    expect(ok?.concluidoEm).toEqual(dia(6))
  })

  it('curso sem nenhuma exigência não dá certificado a ninguém', async () => {
    const { db, cursoId } = await cenario()
    await db
      .update(cursoDaTabela)
      .set({ certificadoTodasAsAulas: false })
      .where(eq(cursoDaTabela.id, cursoId))
    expect(
      (await avaliarExigencias(db, cursoId, ['ana'])).get('ana')?.cumpre,
    ).toBe(false)
  })
})

describe('emissão', () => {
  it('emite ao cumprir, uma vez só, com o nome confirmado, e chama o gancho', async () => {
    const { db, cursoId, aulas } = await cenario()
    await confirmar(db, 'ana')
    await concluir(db, 'ana', aulas, () => dia(4))
    const aoEmitir = vi.fn(async () => {})
    const r = await verificarEEmitir(db, agora, 'ana', cursoId, {
      aoEmitirCertificado: aoEmitir,
    })
    expect(r.situacao).toBe('emitido')
    if (r.situacao !== 'emitido') return
    expect(r.certificado).toMatchObject({
      nome: 'Ana Souza',
      cursoNome: 'Coloração',
      concluidoEm: dia(4),
    })
    expect(aoEmitir).toHaveBeenCalledTimes(1)
    const de_novo = await verificarEEmitir(db, agora, 'ana', cursoId, {
      aoEmitirCertificado: aoEmitir,
    })
    expect(de_novo.situacao).toBe('ja-emitido')
    expect(aoEmitir).toHaveBeenCalledTimes(1)
  })

  it('espera a confirmação do nome e emite quando ele chega', async () => {
    const { db, cursoId, aulas } = await cenario()
    await concluir(db, 'ana', aulas)
    expect((await verificarEEmitir(db, agora, 'ana', cursoId)).situacao).toBe(
      'aguardando-nome',
    )
    expect((await certificadoDoCurso(db, 'ana', cursoId)).tipo).toBe(
      'aguardando-nome',
    )
    const emitidos = await confirmarNome(
      db,
      agora,
      'ana',
      '  Ana   Souza Lima ',
    )
    expect(emitidos).toHaveLength(1)
    expect(emitidos[0].nome).toBe('Ana Souza Lima')
  })

  it('não emite sem modelo ativo, sem cumprir, nem para a equipe', async () => {
    const { db, cursoId, aulas } = await cenario({ modeloAtivo: false })
    await confirmar(db, 'ana')
    await concluir(db, 'ana', aulas)
    expect((await verificarEEmitir(db, agora, 'ana', cursoId)).situacao).toBe(
      'sem-modelo',
    )
    await salvarModelo(db, agora, cursoId, {
      ativo: true,
      frente: 'conteudo/imagens/a/f.png',
      verso: null,
      campos: [],
      todasAsAulas: true,
      pontosMinimos: 0,
    })
    expect((await verificarEEmitir(db, agora, 'bia', cursoId)).situacao).toBe(
      'nao-cumpre',
    )
    await confirmar(db, 'eq', 'Marina Equipe')
    await concluir(db, 'eq', aulas)
    expect((await verificarEEmitir(db, agora, 'eq', cursoId)).situacao).toBe(
      'nao-e-aluno',
    )
  })

  it('ativar o modelo emite para quem já cumpre (retroativo); facilitar as exigências também', async () => {
    const { db, cursoId, aulas } = await cenario({ modeloAtivo: false })
    await confirmar(db, 'ana')
    await concluir(db, 'ana', aulas, () => dia(2))
    await concluir(db, 'bia', [aulas[0]], () => dia(2))
    await salvarModelo(db, agora, cursoId, {
      ativo: true,
      frente: 'conteudo/imagens/a/f.png',
      verso: null,
      campos: [],
      todasAsAulas: true,
      pontosMinimos: 0,
    })
    const primeira = await emitirRetroativo(db, agora, cursoId)
    expect(primeira.emitidos.map((c) => c.userId)).toEqual(['ana'])

    await confirmar(db, 'bia', 'Bia Lima')
    // Bia ainda não cumpre; exigir 150 pontos em vez das aulas e dar os pontos não basta... mas
    // facilitar para "sem aulas, 0 pontos" não é exigência nenhuma. Facilita para 100 pontos:
    await db.insert(lancamentoDePontos).values({
      id: 'lb',
      userId: 'bia',
      cursoId,
      origemTipo: 'avulso',
      pontos: 100,
      motivo: 'x',
      criadoEm: dia(3),
    })
    await salvarModelo(db, agora, cursoId, {
      ativo: true,
      frente: 'conteudo/imagens/a/f.png',
      verso: null,
      campos: [],
      todasAsAulas: false,
      pontosMinimos: 100,
    })
    const segunda = await emitirRetroativo(db, agora, cursoId)
    // Ana também cumpre as novas exigências? Ela já tem certificado: não repete.
    expect(segunda.emitidos.map((c) => c.userId)).toEqual(['bia'])
    expect(segunda.emitidos[0].concluidoEm).toEqual(dia(3))
  })

  it('o retroativo avisa quem espera o nome', async () => {
    const { db, cursoId, aulas } = await cenario()
    await concluir(db, 'ana', aulas)
    const r = await emitirRetroativo(db, agora, cursoId)
    expect(r.emitidos).toHaveLength(0)
    expect(r.aguardandoNome).toEqual(['ana'])
  })

  it('só aceita imagem PNG ou JPEG da pasta de imagens do conteúdo', async () => {
    const { db, cursoId } = await cenario({ modeloAtivo: false })
    const base = {
      ativo: true,
      verso: null,
      campos: [],
      todasAsAulas: true,
      pontosMinimos: 0,
    }
    for (const frente of [
      'conteudo/imagens/a/f.gif',
      'conteudo/imagens/a/f.webp',
      'conteudo/materiais/a/f.png',
      'conteudo/imagens/../x.png',
    ]) {
      await expect(
        salvarModelo(db, agora, cursoId, { ...base, frente }),
      ).rejects.toThrow('PNG ou JPEG')
    }
    await expect(
      salvarModelo(db, agora, cursoId, {
        ...base,
        frente: 'conteudo/imagens/a/f.JPG',
        verso: 'conteudo/imagens/a/v.jpeg',
      }),
    ).resolves.toBeUndefined()
  })

  it('ativar sem imagem da frente é recusado', async () => {
    const { db, cursoId } = await cenario({ modeloAtivo: false })
    await expect(
      salvarModelo(db, agora, cursoId, {
        ativo: true,
        frente: null,
        verso: null,
        campos: [],
        todasAsAulas: true,
        pontosMinimos: 0,
      }),
    ).rejects.toThrow(ErroDeCertificado)
    expect((await lerModelo(db, cursoId)).ativo).toBe(false)
  })

  it('a página do curso diz o que falta', async () => {
    const { db, cursoId, aulas } = await cenario()
    await concluir(db, 'ana', [aulas[0]])
    expect(await certificadoDoCurso(db, 'ana', cursoId)).toMatchObject({
      tipo: 'faltam',
      texto: 'Faltam 2 aulas',
    })
  })

  it('sem modelo ativo a situação é "sem certificado", mesmo com tudo cumprido', async () => {
    const { db, cursoId, aulas } = await cenario({ modeloAtivo: false })
    await confirmar(db, 'ana')
    await concluir(db, 'ana', aulas)
    expect((await certificadoDoCurso(db, 'ana', cursoId)).tipo).toBe(
      'sem-certificado',
    )
  })

  it('emitido traz a frente do modelo e só os campos da frente, para a prévia', async () => {
    const { db, cursoId, aulas } = await cenario()
    await salvarModelo(db, agora, cursoId, {
      ativo: true,
      frente: 'conteudo/imagens/a/frente.png',
      verso: 'conteudo/imagens/a/verso.png',
      campos: [
        ...CAMPOS_PADRAO,
        { ...CAMPOS_PADRAO[0], lado: 'verso', x: 0.2 },
      ],
      todasAsAulas: true,
      pontosMinimos: 0,
    })
    await confirmar(db, 'ana')
    await concluir(db, 'ana', aulas)
    await verificarEEmitir(db, agora, 'ana', cursoId)
    const situacao = await certificadoDoCurso(db, 'ana', cursoId)
    if (situacao.tipo !== 'emitido') throw new Error('não emitiu')
    expect(situacao.modelo).toEqual({
      frente: 'conteudo/imagens/a/frente.png',
      campos: CAMPOS_PADRAO,
    })
    expect(situacao.certificado.nome).toBe('Ana Souza')
  })

  it('diz se o curso gera o certificado do MEC (a Formação)', async () => {
    const { db, cursoId } = await cenario()
    expect((await certificadoDoCurso(db, 'ana', cursoId)).geraMec).toBe(false)
    await db
      .update(cursoDaTabela)
      .set({ geraPedidoDoMec: true })
      .where(eq(cursoDaTabela.id, cursoId))
    expect((await certificadoDoCurso(db, 'ana', cursoId)).geraMec).toBe(true)
  })
})

async function emitido() {
  const c = await cenario()
  await confirmar(c.db, 'ana')
  await concluir(c.db, 'ana', c.aulas, () => dia(4))
  const r = await verificarEEmitir(c.db, agora, 'ana', c.cursoId)
  if (r.situacao !== 'emitido') throw new Error('não emitiu')
  return { ...c, certificadoId: r.certificado.id, codigo: r.certificado.codigo }
}

describe('certificados da aluna com a prévia', () => {
  it('cada certificado traz a frente e os campos da frente do modelo; sem modelo, nulo', async () => {
    const { db, cursoId } = await emitido()
    const [c] = await certificadosDoAluno(db, 'ana')
    expect(c.modelo?.frente).toBe('conteudo/imagens/a/frente.png')
    expect(c.modelo?.campos.length).toBeGreaterThan(0)
    expect(c.modelo?.campos.every((x) => x.lado === 'frente')).toBe(true)
    await db
      .update(modeloDeCertificado)
      .set({ frente: null })
      .where(eq(modeloDeCertificado.cursoId, cursoId))
    expect((await certificadosDoAluno(db, 'ana'))[0].modelo).toBeNull()
  })
})

describe('PDF e download', () => {
  it('nasce "gerando", fica pronto, avisa só na primeira vez e baixa pelo dono', async () => {
    const { db, certificadoId } = await emitido()
    expect((await certificadosDoAluno(db, 'ana'))[0].situacao).toBe('gerando')
    expect(await pdfParaBaixar(db, 'ana', certificadoId)).toBeNull()
    expect(
      (await marcarPdfPronto(db, agora, certificadoId, 'certificados/x.pdf'))
        .primeiraVez,
    ).toBe(true)
    expect(
      (await marcarPdfPronto(db, agora, certificadoId, 'certificados/x.pdf'))
        .primeiraVez,
    ).toBe(false)
    expect((await certificadosDoAluno(db, 'ana'))[0].situacao).toBe('pronto')
    expect(await pdfParaBaixar(db, 'ana', certificadoId)).toMatchObject({
      chave: 'certificados/x.pdf',
    })
    expect(await pdfParaBaixar(db, 'bia', certificadoId)).toBeNull()
  })

  it('falha fica visível à equipe e ao aluno como "falhou"; regenerar volta a gerar', async () => {
    const { db, certificadoId } = await emitido()
    await marcarPdfFalhou(db, certificadoId)
    const [linha] = await db.select().from(certificado)
    expect(linha.pdfEstado).toBe('falhou')
    expect((await certificadosDoAluno(db, 'ana'))[0].situacao).toBe('falhou')
    await pedirNovoPdf(db, 'equipe', certificadoId)
    expect((await db.select().from(certificado))[0].pdfEstado).toBe('gerando')
    await expect(pedirNovoPdf(db, 'aluno', certificadoId)).rejects.toThrow(
      PermissaoNegada,
    )
  })
})

describe('situação do certificado', () => {
  it('revogado vence tudo; senão vale o estado do PDF', () => {
    const revogadoEm = new Date()
    for (const pdfEstado of ['gerando', 'pronto', 'falhou'] as const) {
      expect(situacaoDoCertificado({ revogadoEm, pdfEstado })).toBe('revogado')
      expect(situacaoDoCertificado({ revogadoEm: null, pdfEstado })).toBe(
        pdfEstado,
      )
    }
  })

  it('job atrasado não marca revogado como pronto nem avisa o aluno', async () => {
    const { db, certificadoId } = await emitido()
    await revogarCertificado(db, agora, {
      perfil: 'proprietario',
      autorId: 'dono',
      certificadoId,
      motivo: 'Fraude confirmada',
    })
    const r = await marcarPdfPronto(
      db,
      agora,
      certificadoId,
      'certificados/x.pdf',
    )
    expect(r.primeiraVez).toBe(false)
    const [linha] = await db.select().from(certificado)
    expect(linha).toMatchObject({ pdfEstado: 'gerando', pdfChave: null })
    expect(linha.avisadoEm).toBeNull()
    expect(linha.pdfGeradoEm).toBeNull()
    expect((await certificadosDoAluno(db, 'ana'))[0].situacao).toBe('revogado')
  })
})

describe('varredura dos PDFs sem fila', () => {
  const depois = (min: number) => () =>
    new Date(agora().getTime() + min * 60 * 1000)

  it('pega só "gerando" sem PDF, não revogado e emitido há mais de 30 min', async () => {
    const { db, certificadoId } = await emitido()
    expect(await certificadosParaReenfileirar(db, depois(29))).toEqual([])
    expect(await certificadosParaReenfileirar(db, depois(31))).toEqual([
      certificadoId,
    ])
    await marcarPdfPronto(db, agora, certificadoId, 'certificados/x.pdf')
    expect(await certificadosParaReenfileirar(db, depois(31))).toEqual([])
  })

  it('ignora os revogados e os que falharam', async () => {
    const { db, certificadoId } = await emitido()
    await marcarPdfFalhou(db, certificadoId)
    expect(await certificadosParaReenfileirar(db, depois(60))).toEqual([])
    await pedirNovoPdf(db, 'equipe', certificadoId)
    expect(await certificadosParaReenfileirar(db, depois(60))).toEqual([
      certificadoId,
    ])
    await revogarCertificado(db, agora, {
      perfil: 'proprietario',
      autorId: 'dono',
      certificadoId,
      motivo: 'Fraude confirmada',
    })
    expect(await certificadosParaReenfileirar(db, depois(60))).toEqual([])
  })
})

describe('validação pública, revogação e reemissão', () => {
  it('valida pelo código (com o que a pessoa digitar) e mostra Válido; desconhecido é nulo', async () => {
    const { db, codigo } = await emitido()
    expect(
      await validarCodigo(db, codigo.toLowerCase().replace('-', ' ')),
    ).toMatchObject({
      estado: 'valido',
      nome: 'Ana Souza',
      cursoNome: 'Coloração',
      concluidoEm: dia(4),
    })
    expect(await validarCodigo(db, 'ZZZZ-ZZZZ')).toBeNull()
  })

  it('só o Proprietário revoga, com motivo e registro; a página passa a dizer Revogado e o aluno não baixa', async () => {
    const { db, certificadoId, codigo } = await emitido()
    await marcarPdfPronto(db, agora, certificadoId, 'certificados/x.pdf')
    const entrada = {
      autorId: 'dono',
      certificadoId,
      motivo: 'Fraude confirmada',
    }
    await expect(
      revogarCertificado(db, agora, { ...entrada, perfil: 'equipe' }),
    ).rejects.toThrow(PermissaoNegada)
    await expect(
      revogarCertificado(db, agora, {
        ...entrada,
        perfil: 'proprietario',
        motivo: ' ',
      }),
    ).rejects.toThrow(ErroDeCertificado)
    await revogarCertificado(db, agora, { ...entrada, perfil: 'proprietario' })
    expect((await validarCodigo(db, codigo))?.estado).toBe('revogado')
    expect(await pdfParaBaixar(db, 'ana', certificadoId)).toBeNull()
    expect((await certificadosDoAluno(db, 'ana'))[0].situacao).toBe('revogado')
    const [registro] = await db.select().from(registroDeAcoes)
    expect(registro).toMatchObject({
      acao: 'certificado-revogado',
      autorId: 'dono',
    })
    expect(registro.detalhe).toContain('Fraude confirmada')
    await expect(
      revogarCertificado(db, agora, { ...entrada, perfil: 'proprietario' }),
    ).rejects.toThrow(/Já está revogado/)
  })

  it('a equipe corrige o nome e reemite: mesmo código, PDF volta a gerar, fica registrado', async () => {
    const { db, certificadoId, codigo } = await emitido()
    await marcarPdfPronto(db, agora, certificadoId, 'certificados/x.pdf')
    await expect(
      corrigirNomeEReemitir(db, agora, {
        perfil: 'aluno',
        autorId: 'ana',
        certificadoId,
        nome: 'Outra',
      }),
    ).rejects.toThrow(PermissaoNegada)
    await corrigirNomeEReemitir(db, agora, {
      perfil: 'equipe',
      autorId: 'eq',
      certificadoId,
      nome: 'Ana Souza Lima',
    })
    const [linha] = await db.select().from(certificado)
    expect(linha).toMatchObject({
      nome: 'Ana Souza Lima',
      codigo,
      pdfEstado: 'gerando',
    })
    expect((await validarCodigo(db, codigo))?.nome).toBe('Ana Souza Lima')
    const [registro] = await db.select().from(registroDeAcoes)
    expect(registro.acao).toBe('certificado-reemitido')
  })
})

describe('dadosParaAvisarEmissao', () => {
  it('traz quem recebe o aviso e o curso citado, ou nulo se o certificado sumiu', async () => {
    const { db, cursoId } = await cenario()
    await db.insert(certificado).values({
      id: 'c1',
      userId: 'ana',
      cursoId,
      codigo: 'AAAA-1111',
      nome: 'Ana Souza',
      cursoNome: 'Coloração',
      concluidoEm: agora(),
      emitidoEm: agora(),
    })
    expect(await dadosParaAvisarEmissao(db, 'c1')).toEqual({
      id: 'ana',
      email: 'ana@x.test',
      nome: 'Ana Souza',
      curso: 'Coloração',
    })
    expect(await dadosParaAvisarEmissao(db, 'nada')).toBeNull()
  })
})
