import { describe, expect, it } from 'vitest'
import { abasDeVendas } from '#/regras/abas-de-vendas'

describe('abasDeVendas', () => {
  it('o Proprietário vê as três abas, cada uma no seu endereço', () => {
    expect(abasDeVendas('proprietario')).toEqual([
      { rotulo: 'Vendas', para: '/painel/vendas' },
      { rotulo: 'Produtos', para: '/painel/vendas/produtos' },
      { rotulo: 'Plataformas', para: '/painel/vendas/plataformas' },
    ])
  })

  it('quem não gerencia produtos nem credenciais vê só a aba Vendas', () => {
    expect(abasDeVendas('equipe')).toEqual([
      { rotulo: 'Vendas', para: '/painel/vendas' },
    ])
  })
})
