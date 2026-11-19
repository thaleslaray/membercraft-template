import { createFileRoute } from '@tanstack/react-router'
import { CheckCheck } from 'lucide-react'
import { AbasDoPainel } from '#/components/painel/abas'
import { VazioDoPainel } from '#/components/painel/estados'
import { CabecalhoDaPagina, PaginaDoPainel } from '#/components/painel/pagina'
import { useAcao } from '#/components/painel/use-acao'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '#/components/ui/card'
import {
  avaliacoesDoPainelFn,
  marcarAvaliacaoComoLidaFn,
} from '#/lib/avaliacoes-fns'
import { FUSO_DA_ESCOLA, formatarDataHoraNoFuso } from '#/lib/datas'

// Fila "Avaliações para ler": o "o que faltou?" das notas 1 e 2, que só a equipe lê.
export const Route = createFileRoute('/painel/avaliacoes')({
  validateSearch: (search: Record<string, unknown>): { lidas?: true } =>
    search.lidas === true || search.lidas === 'true' ? { lidas: true } : {},
  loaderDeps: ({ search }) => ({ lidas: search.lidas === true }),
  loader: ({ deps }) =>
    avaliacoesDoPainelFn({
      data: { situacao: deps.lidas ? 'lidas' : 'para-ler' },
    }),
  head: () => ({ meta: [{ title: 'Avaliações · Estúdio' }] }),
  component: Avaliacoes,
})

const dataHora = {
  format: (data: Date) => formatarDataHoraNoFuso(data, FUSO_DA_ESCOLA),
}

function Avaliacoes() {
  const itens = Route.useLoaderData()
  const { lidas } = Route.useSearch()
  const { executar, ocupado } = useAcao()

  return (
    <PaginaDoPainel>
      <CabecalhoDaPagina
        titulo="Avaliações"
        contexto="O que os alunos disseram que faltou nas aulas com nota 1 ou 2. Só a equipe lê."
      />

      <AbasDoPainel
        rotulo="Avaliações por situação"
        abas={[
          {
            rotulo: 'Para ler',
            para: '/painel/avaliacoes',
            search: { lidas: undefined },
          },
          {
            rotulo: 'Lidas',
            para: '/painel/avaliacoes',
            search: { lidas: true },
          },
        ]}
      />

      {itens.length === 0 ? (
        <VazioDoPainel
          titulo={lidas ? 'Nenhuma avaliação lida' : 'Nada para ler'}
          mensagem={
            lidas
              ? 'As avaliações que a equipe marcar como lidas passam a aparecer aqui.'
              : 'Todas as avaliações estão em dia. Quando um aluno der nota 1 ou 2 e contar o que faltou, o texto aparece aqui.'
          }
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {itens.map((i) => (
            <li key={i.id}>
              <Card>
                <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
                  <CardTitle className="text-base">
                    {i.aulaTitulo}
                    <span className="block text-xs font-normal text-muted-foreground">
                      {i.cursoNome}
                    </span>
                  </CardTitle>
                  <Badge variant="secondary">Nota {i.nota} de 5</Badge>
                </CardHeader>
                <CardContent className="flex flex-col gap-3">
                  <p className="text-sm whitespace-pre-wrap [overflow-wrap:anywhere]">
                    {i.oQueFaltou}
                  </p>
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                    <span className="min-w-0 [overflow-wrap:anywhere]">
                      {i.alunoNome} ({i.alunoEmail}) ·{' '}
                      {dataHora.format(i.atualizadaEm)}
                      {i.lidaEm &&
                        ` · lida por ${i.lidaPorNome ?? 'alguém da equipe'} em ${dataHora.format(i.lidaEm)}`}
                    </span>
                    {!i.lidaEm && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="toque:min-h-11"
                        disabled={ocupado}
                        onClick={() =>
                          executar(
                            () =>
                              marcarAvaliacaoComoLidaFn({
                                data: { avaliacaoId: i.id },
                              }),
                            'Marcada como lida.',
                          )
                        }
                      >
                        <CheckCheck />
                        Marcar como lida
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </PaginaDoPainel>
  )
}
