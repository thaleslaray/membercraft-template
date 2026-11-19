import { createFileRoute, redirect } from '@tanstack/react-router'

// Endereço antigo: a tela virou a aba Produtos de Vendas.
export const Route = createFileRoute('/painel/hotmart-ligacoes')({
  beforeLoad: () => {
    throw redirect({ to: '/painel/vendas/produtos', replace: true })
  },
})
