import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { Button } from '#/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '#/components/ui/card'
import { descadastrarFn, situacaoDoDescadastroFn } from '#/lib/email-fns'

// Link de descadastro dos e-mails marcados. A visita só mostra a pergunta; desligar exige o clique
// (programas de e-mail abrem links sozinhos para checar).
export const Route = createFileRoute('/_site/descadastrar')({
  validateSearch: (
    search: Record<string, unknown>,
  ): { u: string; t: string; s: string } => ({
    u: typeof search.u === 'string' ? search.u : '',
    t: typeof search.t === 'string' ? search.t : '',
    s: typeof search.s === 'string' ? search.s : '',
  }),
  loaderDeps: ({ search }) => search,
  loader: ({ deps }) =>
    deps.u && deps.t && deps.s
      ? situacaoDoDescadastroFn({ data: deps })
      : { valido: false as const },
  head: () => ({ meta: [{ title: 'Descadastrar e-mail' }] }),
  component: Descadastrar,
})

function Descadastrar() {
  const situacao = Route.useLoaderData()
  const search = Route.useSearch()
  const [feito, setFeito] = useState(false)
  const [erro, setErro] = useState('')
  const [ocupado, setOcupado] = useState(false)

  async function desligar() {
    setOcupado(true)
    setErro('')
    try {
      await descadastrarFn({ data: search })
      setFeito(true)
    } catch {
      setErro('Não deu certo. Tente de novo.')
    } finally {
      setOcupado(false)
    }
  }

  return (
    <main className="mx-auto w-full max-w-md px-4 py-12">
      <Card className="rounded-[var(--radius-card)]">
        <CardHeader>
          <CardTitle>Descadastrar e-mail</CardTitle>
          {!situacao.valido ? (
            <CardDescription>
              Este link não é válido. Para escolher quais e-mails receber, entre
              na área e abra Minha conta.
            </CardDescription>
          ) : feito || !situacao.ativo ? (
            <CardDescription>
              Pronto: você não vai mais receber o e-mail "{situacao.nome}". Para
              voltar a receber, ligue de novo em Minha conta.
            </CardDescription>
          ) : (
            <CardDescription>
              Quer parar de receber o e-mail "{situacao.nome}"? Os e-mails de
              acesso e de aviso da sua conta continuam chegando.
            </CardDescription>
          )}
        </CardHeader>
        {situacao.valido && situacao.ativo && !feito ? (
          <CardContent className="grid gap-3">
            <Button
              onClick={() => void desligar()}
              disabled={ocupado}
              className="w-full bg-brand text-brand-foreground hover:bg-brand-hover"
            >
              {ocupado ? 'Desligando...' : 'Sim, desligar'}
            </Button>
            {erro ? (
              <p role="alert" className="text-sm text-destructive">
                {erro}
              </p>
            ) : null}
          </CardContent>
        ) : null}
      </Card>
    </main>
  )
}
