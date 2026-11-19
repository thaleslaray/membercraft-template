import { createFileRoute, redirect } from '@tanstack/react-router'

// "Nova conversa" não existe mais: escrever no fio abre a conversa certa sozinho.
export const Route = createFileRoute('/_aluno/atendimento/nova')({
  beforeLoad: () => {
    throw redirect({ to: '/atendimento', replace: true })
  },
})
