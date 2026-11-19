import { describe, expect, it } from 'vitest'
import {
  AvisoInvalido,
  efeitoDoAviso,
  hashDoCorpo,
  interpretarAviso,
  tokenConfere,
} from '#/regras/voomp'
import { corpoDaFixture } from '#/test/fixtures/voomp'

describe('interpretarAviso', () => {
  it('lê a venda paga do botão de teste: coSeller lista, id em número, e-mail em minúsculas', () => {
    const aviso = interpretarAviso(corpoDaFixture('sale-paid-botao-de-teste'))
    expect(aviso).toMatchObject({
      tipo: 'sale',
      gatilho: 'salePaid',
      vendaId: '900001',
      produtoId: '9100',
      produtoNome: 'Produto de Teste',
      ofertaHash: null,
      email: 'maria.teste@exemplo.test',
      nome: 'Maria Teste da Silva',
      coVendedores: [],
      boletoUrl: 'https://boleto.exemplo.test/900001',
    })
  })

  it('lê a venda real: coSeller objeto todo nulo, oferta preenchida e "#" no boleto', () => {
    const aviso = interpretarAviso(corpoDaFixture('sale-paid-real'))
    expect(aviso.produtoId).toBe('9101')
    expect(aviso.ofertaHash).toBe('abc123')
    expect(aviso.coVendedores).toEqual([])
    expect(aviso.boletoUrl).toBeNull()
  })

  it('aceita coSeller como lista com gente e como objeto preenchido', () => {
    const lista = interpretarAviso(
      corpoDaFixture('sale-waiting-payment-boleto'),
    )
    expect(lista.coVendedores).toEqual([
      { nome: 'Parceira', email: 'parceira@exemplo.test' },
    ])
    const objeto = interpretarAviso(
      corpoDaFixture('sale-paid-real', (a) => {
        a.coSeller = { name: 'Sócia', email: 'SOCIA@exemplo.test' }
      }),
    )
    expect(objeto.coVendedores).toEqual([
      { nome: 'Sócia', email: 'socia@exemplo.test' },
    ])
  })

  it('limita o nome do cliente a 120 caracteres', () => {
    const aviso = interpretarAviso(
      corpoDaFixture('sale-paid-real', (a) => {
        a.client.name = 'N'.repeat(500)
      }),
    )
    expect(aviso.nome).toHaveLength(120)
  })

  it('aceita id do produto em texto, e produto, cliente e venda nulos', () => {
    const texto = interpretarAviso(
      corpoDaFixture('sale-paid-real', (a) => {
        a.product.id = '9101'
      }),
    )
    expect(texto.produtoId).toBe('9101')
    const assinatura = interpretarAviso(corpoDaFixture('contract-paid'))
    expect(assinatura).toMatchObject({
      tipo: 'contract',
      gatilho: 'contractPaid',
      vendaId: null,
    })
    const vazio = interpretarAviso(
      JSON.stringify({ trigger: 'checkoutAbandoned' }),
    )
    expect(vazio).toMatchObject({
      tipo: 'checkout',
      produtoId: null,
      email: null,
    })
  })

  it('recusa o que não é um aviso: JSON quebrado, sem objeto ou sem gatilho', () => {
    for (const corpo of ['{nao-json', '[]', '"texto"', '{"type":"sale"}']) {
      expect(() => interpretarAviso(corpo)).toThrow(AvisoInvalido)
    }
  })
})

describe('efeitoDoAviso', () => {
  it('só os gatilhos de venda paga e de estorno mexem em matrícula', () => {
    const efeito = (tipo: string, gatilho: string) =>
      efeitoDoAviso({ tipo, gatilho })
    expect(efeito('sale', 'salePaid')).toBe('pago')
    expect(efeito('sale', 'saleRefunded')).toBe('estorno')
    expect(efeito('sale', 'saleChargedback')).toBe('estorno')
    for (const gatilho of [
      'saleWaitingPayment',
      'saleRefused',
      'saleUnpaid',
      'saleDueDays',
    ]) {
      expect(efeito('sale', gatilho)).toBe('so-gravar')
    }
    expect(efeito('contract', 'contractPaid')).toBe('so-gravar')
    expect(efeito('checkout', 'checkoutAbandoned')).toBe('so-gravar')
    // Mesmo com o nome de gatilho certo, o tipo precisa ser sale.
    expect(efeito('contract', 'salePaid')).toBe('so-gravar')
  })
})

describe('tokenConfere', () => {
  it('só aceita o token idêntico', () => {
    expect(tokenConfere('abc', 'abc')).toBe(true)
    expect(tokenConfere('abc', 'abcd')).toBe(false)
    expect(tokenConfere('abcd', 'abc')).toBe(false)
    expect(tokenConfere(null, 'abc')).toBe(false)
  })

  it('sem segredo configurado, recusa tudo', () => {
    expect(tokenConfere('', '')).toBe(false)
    expect(tokenConfere('abc', undefined)).toBe(false)
  })
})

describe('hashDoCorpo', () => {
  it('é o mesmo para o mesmo corpo e muda com o corpo', async () => {
    expect(await hashDoCorpo('a')).toBe(await hashDoCorpo('a'))
    expect(await hashDoCorpo('a')).not.toBe(await hashDoCorpo('b'))
    expect(await hashDoCorpo('a')).toMatch(/^[0-9a-f]{64}$/)
  })
})
