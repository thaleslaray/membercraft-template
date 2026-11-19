import { createFileRoute, redirect } from '@tanstack/react-router'
import { useState } from 'react'
import { AcoesDoFormulario } from '#/components/painel/formulario'
import { CabecalhoDaPagina, PaginaDoPainel } from '#/components/painel/pagina'
import { useAcao } from '#/components/painel/use-acao'
import { Card, CardContent, CardHeader, CardTitle } from '#/components/ui/card'
import { Checkbox } from '#/components/ui/checkbox'
import { Input } from '#/components/ui/input'
import { Label } from '#/components/ui/label'
import { Textarea } from '#/components/ui/textarea'
import {
  getConfiguracaoDoEstudioFn,
  salvarConfiguracaoDaAreaFn,
} from '#/lib/configuracao-fns'
import { configuracaoDaAreaQuery } from '#/lib/configuracao-queries'
import { podeFazer, tratarPerfil } from '#/regras/permissoes'

// Termos de uso, política de privacidade e contato de suporte: só o Proprietário (`configurar-area`).
export const Route = createFileRoute('/painel/configuracoes')({
  beforeLoad: ({ context }) => {
    const perfil = tratarPerfil(context.session.user.perfil)
    if (!podeFazer(perfil, 'configurar-area')) throw redirect({ to: '/painel' })
  },
  loader: () => getConfiguracaoDoEstudioFn(),
  head: () => ({ meta: [{ title: 'Configurações · Estúdio' }] }),
  component: Configuracoes,
})

function Configuracoes() {
  const configuracao = Route.useLoaderData()
  const { executar, ocupado } = useAcao()
  const { queryClient } = Route.useRouteContext()
  const [termos, setTermos] = useState(configuracao.termosTexto)
  const [privacidade, setPrivacidade] = useState(configuracao.privacidadeTexto)
  const [suporte, setSuporte] = useState(configuracao.suporteEmail)
  const [boasVindas, setBoasVindas] = useState(
    configuracao.boasVindasVimeo ?? '',
  )
  const [novoAceite, setNovoAceite] = useState(false)
  const alterado =
    termos !== configuracao.termosTexto ||
    privacidade !== configuracao.privacidadeTexto ||
    suporte !== configuracao.suporteEmail ||
    boasVindas !== (configuracao.boasVindasVimeo ?? '') ||
    novoAceite

  async function salvar(event: React.FormEvent) {
    event.preventDefault()
    const salvou = await executar(
      () =>
        salvarConfiguracaoDaAreaFn({
          data: {
            termosTexto: termos,
            privacidadeTexto: privacidade,
            suporteEmail: suporte,
            boasVindasVimeo: boasVindas,
            exigirNovoAceite: novoAceite,
          },
        }),
      novoAceite
        ? 'Salvo. Todo aluno vai aceitar os Termos de novo.'
        : 'Configurações salvas.',
    )
    if (salvou) {
      setNovoAceite(false)
      await queryClient.invalidateQueries({
        queryKey: configuracaoDaAreaQuery.queryKey,
      })
      await queryClient.invalidateQueries({ queryKey: ['boas-vindas'] })
    }
  }

  return (
    <PaginaDoPainel>
      <CabecalhoDaPagina
        titulo="Configurações"
        contexto={
          <>
            Os textos legais aparecem nas páginas públicas{' '}
            <a href="/termos" className="underline underline-offset-2">
              /termos
            </a>{' '}
            e{' '}
            <a href="/privacidade" className="underline underline-offset-2">
              /privacidade
            </a>
            . Separe os parágrafos com uma linha em branco.
          </>
        }
      />
      <form onSubmit={(e) => void salvar(e)} className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Termos de uso</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="termos-texto">Texto</Label>
              <Textarea
                id="termos-texto"
                value={termos}
                onChange={(e) => setTermos(e.target.value)}
                rows={12}
              />
            </div>
            <div className="flex items-start gap-3">
              <Checkbox
                id="novo-aceite"
                checked={novoAceite}
                onCheckedChange={(v) => setNovoAceite(v === true)}
              />
              <Label
                htmlFor="novo-aceite"
                className="grid gap-1 font-normal leading-snug"
              >
                <span className="font-medium">
                  Pedir novo aceite de todos os alunos
                </span>
                <span className="text-sm text-muted-foreground">
                  Marque quando a mudança for para valer: cada aluno vê os
                  Termos e precisa aceitar de novo antes de continuar. Sem
                  marcar, só o texto muda.
                </span>
              </Label>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Política de privacidade</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2">
            <Label htmlFor="privacidade-texto">Texto</Label>
            <Textarea
              id="privacidade-texto"
              value={privacidade}
              onChange={(e) => setPrivacidade(e.target.value)}
              rows={12}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Contato de suporte</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2">
            <Label htmlFor="suporte-email">E-mail de suporte</Label>
            <Input
              id="suporte-email"
              type="email"
              value={suporte}
              onChange={(e) => setSuporte(e.target.value)}
              required
            />
            <p className="text-sm text-muted-foreground">
              Aparece no rodapé, no menu do aluno e na tela de entrar quando o
              e-mail não é encontrado.
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Vídeo de boas-vindas</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2">
            <Label htmlFor="boas-vindas-vimeo">Link do vídeo no Vimeo</Label>
            <Input
              id="boas-vindas-vimeo"
              type="text"
              inputMode="url"
              placeholder="https://vimeo.com/123456789"
              value={boasVindas}
              onChange={(e) => setBoasVindas(e.target.value)}
            />
            <p className="text-sm text-muted-foreground">
              Abre uma vez no primeiro acesso de cada aluno, com o botão Pular,
              e fica em &ldquo;Rever as boas-vindas&rdquo; no menu do avatar.
              Deixe vazio para não mostrar nada.
            </p>
          </CardContent>
        </Card>
        <AcoesDoFormulario
          salvar="Salvar configurações"
          ocupado={ocupado}
          alterado={alterado}
        />
      </form>
    </PaginaDoPainel>
  )
}
