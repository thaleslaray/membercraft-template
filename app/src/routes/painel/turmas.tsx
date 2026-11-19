import { createFileRoute, redirect } from '@tanstack/react-router'

// As turmas viraram "Quem compra" na página de cada curso.
export const Route = createFileRoute('/painel/turmas')({
  beforeLoad: () => {
    throw redirect({ to: '/painel/conteudo' })
  },
})
