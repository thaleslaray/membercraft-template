import { createFileRoute, Outlet } from '@tanstack/react-router'
import { AbasDoPainel } from '#/components/painel/abas'
import { CabecalhoDaPagina, PaginaDoPainel } from '#/components/painel/pagina'
import { abasDeVendas } from '#/regras/abas-de-vendas'
import { tratarPerfil } from '#/regras/permissoes'

// Vendas num lugar só: avisos, produtos ligados e plataformas, cada aba no seu endereço.
export const Route = createFileRoute('/painel/vendas')({
  component: Vendas,
})

function Vendas() {
  const { session } = Route.useRouteContext()
  const abas = abasDeVendas(tratarPerfil(session.user.perfil))

  return (
    <PaginaDoPainel largura="larga">
      <CabecalhoDaPagina
        titulo="Vendas"
        contexto="Os avisos da Voomp e da Hotmart, os produtos ligados às turmas e as plataformas."
      />
      {abas.length > 1 && (
        <AbasDoPainel
          rotulo="Seções de Vendas"
          abas={abas.map((a) => ({
            ...a,
            exata: a.para === '/painel/vendas',
          }))}
        />
      )}
      <Outlet />
    </PaginaDoPainel>
  )
}
