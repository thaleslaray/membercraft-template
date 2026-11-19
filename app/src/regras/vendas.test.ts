import { eq } from 'drizzle-orm'
import { describe, expect, it, vi } from 'vitest'
import { avisoDeVenda, matricula, origemDaMatricula, user } from '#/db/schema'
import { criarCurso } from '#/regras/conteudo'
import { criarTurma, matricularManual } from '#/regras/matricula'
import {
  atualizarLigacao,
  ErroDeVenda,
  gravarAviso,
  ligarProduto,
  listarAvisos,
  listarLigacoes,
  processarAviso,
  produtosVistos,
  removerLigacao,
  turmasDaVenda,
  vendaIdDeOrigem,
} from '#/regras/vendas'
import { criarBancoDeTeste } from '#/test/banco'
import { corpoDaFixture, type NomeDeFixture } from '#/test/fixtures/voomp'

const T0 = new Date('2026-06-01T12:00:00Z')
const agora = () => T0
const em = (dias: number) => new Date(T0.getTime() + dias * 86_400_000)

async function cenario() {
  const db = await criarBancoDeTeste()
  await db.insert(user).values({
    id: 'eq',
    name: 'Marina',
    email: 'marina@x.test',
    perfil: 'equipe',
  })
  const cursoId = await criarCurso(db, { nome: 'Acessórios' })
  const turmaId = await criarTurma(db, {
    cursoId,
    nome: 'Turma 1',
    prazoEmDias: 365,
  })
  const outraId = await criarTurma(db, { cursoId, nome: 'Turma 2' })
  // Recebe o aviso e já processa, como o webhook e a fila fazem.
  const chega = async (corpo: string) => {
    const gravado = await gravarAviso(db, agora, corpo)
    const resultado = gravado.enfileirar
      ? await processarAviso(db, agora, gravado.id)
      : null
    return { gravado, resultado }
  }
  const matriculaDe = async (email: string) => {
    const [conta] = await db.select().from(user).where(eq(user.email, email))
    if (!conta) return undefined
    const [m] = await db
      .select()
      .from(matricula)
      .where(eq(matricula.userId, conta.id))
    return m
  }
  const real = (nome: NomeDeFixture = 'sale-paid-real') => corpoDaFixture(nome)
  return { db, cursoId, turmaId, outraId, chega, matriculaDe, real }
}

describe('gravarAviso', () => {
  it('grava o aviso cru com o que a tela precisa e fica na fila ("recebida")', async () => {
    const { db, real } = await cenario()
    const corpo = real()
    const g = await gravarAviso(db, agora, corpo)
    expect(g).toMatchObject({
      invalido: false,
      repetido: false,
      enfileirar: true,
    })
    const [linha] = await db.select().from(avisoDeVenda)
    expect(linha).toMatchObject({
      id: g.id,
      chave: '900002:salePaid',
      tipo: 'sale',
      gatilho: 'salePaid',
      vendaId: '900002',
      produtoId: '9101',
      produtoNome: 'Curso de Acessórios',
      ofertaHash: 'abc123',
      email: 'ana.souza@exemplo.test',
      situacao: 'recebida',
      corpo,
    })
  })

  it('o mesmo aviso (mesma venda e gatilho) não cria linha nova: só conta a repetição', async () => {
    const { db, real } = await cenario()
    const a = await gravarAviso(db, agora, real())
    const b = await gravarAviso(db, agora, real())
    expect(b.id).toBe(a.id)
    expect(b.repetido).toBe(true)
    expect(b.enfileirar).toBe(true) // ainda não foi processado
    const linhas = await db.select().from(avisoDeVenda)
    expect(linhas).toHaveLength(1)
    expect(linhas[0].repeticoes).toBe(1)

    await processarAviso(db, agora, a.id)
    const c = await gravarAviso(db, agora, real())
    expect(c.enfileirar).toBe(false) // já processado: repetição sem efeito
  })

  it('a mesma venda com outro gatilho é outro aviso', async () => {
    const { db, real } = await cenario()
    await gravarAviso(db, agora, real())
    const r = await gravarAviso(db, agora, real('sale-refunded'))
    expect(r.repetido).toBe(false)
    expect(await db.select().from(avisoDeVenda)).toHaveLength(2)
  })

  it('corpo que não é aviso fica gravado "com erro", sem ir para a fila', async () => {
    const { db } = await cenario()
    const g = await gravarAviso(db, agora, '{nao-json')
    expect(g).toMatchObject({ invalido: true, enfileirar: false })
    const [linha] = await db.select().from(avisoDeVenda)
    expect(linha).toMatchObject({ situacao: 'com_erro', corpo: '{nao-json' })
    expect(linha.motivo).toMatch(/JSON/)
  })
})

