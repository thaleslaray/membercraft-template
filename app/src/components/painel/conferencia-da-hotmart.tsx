import { VazioDoPainel } from '#/components/painel/estados'
import { EtiquetaDeEstado } from '#/components/painel/etiqueta-de-estado'
import { type ColunaDaTabela, TabelaDoPainel } from '#/components/painel/tabela'
import { Card, CardContent, CardHeader } from '#/components/ui/card'
import { FUSO_DA_ESCOLA, formatarDataHoraNoFuso } from '#/lib/datas'
import type { conferenciasDaHotmartFn } from '#/lib/hotmart-conferencia-fns'
import {
  ESTADO_DA_RODADA_DA_HOTMART,
  ESTADO_DO_RESULTADO_DA_HOTMART,
} from '#/regras/estados-de-vendas'

type Conferencias = Awaited<ReturnType<typeof conferenciasDaHotmartFn>>
type Detalhe = Conferencias[number]['detalhes'][number] & { posicao: number }

const formatar = (d: Date) => formatarDataHoraNoFuso(d, FUSO_DA_ESCOLA)

const COLUNAS: ColunaDaTabela<Detalhe>[] = [
  {
    rotulo: 'Transação',
    essencial: true,
    className: 'md:min-w-40',
    celula: (d) => <span className="font-mono break-all">{d.transacao}</span>,
  },
  {
    rotulo: 'Status na Hotmart',
    celula: (d) => d.status,
  },
  {
    rotulo: 'Resultado',
    essencial: true,
    className: 'md:min-w-36',
    celula: (d) => (
      <EtiquetaDeEstado {...ESTADO_DO_RESULTADO_DA_HOTMART[d.resultado]} />
    ),
  },
  {
    rotulo: 'Detalhe',
    essencial: true,
    celula: (d) => d.motivo,
  },
]

export function ConferenciaDaHotmart({
  conferencias,
}: {
  conferencias: Conferencias
}) {
  return (
    <section
      aria-labelledby="conferencia-da-hotmart"
      className="flex flex-col gap-6"
    >
      <div>
        <h2
          id="conferencia-da-hotmart"
          className="text-lg font-semibold tracking-tight"
        >
          Conferência da Hotmart
        </h2>
        <p className="text-muted-foreground">
          Uma vez por dia o sistema consulta as vendas dos últimos dias na
          Hotmart e aplica as compras e os estornos que o aviso não trouxe.
          Ninguém precisa clicar; o botão Conferir com a Hotmart, na aba Vendas,
          repete a conferência na hora.
        </p>
      </div>
      {conferencias.length === 0 ? (
        <VazioDoPainel
          titulo="Nenhuma conferência ainda"
          mensagem="A primeira roda no próximo ciclo diário. Para conferir agora, use o botão Conferir com a Hotmart, na aba Vendas."
        />
      ) : (
        conferencias.map((c) => (
          <Card key={c.id} data-testid="conferencia-hotmart">
            <CardHeader>
              <h3 className="flex flex-wrap items-center gap-2 text-base leading-snug font-semibold">
                <span className="tabular-nums">{formatar(c.iniciadaEm)}</span>
                <EtiquetaDeEstado>
                  {c.origem === 'cron' ? 'Automática' : 'Manual'}
                </EtiquetaDeEstado>
                <EtiquetaDeEstado
                  {...ESTADO_DA_RODADA_DA_HOTMART[c.situacao]}
                />
              </h3>
            </CardHeader>
            <CardContent className="grid gap-3 text-sm">
              <p className="tabular-nums">
                Janela: {formatar(c.janelaInicio)} a {formatar(c.janelaFim)}.{' '}
                {c.consultadas} consultada(s), {c.recuperadas} recuperada(s),{' '}
                {c.jaProcessadas} já processada(s), {c.semTurma} sem turma,{' '}
                {c.ignoradas} ignorada(s), {c.comErro} com erro.
              </p>
              {c.erro && (
                <p className="font-medium text-destructive">Erro: {c.erro}</p>
              )}
              {c.detalhes.length > 0 && (
                <TabelaDoPainel
                  rotulo={`Transações da conferência de ${formatar(c.iniciadaEm)}`}
                  colunas={COLUNAS}
                  linhas={c.detalhes.map((d, posicao) => ({ ...d, posicao }))}
                  // itens ignorados podem repetir "(sem transação)": a posição na lista é a chave
                  chave={(d) => String(d.posicao)}
                />
              )}
            </CardContent>
          </Card>
        ))
      )}
    </section>
  )
}
