import { createFileRoute } from '@tanstack/react-router'
import { LegalPage } from '#/components/legal-page'
import { appConfig } from '#/config/app'
import { useConfiguracaoDaArea } from '#/lib/configuracao-queries'

// Pública. O texto é o que o Proprietário editou em Configurações (a raiz já carregou o dado).
export const Route = createFileRoute('/_site/privacidade')({
  head: () => ({ meta: [{ title: `Privacidade — ${appConfig.name}` }] }),
  component: Privacidade,
})

function Privacidade() {
  const { privacidadeTexto } = useConfiguracaoDaArea()
  return <LegalPage title="Privacidade" texto={privacidadeTexto} />
}