describe('venda de produto sem ligação', () => {
  it('fica "sem turma": não cria conta nem matrícula', async () => {
    const { db, chega, matriculaDe, real } = await cenario()
    const { resultado } = await chega(real())
    expect(resultado?.situacao).toBe('sem_turma')
    expect(await matriculaDe('ana.souza@exemplo.test')).toBeUndefined()
    expect(
      await db
        .select()
        .from(user)
        .where(eq(user.email, 'ana.souza@exemplo.test')),
    ).toHaveLength(0)
  })

  it('vira matrícula na hora em que o produto é ligado', async () => {
    const { db, chega, matriculaDe, real, turmaId } = await cenario()
    await chega(real())
    const r = await ligarProduto(db, agora, { produtoId: '9101', turmaId })
    expect(r.aplicadas).toBe(1)
    expect(await matriculaDe('ana.souza@exemplo.test')).toMatchObject({
      situacao: 'ativa',
      turmaId,
    })
    const [aviso] = (await listarAvisos(db)).itens
    expect(aviso).toMatchObject({
      situacao: 'aplicada',
      turmas: ['Acessórios · Turma 1'],
    })
  })

  it('o estorno que chegou nesse meio-tempo é respeitado', async () => {
    const { db, chega, matriculaDe, real, turmaId } = await cenario()
    await chega(real())
    const { resultado } = await chega(real('sale-refunded'))
    expect(resultado?.situacao).toBe('ignorada')
    const r = await ligarProduto(db, agora, { produtoId: '9101', turmaId })
    expect(r.aplicadas).toBe(0)
    expect(await matriculaDe('ana.souza@exemplo.test')).toBeUndefined()
    const avisos = (await listarAvisos(db)).itens
    expect(avisos.find((a) => a.gatilho === 'salePaid')).toMatchObject({
      situacao: 'ignorada',
      motivo: 'A venda foi estornada.',
    })
  })

  it('ligar outro produto não mexe nas vendas que esperam', async () => {
    const { db, chega, real, turmaId } = await cenario()
    await chega(real())
    const r = await ligarProduto(db, agora, { produtoId: '9999', turmaId })
    expect(r.aplicadas).toBe(0)
    expect((await listarAvisos(db)).itens[0].situacao).toBe('sem_turma')
  })
})

