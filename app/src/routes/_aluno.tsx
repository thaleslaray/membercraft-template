import { createFileRoute, Outlet, useMatch } from '@tanstack/react-router'
import type { CSSProperties, ReactNode } from 'react'
import { CascaAluno } from '#/components/casca/casca-aluno'
import {
  ALTURA_DA_FAIXA,
  FaixaEntrarComo,
} from '#/components/casca/faixa-entrar-como'
import { CascaLume } from '#/components/casca-lume/casca-lume'
import { ErrorPage, NotFoundPage } from '#/components/error-pages'
import { useAparencia } from '#/lib/aparencia-queries'
import { exigirAcesso } from '#/lib/guardas'
import { podeFazer, tratarPerfil } from '#/regras/permissoes'

// Layout das páginas do aluno (#93): tudo aqui dentro aparece na casca nova (barra do topo e abas do
// celular) e exige login e primeiro acesso concluído. A casca não abre mais o tour; o marcador de tour
// visto é o das boas-vindas (#101): a própria casca abre o vídeo da Helena no primeiro acesso.
// Erro e 404 de dentro da área também aparecem na casca, com o caminho de volta.
export const Route = createFileRoute('/_aluno')({
  beforeLoad: async ({ context, location }) => ({
    session: await exigirAcesso(context, location),
  }),
  component: LayoutDoAluno,
  errorComponent: ({ error }) => (
    <NaCasca>
      <ErrorPage error={error} />
    </NaCasca>
  ),
  notFoundComponent: () => (
    <NaCasca>
      <NotFoundPage />
    </NaCasca>
  ),
})

function LayoutDoAluno() {
  return (
    <NaCasca>
      <Outlet />
    </NaCasca>
  )
}

// Sem sessão no contexto (a checagem de acesso falhou), a página de erro vai sem a casca.
function NaCasca({ children }: { children: ReactNode }) {
  const contexto = useMatch({
    from: '/_aluno',
    shouldThrow: false,
    select: (m) => m.context,
  })
  const { casca } = useAparencia()
  if (!contexto?.session) return <>{children}</>
  const linkDoEstudio = podeFazer(
    tratarPerfil(contexto.session.user.perfil),
    'usar-estudio',
  )
  // O Proprietário escolhe o estilo em Estúdio › Aparência; vale para todos os alunos.
  const Casca = casca === 'lume' ? CascaLume : CascaAluno

  const impersonando = Boolean(
    (contexto.session.session as { impersonatedBy?: string | null })
      .impersonatedBy,
  )
  if (!impersonando) {
    return <Casca linkDoEstudio={linkDoEstudio}>{children}</Casca>
  }
  // "Entrar como": a faixa fica fixa no topo e as barras da casca descem a altura dela.
  return (
    <div
      style={
        {
          '--faixa-entrar-como': ALTURA_DA_FAIXA,
          paddingTop: ALTURA_DA_FAIXA,
        } as CSSProperties
      }
    >
      <FaixaEntrarComo nome={contexto.session.user.name} />
      <Casca linkDoEstudio={linkDoEstudio}>{children}</Casca>
    </div>
  )
}
