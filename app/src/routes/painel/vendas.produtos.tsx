import { createFileRoute, redirect } from '@tanstack/react-router'
import { LigacoesDaHotmart } from '#/components/painel/ligacoes-da-hotmart'
import { LigacoesDaVoomp } from '#/components/painel/ligacoes-da-voomp'
import { liberacaoDaHotmartFn } from '#/lib/hotmart-ligacao-fns'
import { vendasDaVoompFn } from '#/lib/vendas-fns'
import { podeFazer, tratarPerfil } from '#/regras/permissoes'

// Produtos ligados a turmas (Hotmart e Voomp): só quem pode ligar produto.
export const Route = createFileRoute('/painel/vendas/produtos')({
  beforeLoad: ({ context }) => {
    const perfil = tratarPerfil(context.session.user.perfil)
    const hotmart = podeFazer(perfil, 'ligar-produto-da-hotmart')
    const voomp = podeFazer(perfil, 'ligar-produto-da-voomp')
    if (!hotmart && !voomp) throw redirect({ to: '/painel/vendas' })
    return { hotmart, voomp }
  },
  loader: async ({ context }) => {
    const [hotmart, voomp] = await Promise.all([
      context.hotmart ? liberacaoDaHotmartFn() : null,
      context.voomp ? vendasDaVoompFn({ data: {} }) : null,
    ])
    return { hotmart, voomp }
  },
  head: () => ({ meta: [{ title: 'Produtos · Vendas · Estúdio' }] }),
  component: Produtos,
})

function Produtos() {
  const { hotmart, voomp } = Route.useLoaderData()
  return (
    <div className="flex flex-col gap-8">
      {hotmart && <LigacoesDaHotmart dados={hotmart} />}
      {voomp?.podeLigar && voomp.voompEmUso && (
        <section aria-label="Produtos da Voomp">
          <LigacoesDaVoomp dados={voomp} />
        </section>
      )}
    </div>
  )
}
