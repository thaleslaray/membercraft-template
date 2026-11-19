import { EmailOtpForm } from '#/components/auth/email-otp-form'
import { Marca } from '#/components/casca/marca'
import { useAparencia } from '#/lib/aparencia-queries'

// Mensagens para o `?error=` que volta de um link de entrada recusado.
function describeError(code: string | undefined) {
  if (!code) return null
  return 'Não foi possível entrar com esse método. Tente de novo ou use o código por e-mail.'
}

export function LoginPanel({
  callbackURL,
  error,
}: {
  callbackURL: string
  error?: string
}) {
  const message = describeError(error)
  // Logo e fundo da tela de entrar vêm da aparência configurada (#63). Com fundo, a tela
  // vira duas colunas em telas largas: a imagem de um lado, o formulário do outro.
  const { logoUrl, fundoDoLoginUrl } = useAparencia()
  return (
    <main
      className={`grid min-h-[calc(100vh-4rem)] ${fundoDoLoginUrl ? 'lg:grid-cols-2' : ''}`}
    >
      {fundoDoLoginUrl ? (
        <div
          aria-hidden="true"
          data-testid="fundo-do-login"
          className="hidden bg-cover bg-center lg:block"
          style={{ backgroundImage: `url("${fundoDoLoginUrl}")` }}
        />
      ) : null}
      <div className="mx-auto flex w-full max-w-sm flex-col justify-center gap-6 px-4 py-12">
        {logoUrl ? <Marca logoUrl={logoUrl} className="h-12" /> : null}
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Entrar</h1>
          <p className="text-sm text-muted-foreground">
            Sem senha: enviamos um código para o seu e-mail.
          </p>
        </div>

        {message ? (
          <p role="alert" className="text-sm text-destructive">
            {message}
          </p>
        ) : null}

        <EmailOtpForm callbackURL={callbackURL} />

        <p className="text-center text-xs text-muted-foreground">
          Ao continuar você concorda com os{' '}
          <a
            href="/termos"
            className="underline underline-offset-2 hover:text-foreground"
          >
            Termos de uso
          </a>{' '}
          e a{' '}
          <a
            href="/privacidade"
            className="underline underline-offset-2 hover:text-foreground"
          >
            Política de privacidade
          </a>
          .
        </p>
      </div>
    </main>
  )
}
