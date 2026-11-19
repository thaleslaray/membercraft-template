import { createFileRoute, redirect, useBlocker } from '@tanstack/react-router'
import { useCallback, useEffect, useState } from 'react'
import { useConfirmar } from '#/components/confirmar'
import { CabecalhoDaPagina, PaginaDoPainel } from '#/components/painel/pagina'
import { useAcao } from '#/components/painel/use-acao'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '#/components/ui/card'
import { Input } from '#/components/ui/input'
import { Label } from '#/components/ui/label'
import { Textarea } from '#/components/ui/textarea'
import {
  previaDeEmailFn,
  restaurarTextoDeEmailFn,
  salvarTextoDeEmailFn,
  textosDeEmailFn,
} from '#/lib/email-fns'
import { toast } from '#/lib/toast'
import { podeFazer, tratarPerfil } from '#/regras/permissoes'

type Item = Awaited<ReturnType<typeof textosDeEmailFn>>[number]

// Textos dos e-mails: só o Proprietário (`configurar-area`). Edição simples com prévia.
export const Route = createFileRoute('/painel/emails')({
  beforeLoad: ({ context }) => {
    const perfil = tratarPerfil(context.session.user.perfil)
    if (!podeFazer(perfil, 'configurar-area')) throw redirect({ to: '/painel' })
  },
  loader: () => textosDeEmailFn(),
  head: () => ({ meta: [{ title: 'E-mails · Estúdio' }] }),
  component: Emails,
})

function Emails() {
  const textos = Route.useLoaderData()
  const confirmar = useConfirmar()
  // Quais e-mails têm texto digitado e ainda não salvo (cada bloco avisa o seu estado).
  const [alterados, setAlterados] = useState<ReadonlySet<string>>(new Set())
  const mudou = alterados.size > 0
  const avisar = useCallback(
    (tipo: string, alterado: boolean) =>
      setAlterados((atual) => {
        if (atual.has(tipo) === alterado) return atual
        const novo = new Set(atual)
        if (alterado) novo.add(tipo)
        else novo.delete(tipo)
        return novo
      }),
    [],
  )

  // Uma pergunta só para a tela inteira, não uma por e-mail.
  useBlocker({
    shouldBlockFn: async () => {
      if (!mudou) return false
      const sair = await confirmar({
        titulo: 'Sair sem salvar?',
        descricao: 'Há texto de e-mail que você mudou e ainda não salvou.',
        acao: 'Sair sem salvar',
        recusa: 'Continuar editando',
        perigo: true,
      })
      return !sair
    },
    enableBeforeUnload: () => mudou,
  })

  return (
    <PaginaDoPainel>
      <CabecalhoDaPagina
        titulo="E-mails"
        contexto={
          <>
            Edite o assunto e o texto de cada e-mail. Use as variáveis entre
            chaves duplas, como {'{{nome}}'}. O e-mail do código de acesso é
            travado. Cada e-mail tem o seu botão Salvar.
          </>
        }
      />
      {textos.map((t) => (
        <EditorDeEmail
          key={`${t.tipo}-${t.editado}-${t.vigente.corpo}`}
          item={t}
          aoMudar={avisar}
        />
      ))}
    </PaginaDoPainel>
  )
}

function EditorDeEmail({
  item,
  aoMudar,
}: {
  item: Item
  aoMudar: (tipo: string, alterado: boolean) => void
}) {
  const { executar, ocupado } = useAcao()
  const confirmar = useConfirmar()
  const [assunto, setAssunto] = useState(item.vigente.assunto)
  const [corpo, setCorpo] = useState(item.vigente.corpo)
  const [previa, setPrevia] = useState<{
    subject: string
    html: string
  } | null>(null)

  const alterado =
    assunto !== item.vigente.assunto || corpo !== item.vigente.corpo
  useEffect(() => {
    aoMudar(item.tipo, alterado)
    return () => aoMudar(item.tipo, false)
  }, [alterado, aoMudar, item.tipo])

  async function restaurar() {
    const sim = await confirmar({
      titulo: `Voltar ao texto padrão de "${item.nome}"?`,
      descricao:
        'O assunto e o texto que você escreveu para este e-mail serão apagados.',
      acao: 'Voltar ao texto padrão',
      perigo: true,
    })
    if (!sim) return
    await executar(
      () => restaurarTextoDeEmailFn({ data: { tipo: item.tipo } }),
      'Texto padrão restaurado.',
    )
  }

  async function verPrevia() {
    try {
      setPrevia(
        await previaDeEmailFn({ data: { tipo: item.tipo, assunto, corpo } }),
      )
    } catch (e) {
      setPrevia(null)
      toast.error(
        e instanceof Error ? e.message : 'Não deu para gerar a prévia.',
      )
    }
  }

  return (
    <Card aria-label={item.nome}>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          {item.nome}
          {!item.editavel && <Badge variant="outline">Texto travado</Badge>}
          {item.editado && <Badge variant="secondary">Editado</Badge>}
          {item.descadastro && (
            <Badge variant="secondary">Com descadastro</Badge>
          )}
        </CardTitle>
        <p className="text-sm text-muted-foreground">{item.quando}</p>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <form
          noValidate
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault()
            if (!item.editavel) return
            void executar(
              () =>
                salvarTextoDeEmailFn({
                  data: { tipo: item.tipo, assunto, corpo },
                }),
              'Texto salvo.',
            )
          }}
        >
          <div className="flex flex-col gap-2">
            <Label htmlFor={`assunto-${item.tipo}`}>Assunto</Label>
            <Input
              id={`assunto-${item.tipo}`}
              value={assunto}
              disabled={!item.editavel}
              onChange={(e) => setAssunto(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor={`corpo-${item.tipo}`}>Texto</Label>
            <Textarea
              id={`corpo-${item.tipo}`}
              rows={8}
              value={corpo}
              disabled={!item.editavel}
              onChange={(e) => setCorpo(e.target.value)}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Variáveis:{' '}
            {item.variaveis
              .map((v) => `{{${v.nome}}} (${v.descricao})`)
              .join(' · ')}
          </p>
          {item.editavel && (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="submit"
                variant="secondary"
                disabled={ocupado}
                className="toque:min-h-11"
              >
                Salvar este e-mail
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={ocupado}
                onClick={() => void verPrevia()}
                className="toque:min-h-11"
              >
                Ver prévia
              </Button>
              {item.editado && (
                <Button
                  type="button"
                  variant="outline"
                  disabled={ocupado}
                  onClick={() => void restaurar()}
                  className="toque:min-h-11"
                >
                  Voltar ao texto padrão
                </Button>
              )}
              {alterado && !ocupado ? (
                <span role="status" className="text-xs text-muted-foreground">
                  Alterações não salvas
                </span>
              ) : null}
            </div>
          )}
        </form>
        {previa && (
          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium">Assunto: {previa.subject}</p>
            <iframe
              title={`Prévia de ${item.nome}`}
              sandbox=""
              srcDoc={previa.html}
              className="h-96 w-full rounded-md border"
            />
          </div>
        )}
      </CardContent>
    </Card>
  )
}
