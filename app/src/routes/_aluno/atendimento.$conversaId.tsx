import { createFileRoute, redirect } from '@tanstack/react-router'

// Link antigo de uma conversa (e-mails e avisos já enviados): a aluna vê um fio só.
export const Route = createFileRoute('/_aluno/atendimento/$conversaId')({
  beforeLoad: () => {
    throw redirect({ to: '/atendimento', replace: true })
  },
})