describe('salePaid com ligação', () => {
  it('matricula o aluno nas turmas ligadas, com o prazo da ligação, e guarda a venda como origem', async () => {
    const { db, chega, matriculaDe, real, turmaId, outraId } = await cenario()
    await ligarProduto(db, agora, {
      produtoId: '9101',
      turmaId,
      prazoEmDias: 90,
    })
    await ligarProduto(db, agora, { produtoId: '9101', turmaId: outraId })
    const { resultado } = await chega(real())
    expect(resultado).toMatchObject({
      situacao: 'aplicada',
      motivo: '2 matrículas criadas',
    })
    const m = await matriculaDe('ana.souza@exemplo.test')
    expect(m).toBeDefined()
    const matriculas = await db.select().from(matricula)
    expect(matriculas).toHaveLength(2)
    expect(matriculas.find((x) => x.turmaId === turmaId)?.expiraEm).toEqual(
      em(90),
    )
    expect(matriculas.find((x) => x.turmaId === outraId)?.expiraEm).toBeNull()
    expect(
      (await db.select().from(origemDaMatricula)).map((o) => o.vendaId),
    ).toEqual(['voomp:900002', 'voomp:900002'])
    expect(
      (
        await db
          .select()
          .from(user)
          .where(eq(user.email, 'ana.souza@exemplo.test'))
      )[0].name,
    ).toBe('Ana Souza')
  })

  it('reprocessar uma venda já aplicada não muda nada', async () => {
    const { db, chega, real, turmaId } = await cenario()
    await ligarProduto(db, agora, { produtoId: '9101', turmaId })
    const { gravado } = await chega(real())
    const r = await processarAviso(db, agora, gravado.id)
    expect(r).toMatchObject({
      situacao: 'aplicada',
      motivo: '1 venda já aplicada',
    })
    expect(await db.select().from(matricula)).toHaveLength(1)
    expect(await db.select().from(origemDaMatricula)).toHaveLength(1)
  })

  it('o aviso de curso liberado sai uma vez por matrícula nova', async () => {
    const { db, real, turmaId } = await cenario()
    await ligarProduto(db, agora, { produtoId: '9101', turmaId })
    const liberados: string[] = []
    const g = await gravarAviso(db, agora, real())
    const opcoes = {
      aoLiberarCursos: async (es: { email: string }[]) => {
        for (const e of es) liberados.push(e.email)
      },
    }
    await processarAviso(db, agora, g.id, opcoes)
    await processarAviso(db, agora, g.id, opcoes)
    expect(liberados).toEqual(['ana.souza@exemplo.test'])
  })

  it('venda sem e-mail ou sem produto fica "com erro", sem subir', async () => {
    const { db, chega } = await cenario()
    const semEmail = await chega(
      corpoDaFixture('sale-paid-real', (a) => {
        a.client.email = null
      }),
    )
    expect(semEmail.resultado).toMatchObject({ situacao: 'com_erro' })
    const semVenda = await chega(
      corpoDaFixture('sale-paid-real', (a) => {
        a.sale.id = null
      }),
    )
    expect(semVenda.resultado).toMatchObject({
      situacao: 'com_erro',
      motivo: 'O aviso não traz o id da venda.',
    })
    expect(await db.select().from(matricula)).toHaveLength(0)
  })

  it('a falha do e-mail de curso liberado não derruba a venda, e aviso que não existe sobe para a fila', async () => {
    const { db, real, turmaId } = await cenario()
    await ligarProduto(db, agora, { produtoId: '9101', turmaId })
    const g = await gravarAviso(db, agora, real())
    const falha = new Error('D1 fora do ar')
    await expect(
      processarAviso(db, agora, g.id, {
        aoLiberarCursos: async () => {
          throw falha
        },
      }),
    ).resolves.toMatchObject({ situacao: 'aplicada' }) // o aviso de e-mail nunca derruba a venda
    const erro = vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(processarAviso(db, agora, 'nao-existe')).rejects.toThrow(
      ErroDeVenda,
    )
    erro.mockRestore()
  })

  it('a conta e a matrícula manual que já existiam ganham a venda como origem a mais', async () => {
    const { db, chega, real, turmaId, matriculaDe } = await cenario()
    await ligarProduto(db, agora, { produtoId: '9101', turmaId })
    await matricularManual(db, agora, {
      pessoas: [{ email: 'ana.souza@exemplo.test' }],
      turmaId,
      autorId: 'eq',
    })
    await chega(real())
    expect((await matriculaDe('ana.souza@exemplo.test'))?.expiraEm).toEqual(
      em(365),
    )
    expect(
      (await db.select().from(origemDaMatricula)).map((o) => o.tipo).sort(),
    ).toEqual(['manual', 'venda'])
  })
})

describe('falha do banco', () => {
  it('deixa o aviso "com erro" e sobe, para a fila tentar de novo e, esgotadas as tentativas, a fila de mortos', async () => {
    const { db, real, turmaId } = await cenario()
    await ligarProduto(db, agora, { produtoId: '9101', turmaId })
    const g = await gravarAviso(db, agora, real())
    const batch = vi
      .spyOn(db, 'batch')
      .mockRejectedValueOnce(new Error('D1 fora do ar'))
    await expect(processarAviso(db, agora, g.id)).rejects.toThrow('D1')
    const [falho] = await db.select().from(avisoDeVenda)
    expect(falho).toMatchObject({
      situacao: 'com_erro',
      motivo: 'D1 fora do ar',
    })
    // Na nova tentativa o aviso é aplicado.
    batch.mockRestore()
    expect(await processarAviso(db, agora, g.id)).toMatchObject({
      situacao: 'aplicada',
    })
  })
})

