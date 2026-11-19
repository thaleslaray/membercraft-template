import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { avisoDeVenda, matricula, origemDaMatricula, user } from '#/db/schema'
import { criarCurso } from '#/regras/conteudo'
import { criarTurma } from '#/regras/matricula'
import {
  gravarAviso,
  ligarProduto,
  listarAvisos,
  processarAviso,
  turmasDaVenda,
} from '#/regras/vendas'
import { criarBancoDeTeste } from '#/test/banco'
import {
  corpoDaFixtureHotmart,
  type NomeDeFixtureHotmart,
} from '#/test/fixtures/hotmart'
import { corpoDaFixture } from '#/test/fixtures/voomp'

const T0 = new Date('2026-11-13T12:00:00Z')
const agora = () => T0
const PRODUTO = '9000001'

async function cenario() {
  const db = await criarBancoDeTeste()
  const cursoId = await criarCurso(db, { nome: 'Curso H' })
  const turmaId = await criarTurma(db, {
    cursoId,
    nome: 'Turma H',
    prazoEmDias: 365,
  })
  const chega = async (corpo: string) => {
    const gravado = await gravarAviso(db, agora, corpo, 'hotmart')
    const resultado = gravado.enfileirar
      ? await processarAviso(db, agora, gravado.id)
      : null
    return { gravado, resultado }
  }
  const aprovada = (
    nome: NomeDeFixtureHotmart = 'purchase-approved',
    // biome-ignore lint/suspicious/noExplicitAny: ajuste livre do aviso
    ajustes?: (a: Record<string, any>) => void,
  ) => corpoDaFixtureHotmart(nome, ajustes)
  return { db, turmaId, chega, aprovada }
}

describe('gravarAviso da Hotmart', () => {
  it('grava com gateway hotmart, chave = id do evento e os campos da tela', async () => {
    const { db, aprovada } = await cenario()
    const g = await gravarAviso(db, agora, aprovada(), 'hotmart')
    expect(g).toMatchObject({
      invalido: false,
      repetido: false,
      enfileirar: true,
    })
    const [l] = await db.select().from(avisoDeVenda)
    expect(l).toMatchObject({
      gateway: 'hotmart',
      chave: 'a51689a6-8e24-4b9a-b8b6-9214cb0ec15e',
      gatilho: 'PURCHASE_APPROVED',
      vendaId: 'HP0000000001',
      produtoId: PRODUTO,
      ofertaHash: 'abcd1234',
      email: 'aluna1@exemplo.test',
      situacao: 'recebida',
    })
  })

  it('aviso repetido (mesmo id) não cria linha nova e conta a repetição', async () => {
    const { db, aprovada } = await cenario()
    await gravarAviso(db, agora, aprovada(), 'hotmart')
    const g = await gravarAviso(db, agora, aprovada(), 'hotmart')
    expect(g.repetido).toBe(true)
    const linhas = await db.select().from(avisoDeVenda)
    expect(linhas).toHaveLength(1)
    expect(linhas[0].repeticoes).toBe(1)
  })

  it('webhook que chega depois da conferência da mesma transação e gatilho é repetido, sem linha nova nem fila', async () => {
    const { db, aprovada } = await cenario()
    const conferencia = JSON.stringify({
      id: 'conferencia:HP0000000001:PURCHASE_APPROVED',
      event: 'PURCHASE_APPROVED',
      creation_date: 1,
      data: {
        product: { id: Number(PRODUTO) },
        buyer: { email: 'aluna1@exemplo.test' },
        purchase: { transaction: 'HP0000000001' },
      },
    })
    const c = await gravarAviso(db, agora, conferencia, 'hotmart')
    const real = await gravarAviso(db, agora, aprovada(), 'hotmart')
    // A conferência já cuida do processamento: o webhook não enfileira de novo.
    expect(real).toMatchObject({ id: c.id, repetido: true, enfileirar: false })
    await processarAviso(db, agora, c.id)
    const de_novo = await gravarAviso(db, agora, aprovada(), 'hotmart')
    expect(de_novo).toMatchObject({
      id: c.id,
      repetido: true,
      enfileirar: false,
    })
    const linhas = await db.select().from(avisoDeVenda)
    expect(linhas).toHaveLength(1)
    expect(linhas[0].repeticoes).toBe(2)
  })

  it('webhook de outro gatilho da mesma transação não é repetido da conferência', async () => {
    const { db } = await cenario()
    const conferencia = JSON.stringify({
      id: 'conferencia:HP0000000001:PURCHASE_REFUNDED',
      event: 'PURCHASE_REFUNDED',
      creation_date: 1,
      data: {
        product: { id: Number(PRODUTO) },
        purchase: { transaction: 'HP0000000001' },
      },
    })
    await gravarAviso(db, agora, conferencia, 'hotmart')
    const g = await gravarAviso(
      db,
      agora,
      corpoDaFixtureHotmart('purchase-approved'),
      'hotmart',
    )
    expect(g).toMatchObject({ repetido: false, enfileirar: true })
    expect(await db.select().from(avisoDeVenda)).toHaveLength(2)
  })

  it('o mesmo id em outro gateway é outro aviso', async () => {
    const { db, aprovada } = await cenario()
    await gravarAviso(db, agora, aprovada(), 'hotmart')
    await gravarAviso(db, agora, corpoDaFixture('sale-paid-real'))
    expect(await db.select().from(avisoDeVenda)).toHaveLength(2)
  })

  it('corpo inválido fica "com erro", sem fila', async () => {
    const { db } = await cenario()
    const g = await gravarAviso(db, agora, '{"event":"X"}', 'hotmart')
    expect(g).toMatchObject({ invalido: true, enfileirar: false })
    const [l] = await db.select().from(avisoDeVenda)
    expect(l).toMatchObject({ gateway: 'hotmart', situacao: 'com_erro' })
  })
})

