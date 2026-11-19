import { useQueryClient } from '@tanstack/react-query'
import { createFileRoute, redirect } from '@tanstack/react-router'
import { useState } from 'react'

import { Button } from '#/components/ui/button'
import { Checkbox } from '#/components/ui/checkbox'
import { Input } from '#/components/ui/input'
import { Label } from '#/components/ui/label'
import { concluirPrimeiroAcessoFn } from '#/lib/acesso-fns'
import { sessionQuery } from '#/lib/auth-queries'
import { configuracaoDaAreaQuery } from '#/lib/configuracao-queries'
import { safeRedirect } from '#/lib/safe-redirect'
import { tratarPerfil } from '#/regras/permissoes'
import { pendenciasDoPrimeiroAcesso } from '#/regras/primeiro-acesso-pendencias'

export const Route = createFileRoute('/_site/primeiro-acesso')({
  validateSearch: (search: Record<string, unknown>): { redirect?: string } =>
    typeof search.redirect === 'string' ? { redirect: search.redirect } : {},
  beforeLoad: async ({ context, search, location }) => {
    const session = await context.queryClient.ensureQueryData(sessionQuery)
    if (!session) {
      throw redirect({ to: '/login', search: { redirect: location.href } })
    }
    const configuracao = await context.queryClient.ensureQueryData(
      configuracaoDaAreaQuery,
    )
    const pendencias = pendenciasDoPrimeiroAcesso(
      {
        perfil: tratarPerfil(session.user.perfil),
        name: session.user.name,
        termosVersao: session.user.termosVersao ?? null,
      },
      configuracao.termosVersao,
    )
    if (!pendencias.precisaNome && !pendencias.precisaTermos) {
      throw redirect({ href: safeRedirect(search.redirect) })
    }
    // Nunca aceitou os Termos: é a primeira vez. Já aceitou uma versão antiga: os Termos mudaram.
    return { pendencias, jaAceitouAntes: Boolean(session.user.termosVersao) }
  },
  head: () => ({ meta: [{ title: 'Primeiro acesso' }] }),
  component: PrimeiroAcesso,
})

function PrimeiroAcesso() {
  const { pendencias, jaAceitouAntes } = Route.useRouteContext()
  const { redirect: destino } = Route.useSearch()
  const queryClient = useQueryClient()
  const [nome, setNome] = useState('')
  const [aceitou, setAceitou] = useState(false)
  const [pending, setPending] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  async function enviar(event: React.FormEvent) {
    event.preventDefault()
    setPending(true)
    setErro(null)
    try {
      await concluirPrimeiroAcessoFn({
        data: {
          ...(pendencias.precisaNome ? { nome } : {}),
          aceitouTermos: aceitou,
        },
      })
    } catch {
      setPending(false)
      setErro('Não foi possível salvar. Confira os dados e tente de novo.')
      return
    }
    await queryClient.invalidateQueries({ queryKey: ['session'] })
    // Carga completa: a sessão pertence ao render do servidor.
    window.location.assign(safeRedirect(destino))
  }

  return (
    <main className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-sm flex-col justify-center gap-6 px-4 py-12">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          {jaAceitouAntes ? 'Termos atualizados' : 'Primeiro acesso'}
        </h1>
        <p className="text-sm text-muted-foreground">
          {pendencias.precisaNome
            ? 'Conte como devemos chamar você e aceite os termos para continuar.'
            : jaAceitouAntes
              ? 'Os termos mudaram. Leia e aceite para continuar.'
              : 'Boas-vindas. Leia e aceite os termos para começar.'}
        </p>
      </div>
      <form className="flex flex-col gap-4" onSubmit={(e) => void enviar(e)}>
        {pendencias.precisaNome ? (
          <div className="grid gap-2">
            <Label htmlFor="primeiro-nome">Seu nome</Label>
            <Input
              id="primeiro-nome"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              autoComplete="name"
              required
              className="h-12"
            />
          </div>
        ) : null}
        <div className="flex items-start gap-3">
          <Checkbox
            id="primeiro-termos"
            checked={aceitou}
            onCheckedChange={(valor) => setAceitou(valor === true)}
          />
          <Label
            htmlFor="primeiro-termos"
            className="block text-sm font-normal leading-snug"
          >
            Li e aceito os{' '}
            <a
              href="/termos"
              target="_blank"
              rel="noreferrer"
              className="underline underline-offset-2"
            >
              Termos de uso
            </a>{' '}
            e a{' '}
            <a
              href="/privacidade"
              target="_blank"
              rel="noreferrer"
              className="underline underline-offset-2"
            >
              Política de privacidade
            </a>
            .
          </Label>
        </div>
        <Button
          type="submit"
          disabled={
            pending || !aceitou || (pendencias.precisaNome && !nome.trim())
          }
          className="h-11 w-full bg-brand text-brand-foreground hover:bg-brand-hover"
        >
          {pending ? 'Salvando...' : 'Continuar'}
        </Button>
        {erro ? (
          <p role="alert" className="text-sm text-destructive">
            {erro}
          </p>
        ) : null}
      </form>
    </main>
  )
}
