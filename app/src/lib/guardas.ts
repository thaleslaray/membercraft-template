import type { QueryClient } from '@tanstack/react-query'
import { redirect } from '@tanstack/react-router'

import { aparenciaQuery } from '#/lib/aparencia-queries'
import { sessionQuery } from '#/lib/auth-queries'
import { configuracaoDaAreaQuery } from '#/lib/configuracao-queries'
import { tratarPerfil } from '#/regras/permissoes'
import { pendenciasDoPrimeiroAcesso } from '#/regras/primeiro-acesso-pendencias'

// Guarda das rotas do aluno: exige sessão e, para o aluno, o primeiro acesso concluído
// (nome e aceite da versão vigente dos Termos). Devolve a sessão.
export async function exigirAcesso(
  context: { queryClient: QueryClient },
  location: { href: string },
) {
  // A versão vigente dos Termos mora no banco (o Proprietário edita). Não depende da sessão:
  // as duas leituras vão juntas, em vez de uma esperar a outra.
  const [session, configuracao] = await Promise.all([
    context.queryClient.ensureQueryData(sessionQuery),
    context.queryClient.ensureQueryData(configuracaoDaAreaQuery),
  ])
  if (!session) {
    throw redirect({ to: '/login', search: { redirect: location.href } })
  }
  const { precisaNome, precisaTermos } = pendenciasDoPrimeiroAcesso(
    {
      perfil: tratarPerfil(session.user.perfil),
      name: session.user.name,
      termosVersao: session.user.termosVersao ?? null,
    },
    configuracao.termosVersao,
  )
  if (precisaNome || precisaTermos) {
    throw redirect({
      to: '/primeiro-acesso',
      search: { redirect: location.href },
    })
  }
  return session
}

// Guarda das telas da Comunidade: com a opção desligada na aparência (Estúdio › Aparência), a aba
// sai do menu e quem chegar por link antigo volta ao Início.
export async function exigirComunidadeLigada(context: {
  queryClient: QueryClient
}) {
  const { mostrarComunidade } =
    await context.queryClient.ensureQueryData(aparenciaQuery)
  if (!mostrarComunidade) throw redirect({ to: '/' })
}