describe('PURCHASE_APPROVED', () => {
  it('produto ligado: cria a aluna e a matrícula, com origem hotmart:<transação>', async () => {
    const { db, turmaId, chega, aprovada } = await cenario()
    await ligarProduto(db, agora, {
      gateway: 'hotmart',
      produtoId: PRODUTO,
      turmaId,
    })
    const { resultado } = await chega(aprovada())
    expect(resultado).toMatchObject({ situacao: 'aplicada' })
    const [conta] = await db
      .select()
      .from(user)
      .where(eq(user.email, 'aluna1@exemplo.test'))
    expect(conta.name).toBe('Aluna Exemplo 1')
    const [m] = await db.select().from(matricula)
    expect(m.turmaId).toBe(turmaId)
    expect((await db.select().from(origemDaMatricula))[0].vendaId).toBe(
      'hotmart:HP0000000001',
    )
  })

  it('reprocessar ou repetir o aviso não tem efeito duplo', async () => {
    const { db, turmaId, chega, aprovada } = await cenario()
    await ligarProduto(db, agora, {
      gateway: 'hotmart',
      produtoId: PRODUTO,
      turmaId,
    })
    const { gravado } = await chega(aprovada())
    await processarAviso(db, agora, gravado.id)
    const repetido = await chega(aprovada())
    expect(repetido.gravado.repetido).toBe(true)
    expect(repetido.resultado).toBeNull()
    expect(await db.select().from(matricula)).toHaveLength(1)
    expect(await db.select().from(origemDaMatricula)).toHaveLength(1)
  })

  it('a oferta ligada soma com a do produto; outra oferta cai só na do produto', async () => {
    const { db, turmaId, chega, aprovada } = await cenario()
    const outra = await criarTurma(db, {
      cursoId: await criarCurso(db, { nome: 'Curso Oferta' }),
      nome: 'Turma Oferta',
    })
    await ligarProduto(db, agora, {
      gateway: 'hotmart',
      produtoId: PRODUTO,
      turmaId,
    })
    await ligarProduto(db, agora, {
      gateway: 'hotmart',
      produtoId: PRODUTO,
      ofertaHash: 'abcd1234',
      turmaId: outra,
    })
    await chega(aprovada())
    expect(
      (await db.select().from(matricula)).map((m) => m.turmaId).sort(),
    ).toEqual([outra, turmaId].sort())
    expect(await turmasDaVenda(db, PRODUTO, 'zzz', 'hotmart')).toHaveLength(1)
  })

  it('produto sem ligação fica sem_turma e vira matrícula quando é ligado', async () => {
    const { db, turmaId, chega, aprovada } = await cenario()
    const { resultado } = await chega(aprovada())
    expect(resultado).toMatchObject({ situacao: 'sem_turma' })
    expect(await db.select().from(user)).toHaveLength(0)
    const r = await ligarProduto(db, agora, {
      gateway: 'hotmart',
      produtoId: PRODUTO,
      turmaId,
    })
    expect(r.aplicadas).toBe(1)
    const [l] = await db.select().from(avisoDeVenda)
    expect(l.situacao).toBe('aplicada')
    expect(await db.select().from(matricula)).toHaveLength(1)
  })

  it('ligar o produto na Voomp não libera venda da Hotmart que espera', async () => {
    const { db, turmaId, chega, aprovada } = await cenario()
    await chega(aprovada())
    await ligarProduto(db, agora, { produtoId: PRODUTO, turmaId })
    const [l] = await db.select().from(avisoDeVenda)
    expect(l.situacao).toBe('sem_turma')
  })

  it('sem e-mail do comprador: com erro, sem subir', async () => {
    const { db, turmaId, chega, aprovada } = await cenario()
    await ligarProduto(db, agora, {
      gateway: 'hotmart',
      produtoId: PRODUTO,
      turmaId,
    })
    const { resultado } = await chega(
      aprovada('purchase-approved', (a) => {
        delete a.data.buyer
      }),
    )
    expect(resultado).toMatchObject({
      situacao: 'com_erro',
      motivo: 'O aviso não traz o e-mail do aluno.',
    })
  })

  it('compra com subscription: grava com motivo visível e não matricula', async () => {
    const { db, turmaId, chega } = await cenario()
    await ligarProduto(db, agora, {
      gateway: 'hotmart',
      produtoId: '4713431',
      turmaId,
    })
    const { resultado } = await chega(
      corpoDaFixtureHotmart('purchase-approved-assinatura'),
    )
    expect(resultado?.situacao).toBe('ignorada')
    expect(resultado?.motivo).toContain('assinatura')
    expect(await db.select().from(matricula)).toHaveLength(0)
  })

  it('subscription sem plano e recorrência 1 (assinante inativo): pagamento único, matricula', async () => {
    const { db, turmaId, chega, aprovada } = await cenario()
    await ligarProduto(db, agora, {
      gateway: 'hotmart',
      produtoId: PRODUTO,
      turmaId,
    })
    const { resultado } = await chega(
      aprovada('purchase-approved', (a) => {
        a.data.subscription = {
          subscriber: { code: 'X' },
          status: 'INACTIVE',
        }
      }),
    )
    expect(resultado?.situacao).toBe('aplicada')
    expect(await db.select().from(matricula)).toHaveLength(1)
  })

  it('subscription com plan.id: assinatura, não matricula', async () => {
    const { db, turmaId, chega, aprovada } = await cenario()
    await ligarProduto(db, agora, {
      gateway: 'hotmart',
      produtoId: PRODUTO,
      turmaId,
    })
    const { resultado } = await chega(
      aprovada('purchase-approved', (a) => {
        a.data.subscription = {
          subscriber: { code: 'X' },
          plan: { id: 99, name: 'Plano' },
        }
      }),
    )
    expect(resultado?.situacao).toBe('ignorada')
    expect(await db.select().from(matricula)).toHaveLength(0)
  })
})

