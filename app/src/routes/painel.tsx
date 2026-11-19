import {
  createFileRoute,
  type ErrorComponentProps,
  Outlet,
  redirect,
  useMatch,
} from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { CascaPainel } from '#/components/painel/casca-painel'
import {
  CarregandoDoPainel,
  ErroDoPainel,
  NaoEncontradoDoPainel,
} from '#/components/painel/estados'
import { filasQuery } from '#/lib/filas-queries'
import { exigirAcesso } from '#/lib/guardas'
import { podeFazer, tratarPerfil } from '#/regras/permissoes'

// Painel da Equipe: exige sessão e a permissão de usar o Estúdio. Aluno volta ao início.
// Carregando, erro e não encontrado (P8) aparecem dentro da casca, com o menu à vista. Cada rota
// filha também ganha os mesmos estados (`aplicarEstadosDoPainel`, em router.tsx).
export const Route = createFileRoute('/painel')({
  beforeLoad: async ({ context, location }) => {
    const session = await exigirAcesso(context, location)
    if (!podeFazer(tratarPerfil(session.user.perfil), 'usar-estudio')) {
      throw redirect({ to: '/' })
    }
    await context.queryClient.ensureQueryData(filasQuery)
    return { session }
  },
  component: PainelDaEquipe,
  pendingComponent: () => (
    <NaCasca>
      <CarregandoDoPainel />
    </NaCasca>
  ),
  errorComponent: (props: ErrorComponentProps) => (
    <NaCasca>
      <ErroDoPainel {...props} />
    </NaCasca>
  ),
  notFoundComponent: () => (
    <NaCasca>
      <NaoEncontradoDoPainel />
    </NaCasca>
  ),
})

function PainelDaEquipe() {
  const { session } = Route.useRouteContext()
  return (
    <CascaPainel perfil={tratarPerfil(session.user.perfil)}>
      <Outlet />
    </CascaPainel>
  )
}

// Os estados do próprio painel trocam o componente da rota: a casca vem junto quando a sessão já
// é conhecida (se a falha foi antes dela, o estado aparece sozinho).
function NaCasca({ children }: { children: ReactNode }) {
  const perfil = useMatch({
    from: '/painel',
    shouldThrow: false,
    select: (m) => m.context?.session?.user.perfil,
  })
  if (perfil === undefined) return <>{children}</>
  return <CascaPainel perfil={tratarPerfil(perfil)}>{children}</CascaPainel>
}