describe('oferta ligada', () => {
  it('a ligação da oferta soma com a do produto; sem ela valem só as do produto', async () => {
    const { db, turmaId, outraId } = await cenario()
    await ligarProduto(db, agora, { produtoId: '9101', turmaId })
    await ligarProduto(db, agora, {
      produtoId: '9101',
      ofertaHash: 'abc123',
      turmaId: outraId,
    })
    expect(
      (await turmasDaVenda(db, '9101', 'abc123')).map((t) => t.turmaId),
    ).toEqual([outraId, turmaId])
    expect(
      (await turmasDaVenda(db, '9101', 'outra')).map((t) => t.turmaId),
    ).toEqual([turmaId])
    expect(
      (await turmasDaVenda(db, '9101', null)).map((t) => t.turmaId),
    ).toEqual([turmaId])
    expect(await turmasDaVenda(db, '1', null)).toEqual([])
  })

  it('a venda da oferta matricula nas turmas da oferta e nas de todas as ofertas', async () => {
    const { db, chega, real, turmaId, outraId } = await cenario()
    await ligarProduto(db, agora, { produtoId: '9101', turmaId })
    await ligarProduto(db, agora, {
      produtoId: '9101',
      ofertaHash: 'abc123',
      turmaId: outraId,
    })
    await chega(real())
    expect(
      (await db.select().from(matricula)).map((m) => m.turmaId).sort(),
    ).toEqual([outraId, turmaId].sort())
  })
})

describe('ligações', () => {
  it('ligar de novo a mesma turma só troca o prazo; mudar a ligação não mexe nas matrículas', async () => {
    const { db, chega, real, turmaId } = await cenario()
    await ligarProduto(db, agora, {
      produtoId: '9101',
      turmaId,
      prazoEmDias: 90,
    })
    await chega(real())
    await ligarProduto(db, agora, {
      produtoId: '9101',
      turmaId,
      prazoEmDias: 10,
    })
    const ligacoes = await listarLigacoes(db)
    expect(ligacoes).toHaveLength(1)
    expect(ligacoes[0]).toMatchObject({
      prazoEmDias: 10,
      turmaNome: 'Turma 1',
      cursoNome: 'Acessórios',
      ofertaHash: '',
    })
    expect((await db.select().from(matricula))[0].expiraEm).toEqual(em(90))
    await removerLigacao(db, ligacoes[0].id)
    expect(await listarLigacoes(db)).toEqual([])
    expect(await db.select().from(matricula)).toHaveLength(1)
  })

  it('valida produto, turma e prazo', async () => {
    const { db, turmaId } = await cenario()
    await expect(
      ligarProduto(db, agora, { produtoId: ' ', turmaId }),
    ).rejects.toThrow(ErroDeVenda)
    await expect(
      ligarProduto(db, agora, { produtoId: '1', turmaId: 'x' }),
    ).rejects.toThrow(/Turma não encontrada/)
    for (const prazoEmDias of [0, 1.5, -3]) {
      await expect(
        ligarProduto(db, agora, { produtoId: '1', turmaId, prazoEmDias }),
      ).rejects.toThrow(/prazo/)
    }
  })

  it('lista os produtos vistos nos avisos, com as vendas que esperam turma', async () => {
    const { db, chega, real } = await cenario()
    await chega(real())
    await chega(real('sale-paid-botao-de-teste'))
    const produtos = await produtosVistos(db)
    expect(
      produtos.map((p) => [p.produtoId, p.ofertaHash, Number(p.semTurma)]),
    ).toEqual([
      ['9100', null, 1],
      ['9101', 'abc123', 1],
    ])
  })
})

