import { useEffect, useState } from 'react'
import { EtiquetaDeEstado } from '#/components/painel/etiqueta-de-estado'
import { useAcao } from '#/components/painel/use-acao'
import { Card, CardContent, CardHeader } from '#/components/ui/card'
import { Checkbox } from '#/components/ui/checkbox'
import { Label } from '#/components/ui/label'
import { usarVoompFn, type voompDaAreaFn } from '#/lib/vendas-fns'

// Cartão da Voomp na aba Plataformas (#146). Fora de uso, a Voomp não aparece em Vendas nem em Produtos.
export function CartaoDaVoomp({
  situacao,
}: {
  situacao: Awaited<ReturnType<typeof voompDaAreaFn>>
}) {
  const { executar, ocupado } = useAcao()
  // O endereço de origem só existe no navegador: lido depois da hidratação, para o HTML do servidor e o
  // do primeiro desenho serem iguais.
  const [origem, setOrigem] = useState('')
  useEffect(() => setOrigem(window.location.origin), [])
  const endereco = `${origem}/api/webhooks/voomp`

  return (
    <section aria-labelledby="voomp" className="flex flex-col gap-6">
      <div>
        <h2 id="voomp" className="text-lg font-semibold tracking-tight">
          Voomp
        </h2>
        <p className="text-muted-foreground">
          Ligue só se a escola vende pela Voomp. Desligada e sem avisos, a Voomp
          some de Vendas e de Produtos.
        </p>
      </div>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <h3 className="leading-none font-semibold">Conexão</h3>
          <EtiquetaDeEstado tom={situacao.emUso ? 'ok' : 'neutro'}>
            {situacao.emUso ? 'Em uso' : 'Não conectada'}
          </EtiquetaDeEstado>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="flex items-center gap-3">
            <Checkbox
              id="usar-voomp"
              checked={situacao.interruptor}
              disabled={ocupado}
              onCheckedChange={(v) =>
                void executar(
                  () => usarVoompFn({ data: { ligada: v === true } }),
                  v === true ? 'Voomp ligada.' : 'Voomp desligada.',
                )
              }
            />
            <Label htmlFor="usar-voomp" className="font-normal">
              Usar a Voomp
            </Label>
          </div>
          {situacao.emUso && (
            <div className="grid gap-3 text-sm">
              <div className="grid gap-1">
                <span className="font-medium">Endereço do webhook</span>
                <code className="rounded-md border bg-muted px-3 py-2 break-all">
                  {endereco}
                </code>
              </div>
              <p className="text-muted-foreground">
                Na Voomp, cadastre este endereço como webhook e envie o token no
                cabeçalho <code>x-webhook-token</code>. O token é o segredo{' '}
                <code>VOOMP_WEBHOOK_TOKEN</code> do sistema; ele não aparece
                aqui.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  )
}
