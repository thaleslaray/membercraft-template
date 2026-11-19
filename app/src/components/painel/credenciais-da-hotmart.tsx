import { useState } from 'react'
import { EtiquetaDeEstado } from '#/components/painel/etiqueta-de-estado'
import { AcoesDoFormulario } from '#/components/painel/formulario'
import { useAcao } from '#/components/painel/use-acao'
import { Button } from '#/components/ui/button'
import { Card, CardContent, CardHeader } from '#/components/ui/card'
import { Checkbox } from '#/components/ui/checkbox'
import { Input } from '#/components/ui/input'
import { Label } from '#/components/ui/label'
import {
  type credenciaisDaHotmartFn,
  salvarCredenciaisDaHotmartFn,
  testarConexaoDaHotmartFn,
} from '#/lib/hotmart-fns'

const CAMPOS = [
  { chave: 'clientId', rotulo: 'Client ID' },
  { chave: 'clientSecret', rotulo: 'Client Secret' },
  { chave: 'basic', rotulo: 'Client Token' },
  { chave: 'hottok', rotulo: 'Hottok (assinatura do webhook)' },
] as const
type Chave = (typeof CAMPOS)[number]['chave']

const VAZIO: Record<Chave, string> = {
  clientId: '',
  clientSecret: '',
  basic: '',
  hottok: '',
}

export function CredenciaisDaHotmart({
  situacao,
}: {
  situacao: Awaited<ReturnType<typeof credenciaisDaHotmartFn>>
}) {
  const { executar, ocupado } = useAcao()
  const [valores, setValores] = useState(VAZIO)
  const [sandbox, setSandbox] = useState(situacao.sandbox)
  const [resultado, setResultado] = useState<{
    ok: boolean
    mensagem: string
  } | null>(null)

  const alterado =
    Object.values(valores).some((v) => v !== '') || sandbox !== situacao.sandbox

  async function salvar(event: React.FormEvent) {
    event.preventDefault()
    const salvou = await executar(
      () => salvarCredenciaisDaHotmartFn({ data: { ...valores, sandbox } }),
      'Credenciais salvas.',
    )
    if (salvou) {
      setValores(VAZIO)
      setResultado(null)
    }
  }

  async function testar() {
    const r = await executar(() => testarConexaoDaHotmartFn())
    if (r) setResultado(r)
  }

  return (
    <section className="flex flex-col gap-6">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">Hotmart</h2>
        <p className="text-muted-foreground">
          Cole as credenciais criadas em Ferramentas, Credenciais Developers, na
          Hotmart. Elas ficam guardadas cifradas e não aparecem de novo: para
          mudar, cole o valor novo.
        </p>
      </div>
      <form onSubmit={(e) => void salvar(e)} className="grid gap-6">
        <Card>
          <CardHeader>
            <h3 className="leading-none font-semibold">Credenciais</h3>
          </CardHeader>
          <CardContent className="grid gap-4">
            {CAMPOS.map(({ chave, rotulo }) => (
              <div key={chave} className="grid gap-2">
                <div className="flex items-center gap-2">
                  <Label htmlFor={`hotmart-${chave}`}>{rotulo}</Label>
                  {situacao.campos[chave] ? (
                    <EtiquetaDeEstado tom="ok">Salvo</EtiquetaDeEstado>
                  ) : (
                    <EtiquetaDeEstado tom="atencao">
                      Falta preencher
                    </EtiquetaDeEstado>
                  )}
                </div>
                <Input
                  id={`hotmart-${chave}`}
                  type="password"
                  autoComplete="new-password"
                  spellCheck={false}
                  placeholder={
                    situacao.campos[chave]
                      ? '••••••••••••  (deixe vazio para manter)'
                      : ''
                  }
                  value={valores[chave]}
                  onChange={(e) =>
                    setValores((v) => ({ ...v, [chave]: e.target.value }))
                  }
                />
              </div>
            ))}
            <div className="flex items-start gap-3">
              <Checkbox
                id="hotmart-sandbox"
                checked={sandbox}
                onCheckedChange={(v) => setSandbox(v === true)}
              />
              <Label
                htmlFor="hotmart-sandbox"
                className="grid gap-1 font-normal leading-snug"
              >
                <span className="font-medium">Credencial do tipo sandbox</span>
                <span className="text-sm text-muted-foreground">
                  Marque se a credencial foi criada como sandbox (ambiente de
                  testes). O ambiente de testes da escola usa sandbox.
                </span>
              </Label>
            </div>
          </CardContent>
        </Card>
        <div className="flex flex-wrap items-center gap-3">
          <AcoesDoFormulario
            salvar="Salvar credenciais"
            ocupado={ocupado}
            alterado={alterado}
            className="pt-0"
          />
          <Button
            type="button"
            variant="outline"
            disabled={ocupado || !situacao.configurada}
            onClick={() => void testar()}
            className="toque:min-h-11"
          >
            Testar conexão
          </Button>
        </div>
        {resultado && (
          <p
            role="status"
            className={
              resultado.ok ? 'text-sm' : 'text-sm font-medium text-destructive'
            }
          >
            {resultado.mensagem}
          </p>
        )}
      </form>
    </section>
  )
}
