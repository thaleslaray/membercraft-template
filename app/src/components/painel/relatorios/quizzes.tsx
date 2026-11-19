import { VazioDoPainel } from '#/components/painel/estados'
import { percentual } from '#/components/painel/relatorios/comuns'
import { TabelaDoPainel } from '#/components/painel/tabela'
import { Card, CardContent, CardHeader, CardTitle } from '#/components/ui/card'
import type { RelatorioDeQuizzes } from '#/regras/relatorios-quizzes'

export function QuizzesView({ relatorio }: { relatorio: RelatorioDeQuizzes }) {
  if (relatorio.quizzes.length === 0) {
    return (
      <VazioDoPainel mensagem="Nenhuma tentativa de exercício neste período. Mude as datas ou o curso para ver outras." />
    )
  }
  return (
    <div className="flex flex-col gap-4">
      {relatorio.quizzes.map((q) => (
        <Card key={q.quizId}>
          <CardHeader>
            <CardTitle className="text-base">
              {q.aulaTitulo}
              <span className="block text-xs font-normal text-muted-foreground">
                {q.cursoNome}
              </span>
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              {q.tentativas} tentativas de {q.alunos} alunos · {q.aprovadas}{' '}
              aprovadas, {q.reprovadas} reprovadas
              {q.aguardandoCorrecao > 0 &&
                `, ${q.aguardandoCorrecao} aguardando correção`}{' '}
              · aprovação {percentual(q.taxaDeAprovacao)}
            </p>
          </CardHeader>
          <CardContent>
            <TabelaDoPainel
              rotulo={`Perguntas de ${q.aulaTitulo}`}
              linhas={q.perguntas}
              chave={(p) => p.enunciado}
              vazio={
                <VazioDoPainel mensagem="Nenhuma pergunta com correção automática." />
              }
              colunas={[
                {
                  rotulo: 'Pergunta (as mais erradas primeiro)',
                  essencial: true,
                  className: 'min-w-56',
                  celula: (p) => p.enunciado,
                },
                {
                  rotulo: 'Respostas',
                  numero: true,
                  essencial: true,
                  celula: (p) => p.respondidas,
                },
                {
                  rotulo: 'Acerto',
                  numero: true,
                  essencial: true,
                  celula: (p) => `${p.percentualDeAcerto}%`,
                },
              ]}
            />
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
