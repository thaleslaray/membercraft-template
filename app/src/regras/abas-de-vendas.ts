// Abas da tela Vendas do painel: cada uma tem seu endereço e aparece só para quem pode usá-la.
import { type Perfil, podeFazer } from '#/regras/permissoes'

export type AbaDeVendas = {
  rotulo: string
  para:
    | '/painel/vendas'
    | '/painel/vendas/produtos'
    | '/painel/vendas/plataformas'
}

export function abasDeVendas(perfil: Perfil): AbaDeVendas[] {
  const abas: AbaDeVendas[] = [{ rotulo: 'Vendas', para: '/painel/vendas' }]
  if (
    podeFazer(perfil, 'ligar-produto-da-hotmart') ||
    podeFazer(perfil, 'ligar-produto-da-voomp')
  ) {
    abas.push({ rotulo: 'Produtos', para: '/painel/vendas/produtos' })
  }
  if (podeFazer(perfil, 'gerir-credenciais-da-hotmart')) {
    abas.push({ rotulo: 'Plataformas', para: '/painel/vendas/plataformas' })
  }
  return abas
}