describe('os demais eventos só gravam', () => {
  it.each([
    'purchase-protest',
    'purchase-complete',
    'purchase-billet-printed',
    'purchase-delayed',
    'purchase-expired',
    'purchase-canceled',
    'club-first-access',
  ] as const)('%s: ignorada, sem conta nem matrícula', async (nome) => {
    const { db, turmaId, chega } = await cenario()
    await ligarProduto(db, agora, {
      gateway: 'hotmart',
      produtoId: PRODUTO,
      turmaId,
    })
    const { resultado } = await chega(
      corpoDaFixtureHotmart(nome, (a) => {
        if (a.data.product) a.data.product.id = Number(PRODUTO)
      }),
    )
    expect(resultado?.situacao).toBe('ignorada')
    expect(resultado?.motivo).toContain('Só gravado')
    expect(await db.select().from(matricula)).toHaveLength(0)
    expect(await db.select().from(user)).toHaveLength(0)
  })
})

describe('lista de avisos das duas plataformas', () => {
  async function comOsDois() {
    const c = await cenario()
    // a Voomp entra pelo padrão; a Hotmart pelo gateway explícito
    await gravarAviso(c.db, agora, corpoDaFixture('sale-paid-real'))
    await c.chega(c.aprovada())
    return c
  }

  it('cada linha traz o gateway e o filtro separa por plataforma', async () => {
    const { db } = await comOsDois()
    const todos = (await listarAvisos(db)).itens
    expect(todos.map((a) => a.gateway).sort()).toEqual(['hotmart', 'voomp'])
    const hotmart = await listarAvisos(db, { gateway: 'hotmart' })
    expect(hotmart.itens.map((a) => a.gateway)).toEqual(['hotmart'])
    expect(hotmart.total).toBe(1)
    const voomp = await listarAvisos(db, { gateway: 'voomp' })
    expect(voomp.itens.map((a) => a.gateway)).toEqual(['voomp'])
  })

  it('reprocessar o aviso da Hotmart usa o caminho da Hotmart', async () => {
    const { db, turmaId, chega, aprovada } = await cenario()
    const { gravado } = await chega(aprovada())
    await ligarProduto(db, agora, {
      gateway: 'hotmart',
      produtoId: PRODUTO,
      turmaId,
    })
    const r = await processarAviso(db, agora, gravado.id)
    expect(r.situacao).toBe('aplicada')
  })
})

