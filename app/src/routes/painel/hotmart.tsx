import { createFileRoute, redirect } from '@tanstack/react-router'

// Endereço antigo: a tela virou a aba Plataformas de Vendas.
export const Route = createFileRoute('/painel/hotmart')({
  beforeLoad: () => {
    throw redirect({ to: '/painel/vendas/plataformas', replace: true })
  },
})
