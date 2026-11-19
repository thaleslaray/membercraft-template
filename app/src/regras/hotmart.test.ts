import { describe, expect, it } from 'vitest'
import { efeitoDoAvisoHotmart, interpretarAvisoHotmart } from '#/regras/hotmart'
import { AvisoInvalido } from '#/regras/voomp'
import { corpoDaFixtureHotmart } from '#/test/fixtures/hotmart'

describe('interpretarAvisoHotmart', () => {
  it('lê a compra aprovada: id do evento, transação, produto numérico, oferta e comprador', () => {
    const a = interpretarAvisoHotmart(
      corpoDaFixtureHotmart('purchase-approved'),
    )
    expect(a).toMatchObject({
      eventoId: 'a51689a6-8e24-4b9a-b8b6-9214cb0ec15e',
      tipo: 'sale',
      gatilho: 'PURCHASE_APPROVED',
      vendaId: 'HP0000000001',
      produtoId: '9000001',
      produtoNome: 'Curso Exemplo',
      ofertaHash: 'abcd1234',
      email: 'aluna1@exemplo.test',
      nome: 'Aluna Exemplo 1',
      assinatura: false,
    })
  })

  it('e-mail em minúsculas', () => {
    const a = interpretarAvisoHotmart(
      corpoDaFixtureHotmart('purchase-approved', (x) => {
        x.data.buyer.email = 'ANA@Exemplo.Test'
      }),
    )
    expect(a.email).toBe('ana@exemplo.test')
  })

  it('tolera a falta de shipping, affiliates, offer, content e currency_conversion', () => {
    const corpo = corpoDaFixtureHotmart('purchase-approved', (x) => {
      delete x.data.shipping
      delete x.data.affiliates
      delete x.data.purchase.offer
      delete x.data.product.content
      for (const c of x.data.commissions) delete c.currency_conversion
    })
    const a = interpretarAvisoHotmart(corpo)
    expect(a.vendaId).toBe('HP0000000001')
    expect(a.ofertaHash).toBeNull()
  })

  it('tolera o payload completo da página oficial (shipping, content, conversão, order bump)', () => {
    const corpo = corpoDaFixtureHotmart('purchase-approved', (x) => {
      x.data.shipping = { cost: { value: 1, currency_value: 'BRL' } }
      x.data.affiliates = [{ affiliate_code: 'Q1', name: 'Afiliada' }]
      x.data.product.content = {
        has_physical_products: true,
        products: [
          { id: 1, ucode: 'u', name: 'n', is_physical_product: false },
        ],
      }
      x.data.commissions[1].currency_conversion = { converted_value: 1 }
      x.data.purchase.order_bump = {
        is_order_bump: true,
        parent_purchase_transaction: 'HP1',
      }
    })
    expect(interpretarAvisoHotmart(corpo).assinatura).toBe(false)
  })

  it('tolera data, buyer e purchase ausentes (eventos de carrinho, Club)', () => {
    const a = interpretarAvisoHotmart(
      corpoDaFixtureHotmart('purchase-out-of-shopping-cart'),
    )
    expect(a.vendaId).toBeNull()
    expect(a.gatilho).toBe('PURCHASE_OUT_OF_SHOPPING_CART')
    const c = interpretarAvisoHotmart(JSON.stringify({ id: 'x', event: 'Y' }))
    expect(c).toMatchObject({ vendaId: null, produtoId: null, email: null })
  })

  it('marca a compra com subscription como assinatura', () => {
    const a = interpretarAvisoHotmart(
      corpoDaFixtureHotmart('purchase-approved-assinatura'),
    )
    expect(a.assinatura).toBe(true)
  })

  it('assinatura só com plano (subscription.plan.id) ou recorrência acima de 1', () => {
    // biome-ignore lint/suspicious/noExplicitAny: o teste mexe em qualquer campo do aviso
    const com = (ajuste: (a: Record<string, any>) => void) =>
      interpretarAvisoHotmart(
        corpoDaFixtureHotmart('purchase-approved', ajuste),
      ).assinatura
    // `subscription` solto (assinante sem plano, recorrência 1): pagamento único.
    expect(
      com((a) => {
        a.data.subscription = {
          subscriber: { code: 'X' },
          status: 'INACTIVE',
        }
      }),
    ).toBe(false)
    expect(
      com((a) => {
        a.data.subscription = { plan: { id: 123, name: 'Plano' } }
      }),
    ).toBe(true)
    expect(
      com((a) => {
        a.data.purchase.recurrence_number = 2
      }),
    ).toBe(true)
    expect(
      com((a) => {
        a.data.purchase.recurrence_number = '3'
      }),
    ).toBe(true)
  })

  it('recusa o que não é aviso da Hotmart', () => {
    for (const corpo of [
      '{quebrado',
      '[]',
      '{}',
      JSON.stringify({ event: 'PURCHASE_APPROVED' }),
      JSON.stringify({ id: 'x' }),
    ]) {
      expect(() => interpretarAvisoHotmart(corpo)).toThrow(AvisoInvalido)
    }
  })
})

describe('efeitoDoAvisoHotmart', () => {
  const efeito = (n: Parameters<typeof corpoDaFixtureHotmart>[0]) =>
    efeitoDoAvisoHotmart(interpretarAvisoHotmart(corpoDaFixtureHotmart(n)))

  it('só a compra aprovada de pagamento único matricula', () => {
    expect(efeito('purchase-approved')).toBe('pago')
    expect(efeito('purchase-approved-assinatura')).toBe('so-gravar')
  })

  it('reembolso e chargeback tiram a origem; assinatura só grava', () => {
    expect(efeito('purchase-refunded')).toBe('estorno')
    expect(efeito('purchase-chargeback')).toBe('estorno')
    const assinatura = efeitoDoAvisoHotmart({
      gatilho: 'PURCHASE_REFUNDED',
      assinatura: true,
    })
    expect(assinatura).toBe('so-gravar')
  })

  it('lê a creation_date do evento (nula se ausente)', () => {
    const a = interpretarAvisoHotmart(
      corpoDaFixtureHotmart('purchase-refunded'),
    )
    expect(a.criadoEm).toBe(1746242499525)
    const b = interpretarAvisoHotmart(
      corpoDaFixtureHotmart('purchase-refunded', (x) => {
        delete x.creation_date
      }),
    )
    expect(b.criadoEm).toBeNull()
  })

  it('os demais eventos só são gravados', () => {
    for (const n of [
      'purchase-protest',
      'purchase-complete',
      'purchase-billet-printed',
      'purchase-delayed',
      'purchase-expired',
      'purchase-canceled',
      'purchase-out-of-shopping-cart',
      'club-first-access',
      'subscription-cancellation',
    ] as const) {
      expect(efeito(n)).toBe('so-gravar')
    }
  })
})