describe('estorno e chargeback', () => {
  it('inativa a matrícula que só a venda sustentava', async () => {
    const { db, chega, real, turmaId, matriculaDe } = await cenario()
    await ligarProduto(db, agora, { produtoId: '9101', turmaId })
    await chega(real())
    const { resultado } = await chega(real('sale-refunded'))
    expect(resultado).toMatchObject({
      situacao: 'aplicada',
      motivo: '1 matrícula(s) inativada(s)',
    })
    expect((await matriculaDe('ana.souza@exemplo.test'))?.situacao).toBe(
      'inativa',
    )
  })

  it('o chargeback tem o mesmo efeito', async () => {
    const { db, chega, real, turmaId, matriculaDe } = await cenario()
    await ligarProduto(db, agora, { produtoId: '9101', turmaId })
    await chega(real())
    await chega(real('sale-chargedback'))
    expect((await matriculaDe('ana.souza@exemplo.test'))?.situacao).toBe(
      'inativa',
    )
  })

  it('mantém a matrícula que outra origem sustenta e avisa a equipe no motivo', async () => {
    const { db, chega, real, turmaId, matriculaDe } = await cenario()
    await ligarProduto(db, agora, { produtoId: '9101', turmaId })
    await matricularManual(db, agora, {
      pessoas: [{ email: 'ana.souza@exemplo.test' }],
      turmaId,
      autorId: 'eq',
    })
    await chega(real())
    const { resultado } = await chega(real('sale-refunded'))
    expect(resultado?.motivo).toMatch(/1 mantida/)
    expect((await matriculaDe('ana.souza@exemplo.test'))?.situacao).toBe(
      'ativa',
    )
  })

  it('estorno que chega durante a aplicação da venda paga não deixa o aluno com acesso', async () => {
    const { db, real, turmaId, matriculaDe } = await cenario()
    await ligarProduto(db, agora, { produtoId: '9101', turmaId })
    const pago = await gravarAviso(db, agora, real())
    // O estorno chega e é processado quando a origem ainda não existe: fica "ignorada".
    const aoLiberarCursos = async () => {
      const estorno = await gravarAviso(db, agora, real('sale-refunded'))
      const r = await processarAviso(db, agora, estorno.id)
      expect(r.situacao).toBe('ignorada')
    }
    await processarAviso(db, agora, pago.id, { aoLiberarCursos })
    expect((await matriculaDe('ana.souza@exemplo.test'))?.situacao).toBe(
      'inativa',
    )
  })

  it('estorno de venda sem matrícula fica "ignorada"', async () => {
    const { chega } = await cenario()
    const { resultado } = await chega(corpoDaFixture('sale-refunded'))
    expect(resultado).toMatchObject({
      situacao: 'ignorada',
      motivo: 'Nenhuma matrícula era sustentada por esta venda.',
    })
  })

  it('reprocessar o estorno depois de aplicado não muda nada', async () => {
    const { db, chega, real, turmaId } = await cenario()
    await ligarProduto(db, agora, { produtoId: '9101', turmaId })
    await chega(real())
    const { gravado } = await chega(real('sale-refunded'))
    const r = await processarAviso(db, agora, gravado.id)
    expect(r.situacao).toBe('ignorada')
    expect((await db.select().from(matricula))[0].situacao).toBe('inativa')
  })
})

describe('os demais gatilhos só ficam gravados', () => {
  it('saleWaitingPayment (boleto), assinatura e carrinho não mexem em nada', async () => {
    const { db, chega, turmaId } = await cenario()
    await ligarProduto(db, agora, { produtoId: '9101', turmaId })
    for (const corpo of [
      corpoDaFixture('sale-waiting-payment-boleto'),
      corpoDaFixture('contract-paid'),
      JSON.stringify({
        type: 'checkout',
        trigger: 'checkoutAbandoned',
        client: { email: 'z@x.test' },
      }),
    ]) {
      const { resultado } = await chega(corpo)
      expect(resultado?.situacao).toBe('ignorada')
    }
    expect(await db.select().from(matricula)).toHaveLength(0)
    expect(
      await db
        .select()
        .from(user)
        .where(eq(user.email, 'bia.lima@exemplo.test')),
    ).toHaveLength(0)
    expect(await db.select().from(avisoDeVenda)).toHaveLength(3)
  })

  it('lista os avisos do mais novo ao mais velho, filtrando por situação', async () => {
    const { db, chega } = await cenario()
    await chega(corpoDaFixture('contract-paid'))
    await chega(corpoDaFixture('sale-paid-real'))
    expect(
      (await listarAvisos(db)).itens.map((a) => a.situacao).sort(),
    ).toEqual(['ignorada', 'sem_turma'])
    const filtrados = (await listarAvisos(db, { situacao: 'sem_turma' })).itens
    expect(filtrados).toHaveLength(1)
    expect(filtrados[0]).toMatchObject({
      alunoEmail: 'ana.souza@exemplo.test',
      alunoNome: 'Ana Souza',
      produtoId: '9101',
      ofertaHash: 'abc123',
      gatilho: 'salePaid',
    })
  })
})

