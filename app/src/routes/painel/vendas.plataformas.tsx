import { createFileRoute, redirect } from '@tanstack/react-router'
import { CartaoDaVoomp } from '#/components/painel/cartao-da-voomp'
import { ConferenciaDaHotmart } from '#/components/painel/conferencia-da-hotmart'
import { CredenciaisDaHotmart } from '#/components/painel/credenciais-da-hotmart'
import { conferenciasDaHotmartFn } from '#/lib/hotmart-conferencia-fns'
import { credenciaisDaHotmartFn } from '#/lib/hotmart-fns'
import { voompDaAreaFn } from '#/lib/vendas-fns'
import { podeFazer, tratarPerfil } from '#/regras/permissoes'

// Credenciais da Hotmart e histórico da conferência: só o Proprietário (`gerir-credenciais-da-hotmart`).
export const Route = createFileRoute('/painel/vendas/plataformas')({
  beforeLoad: ({ context }) => {
    const perfil = tratarPerfil(context.session.user.perfil)
    if (!podeFazer(perfil, 'gerir-credenciais-da-hotmart')) {
      throw redirect({ to: '/painel' })
    }
  },
  loader: async () => {
    const [credenciais, conferencias, voomp] = await Promise.all([
      credenciaisDaHotmartFn(),
      conferenciasDaHotmartFn(),
      voompDaAreaFn(),
    ])
    return { credenciais, conferencias, voomp }
  },
  head: () => ({ meta: [{ title: 'Plataformas · Vendas · Estúdio' }] }),
  component: Plataformas,
})

function Plataformas() {
  const { credenciais, conferencias, voomp } = Route.useLoaderData()
  return (
    <div className="flex flex-col gap-10">
      <CredenciaisDaHotmart situacao={credenciais} />
      <ConferenciaDaHotmart conferencias={conferencias} />
      <CartaoDaVoomp situacao={voomp} />
    </div>
  )
}
