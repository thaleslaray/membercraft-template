import { createFileRoute, redirect } from '@tanstack/react-router'

// Endereço antigo: a conferência virou botão na aba Vendas (histórico na aba Plataformas).
export const Route = createFileRoute('/painel/hotmart-conferencia')({
  beforeLoad: () => {
    throw redirect({ to: '/painel/vendas', replace: true })
  },
})