describe('lista de avisos paginada', () => {
  it('traz 20 por página, do mais novo ao mais velho, com o total do filtro', async () => {
    const db = await criarBancoDeTeste()
    // O D1 aceita 100 parâmetros por comando: os 45 avisos entram em lotes.
    const avisos = Array.from({ length: 45 }, (_, i) => ({
      id: `v${i}`,
      chave: `c${i}`,
      tipo: 'sale',
      gatilho: 'salePaid',
      corpo: '{}',
      situacao: i % 3 === 0 ? ('sem_turma' as const) : ('ignorada' as const),
      recebidoEm: new Date(Date.UTC(2026, 5, 1, 12, i)),
    }))
    for (let i = 0; i < avisos.length; i += 5) {
      await db.insert(avisoDeVenda).values(avisos.slice(i, i + 5))
    }
    const primeira = await listarAvisos(db)
    expect(primeira.itens).toHaveLength(20)
    expect(primeira).toMatchObject({ total: 45, totalDePaginas: 3 })
    expect(primeira.itens[0].id).toBe('v44')
    const terceira = await listarAvisos(db, { pagina: 3 })
    expect(terceira.itens.map((a) => a.id)).toEqual([
      'v4',
      'v3',
      'v2',
      'v1',
      'v0',
    ])
    const semTurma = await listarAvisos(db, {
      situacao: 'sem_turma',
      pagina: 2,
    })
    expect(semTurma.total).toBe(15)
    expect(semTurma.itens).toHaveLength(0)
  })
})

describe('alerta ao técnico quando o aviso fica com erro (história 122)', () => {
  const semVenda = () =>
    corpoDaFixture('sale-paid-real', (a) => {
      a.sale.id = null
    })

  it('o aviso que não dá para aplicar dispara o alerta, uma vez só por aviso', async () => {
    const { db } = await cenario()
    const aoComErro = vi.fn(async () => undefined)
    const g = await gravarAviso(db, agora, semVenda())
    await processarAviso(db, agora, g.id, { aoComErro })
    expect(aoComErro).toHaveBeenCalledTimes(1)
    expect(aoComErro).toHaveBeenCalledWith(
      expect.objectContaining({
        id: g.id,
        motivo: 'O aviso não traz o id da venda.',
      }),
    )
    // Reprocessar o mesmo aviso (a equipe clica em "Reprocessar") não alerta de novo.
    await processarAviso(db, agora, g.id, { aoComErro })
    expect(aoComErro).toHaveBeenCalledTimes(1)
    // Outro aviso com erro alerta de novo.
    const outro = await gravarAviso(
      db,
      agora,
      corpoDaFixture('sale-paid-real', (a) => {
        a.sale.id = null
        a.client.email = 'outra@exemplo.test'
      }),
    )
    await processarAviso(db, agora, outro.id, { aoComErro })
    expect(aoComErro).toHaveBeenCalledTimes(2)
  })

  it('a falha inesperada (banco fora do ar) alerta e continua subindo para a fila', async () => {
    const { db, real, turmaId } = await cenario()
    await ligarProduto(db, agora, { produtoId: '9101', turmaId })
    const aoComErro = vi.fn(async () => undefined)
    const g = await gravarAviso(db, agora, real())
    vi.spyOn(db, 'batch').mockRejectedValueOnce(new Error('D1 fora do ar'))
    await expect(
      processarAviso(db, agora, g.id, { aoComErro }),
    ).rejects.toThrow('D1')
    expect(aoComErro).toHaveBeenCalledWith(
      expect.objectContaining({ id: g.id, motivo: 'D1 fora do ar' }),
    )
  })

  it('aviso aplicado, ignorado ou sem turma não alerta', async () => {
    const { db, real } = await cenario()
    const aoComErro = vi.fn(async () => undefined)
    const g = await gravarAviso(db, agora, real())
    await processarAviso(db, agora, g.id, { aoComErro })
    expect(aoComErro).not.toHaveBeenCalled()
  })

  it('o alerta que falha não derruba o processamento', async () => {
    const { db } = await cenario()
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const g = await gravarAviso(db, agora, semVenda())
    const r = await processarAviso(db, agora, g.id, {
      aoComErro: async () => {
        throw new Error('e-mail fora do ar')
      },
    })
    expect(r.situacao).toBe('com_erro')
  })
})

