import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { Label } from '#/components/ui/label'
import { appConfig } from '#/config/app'
import { normalizarCodigo } from '#/regras/certificados'

// Quem não tem o QR digita o código do certificado aqui.
export const Route = createFileRoute('/_site/validar/')({
  head: () => ({
    meta: [{ title: `Validar certificado · ${appConfig.name}` }],
  }),
  component: Digitar,
})

function Digitar() {
  const [codigo, setCodigo] = useState('')
  const navegar = useNavigate()
  return (
    <main className="mx-auto flex max-w-xl flex-col gap-6 p-6 py-12">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          Validar certificado
        </h1>
        <p className="text-muted-foreground">
          Digite o código que está no certificado (por exemplo, ABCD-2345) ou
          abra o QR code dele.
        </p>
      </div>
      <form
        className="flex flex-col gap-3 sm:flex-row sm:items-end"
        onSubmit={(e) => {
          e.preventDefault()
          const limpo = normalizarCodigo(codigo)
          if (limpo) {
            void navegar({ to: '/validar/$codigo', params: { codigo: limpo } })
          }
        }}
      >
        <div className="flex flex-1 flex-col gap-2">
          <Label htmlFor="codigo-do-certificado">Código</Label>
          <Input
            id="codigo-do-certificado"
            value={codigo}
            autoComplete="off"
            onChange={(e) => setCodigo(e.target.value)}
          />
        </div>
        <Button type="submit" disabled={!normalizarCodigo(codigo)}>
          Validar
        </Button>
      </form>
    </main>
  )
}
