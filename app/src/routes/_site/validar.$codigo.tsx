import { createFileRoute, Link } from '@tanstack/react-router'
import { BadgeCheck, ShieldX } from 'lucide-react'
import { appConfig } from '#/config/app'
import { validarCertificadoFn } from '#/lib/certificados-fns'
import { formatarData } from '#/lib/datas'

// Página pública de validação (o QR do certificado abre aqui): nome, curso, data de conclusão e se o
// certificado vale. Não exige sessão e não mostra mais nada da pessoa.
export const Route = createFileRoute('/_site/validar/$codigo')({
  loader: ({ params }) =>
    validarCertificadoFn({ data: { codigo: params.codigo } }),
  head: () => ({
    meta: [
      { title: `Validar certificado · ${appConfig.name}` },
      { name: 'robots', content: 'noindex' },
    ],
  }),
  component: Validacao,
})

function Validacao() {
  const resultado = Route.useLoaderData()
  const { codigo } = Route.useParams()

  if (!resultado) {
    return (
      <main className="mx-auto flex max-w-xl flex-col gap-4 p-6 py-12">
        <h1 className="text-2xl font-semibold tracking-tight">
          Certificado não encontrado
        </h1>
        <p className="text-muted-foreground">
          Não há certificado com o código {codigo}. Confira o código e tente de
          novo.
        </p>
        <Link to="/validar">Digitar outro código</Link>
      </main>
    )
  }
  const valido = resultado.estado === 'valido'
  return (
    <main className="mx-auto flex max-w-xl flex-col gap-6 p-6 py-12">
      <div
        role="status"
        className={`flex items-center gap-3 rounded-[var(--radius-card)] border px-5 py-4 ${
          valido
            ? 'border-success/40 bg-success/10 text-success'
            : 'border-destructive/40 bg-destructive/10 text-destructive'
        }`}
      >
        {valido ? (
          <BadgeCheck className="size-6" aria-hidden="true" />
        ) : (
          <ShieldX className="size-6" aria-hidden="true" />
        )}
        <h1 className="text-xl font-semibold">
          {valido ? 'Certificado válido' : 'Certificado revogado'}
        </h1>
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-3">
        <dt className="text-muted-foreground">Nome</dt>
        <dd className="font-medium">{resultado.nome}</dd>
        <dt className="text-muted-foreground">Curso</dt>
        <dd className="font-medium">{resultado.cursoNome}</dd>
        <dt className="text-muted-foreground">Concluído em</dt>
        <dd className="font-medium">{formatarData(resultado.concluidoEm)}</dd>
        <dt className="text-muted-foreground">Código</dt>
        <dd className="font-medium">{resultado.codigo}</dd>
      </dl>
      {!valido && (
        <p className="text-sm text-muted-foreground">
          Este certificado foi revogado por {appConfig.marca.nome} e não vale
          mais.
        </p>
      )}
    </main>
  )
}