describe('reembolso e chargeback', () => {
  const T = 1_800_000_000_000
  // Ajusta transação, produto, aluna e a creation_date do evento.
  const com =
    (
      id: string,
      criadoEm: number,
      transacao = 'HP-T1',
      email = 'ana@exemplo.test',
    ) =>
    // biome-ignore lint/suspicious/noExplicitAny: ajuste livre do aviso
    (a: Record<string, any>) => {
      a.id = id
      a.creation_date = criadoEm
      a.data.product.id = Number(PRODUTO)
      a.data.buyer.email = email
      a.data.purchase.transaction = transacao
    }
  async function ligado() {
    const c = await cenario()
    await ligarProduto(c.db, agora, {
      gateway: 'hotmart',
      produtoId: PRODUTO,
      turmaId: c.turmaId,
    })
    return c
  }
  const situacoes = async (db: Awaited<ReturnType<typeof cenario>>['db']) =>
    (await db.select().from(matricula)).map((m) => m.situacao)

  it.each(['purchase-refunded', 'purchase-chargeback'] as const)(
    '%s tira a origem e inativa a matrícula',
    async (nome) => {
      const { db, chega } = await ligado()
      await chega(corpoDaFixtureHotmart('purchase-approved', com('a1', T)))
      expect(await situacoes(db)).toEqual(['ativa'])
      const { resultado } = await chega(
        corpoDaFixtureHotmart(nome, com('r1', T + 1000)),
      )
      expect(resultado?.situacao).toBe('aplicada')
      expect(resultado?.motivo).toContain('inativada')
      expect(await situacoes(db)).toEqual(['inativa'])
      expect(await db.select().from(origemDaMatricula)).toHaveLength(0)
    },
  )

  it('só tira o que a compra sustentava: outra compra mantém a matrícula', async () => {
    const { db, chega } = await ligado()
    await chega(
      corpoDaFixtureHotmart('purchase-approved', com('a1', T, 'HP-A')),
    )
    await chega(
      corpoDaFixtureHotmart('purchase-approved', com('a2', T + 1, 'HP-B')),
    )
    const { resultado } = await chega(
      corpoDaFixtureHotmart('purchase-refunded', com('r1', T + 1000, 'HP-A')),
    )
    expect(resultado?.motivo).toContain('mantida')
    expect(await situacoes(db)).toEqual(['ativa'])
    expect(await db.select().from(origemDaMatricula)).toHaveLength(1)
  })

  it('reembolso chegando antes da aprovação: a aprovação depois não matricula', async () => {
    const { db, chega } = await ligado()
    await chega(corpoDaFixtureHotmart('purchase-refunded', com('r1', T + 1000)))
    const { resultado } = await chega(
      corpoDaFixtureHotmart('purchase-approved', com('a1', T)),
    )
    expect(resultado?.situacao).toBe('ignorada')
    expect(resultado?.motivo).toContain('estornada')
    expect(await db.select().from(matricula)).toHaveLength(0)
  })

  it('aprovação antiga reprocessada não reativa compra já estornada', async () => {
    const { db, chega } = await ligado()
    const g = await gravarAviso(
      db,
      agora,
      corpoDaFixtureHotmart('purchase-approved', com('a1', T)),
      'hotmart',
    )
    await processarAviso(db, agora, g.id)
    await chega(corpoDaFixtureHotmart('purchase-refunded', com('r1', T + 1000)))
    expect(await situacoes(db)).toEqual(['inativa'])
    const de = await processarAviso(db, agora, g.id)
    expect(de.situacao).toBe('ignorada')
    expect(await situacoes(db)).toEqual(['inativa'])
  })

  it('reembolso antigo que chega depois de aprovação mais nova não tira o acesso', async () => {
    const { db, chega } = await ligado()
    await chega(corpoDaFixtureHotmart('purchase-approved', com('a1', T + 5000)))
    const { resultado } = await chega(
      corpoDaFixtureHotmart('purchase-refunded', com('r1', T)),
    )
    expect(resultado?.situacao).toBe('ignorada')
    expect(await situacoes(db)).toEqual(['ativa'])
  })

  it('order bump é compra própria: reembolsar a pai não tira o bump', async () => {
    const { db, chega } = await ligado()
    await chega(
      corpoDaFixtureHotmart('purchase-approved', com('a1', T, 'HP-PAI')),
    )
    // O bump é outro produto/turma? Aqui, mesma turma: a origem do bump é própria.
    await chega(
      corpoDaFixtureHotmart('purchase-approved', (a) => {
        com('a2', T + 1, 'HP-BUMP')(a)
        a.data.purchase.order_bump = {
          is_order_bump: true,
          parent_purchase_transaction: 'HP-PAI',
        }
      }),
    )
    expect(await db.select().from(origemDaMatricula)).toHaveLength(2)
    await chega(
      corpoDaFixtureHotmart('purchase-refunded', com('r1', T + 1000, 'HP-PAI')),
    )
    expect(await situacoes(db)).toEqual(['ativa'])
    const [origem] = await db.select().from(origemDaMatricula)
    expect(origem.vendaId).toBe('hotmart:HP-BUMP')
  })

  it('reembolso sem compra conhecida: ignorada, sem matrícula', async () => {
    const { db, chega } = await ligado()
    const { resultado } = await chega(
      corpoDaFixtureHotmart('purchase-refunded', com('r1', T)),
    )
    expect(resultado?.situacao).toBe('ignorada')
    expect(await db.select().from(matricula)).toHaveLength(0)
  })

  it('reembolso de assinatura só grava', async () => {
    const { db, chega } = await ligado()
    const { resultado } = await chega(
      corpoDaFixtureHotmart('purchase-refunded', (a) => {
        com('r1', T)(a)
        a.data.subscription = { plan: { id: 7 }, status: 'ACTIVE' }
      }),
    )
    expect(resultado?.motivo).toContain('assinatura')
    expect(await db.select().from(matricula)).toHaveLength(0)
  })

  it('evento desconhecido (assinatura, carrinho) responde só gravando', async () => {
    const { chega } = await ligado()
    for (const n of [
      'subscription-cancellation',
      'purchase-out-of-shopping-cart',
    ] as const) {
      const { resultado } = await chega(corpoDaFixtureHotmart(n))
      expect(resultado?.situacao).toBe('ignorada')
    }
  })
})
