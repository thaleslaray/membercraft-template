import { createFileRoute } from '@tanstack/react-router'
import { LegalPage } from '#/components/legal-page'
import { appConfig } from '#/config/app'
import { useConfiguracaoDaArea } from '#/lib/configuracao-queries'

// Pública. O texto é o que o Proprietário editou em Configurações (a raiz já carregou o dado).
export const Route = createFileRoute('/_site/termos')({
  head: () => ({ meta: [{ title: `Termos de uso — ${appConfig.name}` }] }),
  component: Termos,
})

function Termos() {
  const { termosTexto } = useConfiguracaoDaArea()
  return <LegalPage title="Termos de uso" texto={termosTexto} />
}