describe('vários gateways', () => {
  it('a ligação de um não vale para o outro, e o vendaId de origem leva o gateway', async () => {
    const { db, turmaId } = await cenario()
    await ligarProduto(db, agora, {
      gateway: 'hotmart',
      produtoId: '9101',
      turmaId,
    })
    expect(await turmasDaVenda(db, '9101', null)).toEqual([])
    expect(await turmasDaVenda(db, '9101', null, 'hotmart')).toHaveLength(1)
    expect(await listarLigacoes(db)).toHaveLength(0)
    expect(await listarLigacoes(db, 'hotmart')).toHaveLength(1)
    expect(vendaIdDeOrigem('hotmart', 'HP123')).toBe('hotmart:HP123')
    expect(vendaIdDeOrigem('voomp', 'HP123')).not.toBe(
      vendaIdDeOrigem('hotmart', 'HP123'),
    )
  })
})

describe('atualizar ligação', () => {
  const dela = async (db: Awaited<ReturnType<typeof cenario>>['db']) =>
    (await listarLigacoes(db, 'hotmart'))[0]

  it('troca turma e prazo sem remover, e prazo vazio volta ao da turma', async () => {
    const { db, turmaId, outraId } = await cenario()
    await ligarProduto(db, agora, {
      gateway: 'hotmart',
      produtoId: '9101',
      turmaId,
      prazoEmDias: 90,
    })
    const antes = await dela(db)
    await atualizarLigacao(db, antes.id, { turmaId: outraId, prazoEmDias: 30 })
    expect(await dela(db)).toMatchObject({
      id: antes.id,
      turmaId: outraId,
      prazoEmDias: 30,
    })
    await atualizarLigacao(db, antes.id, {
      turmaId: outraId,
      prazoEmDias: null,
    })
    expect((await dela(db)).prazoEmDias).toBeNull()
    expect(await listarLigacoes(db, 'hotmart')).toHaveLength(1)
  })

  it('recusa a troca que colide com outra ligação (mesmo gateway, produto, oferta e turma) e não grava', async () => {
    const { db, turmaId, outraId } = await cenario()
    for (const t of [turmaId, outraId]) {
      await ligarProduto(db, agora, {
        gateway: 'hotmart',
        produtoId: '9101',
        turmaId: t,
        prazoEmDias: t === turmaId ? 10 : 20,
      })
    }
    const ligacoes = await listarLigacoes(db, 'hotmart')
    const daTurma1 = ligacoes.find((l) => l.turmaId === turmaId)
    expect(daTurma1).toBeDefined()
    await expect(
      atualizarLigacao(db, daTurma1?.id ?? '', {
        turmaId: outraId,
        prazoEmDias: 99,
      }),
    ).rejects.toThrow('Já existe uma ligação deste produto e oferta')
    const depois = await listarLigacoes(db, 'hotmart')
    expect(depois.find((l) => l.id === daTurma1?.id)).toMatchObject({
      turmaId,
      prazoEmDias: 10,
    })
  })

  it('manter a mesma turma só trocando o prazo não conta como colisão; outro gateway não colide', async () => {
    const { db, turmaId } = await cenario()
    await ligarProduto(db, agora, {
      gateway: 'hotmart',
      produtoId: '9101',
      turmaId,
    })
    await ligarProduto(db, agora, { produtoId: '9101', turmaId })
    const a = await dela(db)
    await atualizarLigacao(db, a.id, { turmaId, prazoEmDias: 45 })
    expect((await dela(db)).prazoEmDias).toBe(45)
  })

  it('valida prazo, turma e existência da ligação', async () => {
    const { db, turmaId } = await cenario()
    await ligarProduto(db, agora, { produtoId: '9101', turmaId })
    const [l] = await listarLigacoes(db)
    await expect(
      atualizarLigacao(db, l.id, { turmaId, prazoEmDias: 0 }),
    ).rejects.toThrow('O prazo de acesso é um número de dias')
    await expect(
      atualizarLigacao(db, l.id, { turmaId: 'nao-existe' }),
    ).rejects.toThrow('Turma não encontrada.')
    await expect(atualizarLigacao(db, 'nada', { turmaId })).rejects.toThrow(
      'Ligação não encontrada.',
    )
  })
})
