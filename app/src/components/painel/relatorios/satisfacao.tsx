import { VazioDoPainel } from '#/components/painel/estados'
import {
  dataHora,
  Numero,
  percentual,
} from '#/components/painel/relatorios/comuns'
import { TabelaDoPainel } from '#/components/painel/tabela'
import { Badge } from '#/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '#/components/ui/card'
import type { RelatorioDeSatisfacao } from '#/regras/relatorios-satisfacao'

const nps = (valor: number | null) => (valor === null ? '—' : String(valor))

export function SatisfacaoView({
  relatorio,
}: {
  relatorio: RelatorioDeSatisfacao
}) {
  const r = relatorio.resumo
  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Numero rotulo="Notas no período" valor={r.total} />
        <Numero rotulo="Média" valor={r.media ?? '—'} />
        <Numero
          rotulo="Notas baixas (1 ou 2)"
          valor={percentual(r.percentualDeNotasBaixas)}
        />
        <Numero rotulo="NPS adaptado" valor={nps(r.nps)} />
      </div>
      <p className="text-xs text-muted-foreground">
        NPS adaptado: nota 5 promove, 4 é neutra e 1 a 3 desaprova. O resultado
        é o percentual de quem promove menos o de quem desaprova, de -100 a 100.
      </p>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Aulas, das piores às melhores
          </CardTitle>
        </CardHeader>
        <CardContent>
          <TabelaDoPainel
            rotulo="Aulas, das piores às melhores"
            linhas={relatorio.aulas}
            chave={(a) => a.aulaId}
            vazio={
              <VazioDoPainel mensagem="Nenhuma nota neste período. Mude as datas ou o curso para ver outras." />
            }
            colunas={[
              {
                rotulo: 'Aula',
                essencial: true,
                className: 'min-w-56',
                celula: (a) => (
                  <>
                    <span className="font-medium">{a.aulaTitulo}</span>
                    <span className="block text-xs text-muted-foreground">
                      {a.cursoNome}
                    </span>
                  </>
                ),
              },
              {
                rotulo: 'Notas',
                numero: true,
                essencial: true,
                celula: (a) => a.total,
              },
              {
                rotulo: 'Média',
                numero: true,
                essencial: true,
                celula: (a) => a.media,
              },
              {
                rotulo: 'Baixas',
                numero: true,
                essencial: true,
                celula: (a) => percentual(a.percentualDeNotasBaixas),
              },
              {
                rotulo: 'NPS',
                numero: true,
                essencial: true,
                celula: (a) => nps(a.nps),
              },
            ]}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">O que faltou?</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {relatorio.textos.length === 0 ? (
            <VazioDoPainel mensagem="Ninguém escreveu o que faltou neste período." />
          ) : (
            relatorio.textos.map((t) => (
              <div key={t.id} className="flex flex-col gap-1 border-b pb-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium">
                    {t.aulaTitulo}
                    <span className="font-normal text-muted-foreground">
                      {' '}
                      · {t.cursoNome}
                    </span>
                  </span>
                  <Badge variant={t.lida ? 'outline' : 'secondary'}>
                    Nota {t.nota}
                    {t.lida ? ' · lida' : ''}
                  </Badge>
                </div>
                <p className="whitespace-pre-wrap text-sm">{t.oQueFaltou}</p>
                <span className="text-xs text-muted-foreground">
                  {t.alunoNome} ({t.alunoEmail}) · {dataHora(t.atualizadaEm)}
                </span>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  )
}
