import { createFileRoute, Link } from '@tanstack/react-router'
import { EstadoDaConversaBadge } from '#/components/atendimento/mensagens'
import { AbasDoPainel } from '#/components/painel/abas'
import { VazioDoPainel } from '#/components/painel/estados'
import { CabecalhoDaPagina, PaginaDoPainel } from '#/components/painel/pagina'
import { useAcao } from '#/components/painel/use-acao'
import { Badge } from '#/components/ui/badge'
import { Card } from '#/components/ui/card'
import { Checkbox } from '#/components/ui/checkbox'
import { Label } from '#/components/ui/label'
import {
  definirAvisoDeAtendimentoFn,
  filaDoAtendimentoFn,
} from '#/lib/atendimento-fns'
import { FUSO_DA_ESCOLA, formatarDataHoraNoFuso } from '#/lib/datas'
import type { EstadoDaConversa } from '#/regras/atendimento'

const ESTADOS = ['aberta', 'respondida', 'resolvida'] as const

const VAZIO: Record<EstadoDaConversa, { titulo: string; mensagem: string }> = {
  aberta: {
    titulo: 'Nenhuma conversa aberta',
    mensagem:
      'Quando um aluno ou visitante escrever para o suporte, a conversa aparece aqui. Veja as respondidas para conferir se alguém ficou sem retorno.',
  },
  respondida: {
    titulo: 'Nenhuma conversa respondida',
    mensagem:
      'As conversas que a equipe respondeu e esperam o aluno ficam aqui.',
  },
  resolvida: {
    titulo: 'Nenhuma conversa resolvida',
    mensagem:
      'Ao marcar uma conversa como resolvida, ela sai da fila e vem para cá.',
  },
}

// Fila única do Atendimento: Abertas (esperam a equipe), Respondidas (esperam o aluno) e Resolvidas.
export const Route = createFileRoute('/painel/atendimento/')({
  validateSearch: (
    search: Record<string, unknown>,
  ): { estado?: EstadoDaConversa } =>
    ESTADOS.includes(search.estado as EstadoDaConversa) &&
    search.estado !== 'aberta'
      ? { estado: search.estado as EstadoDaConversa }
      : {},
  loaderDeps: ({ search }) => ({ estado: search.estado ?? 'aberta' }),
  loader: ({ deps }) => filaDoAtendimentoFn({ data: { estado: deps.estado } }),
  head: () => ({ meta: [{ title: 'Atendimento · Estúdio' }] }),
  component: Fila,
})

function Fila() {
  const { itens, contagens, avisoLigado } = Route.useLoaderData()
  const { estado = 'aberta' } = Route.useSearch()
  const { executar, ocupado } = useAcao()

  return (
    <PaginaDoPainel>
      <CabecalhoDaPagina
        titulo="Atendimento"
        contexto="Conversas dos alunos e dos visitantes que escrevem para o suporte. Qualquer pessoa da equipe responde."
      />

      <div className="flex min-h-11 items-center gap-3">
        <Checkbox
          id="aviso"
          checked={avisoLigado}
          disabled={ocupado}
          onCheckedChange={(marcado) =>
            executar(
              () =>
                definirAvisoDeAtendimentoFn({
                  data: { ligado: marcado === true },
                }),
              marcado === true
                ? 'Você vai receber o aviso por e-mail.'
                : 'Aviso por e-mail desligado.',
            )
          }
        />
        <Label htmlFor="aviso" className="text-sm leading-snug font-normal">
          Receber por e-mail o aviso de conversa nova ou mensagem de aluno
          (agrupado em 15 minutos)
        </Label>
      </div>

      <AbasDoPainel
        rotulo="Conversas por estado"
        abas={[
          {
            rotulo: `Abertas (${contagens.aberta})`,
            para: '/painel/atendimento',
            search: { estado: undefined },
          },
          {
            rotulo: `Respondidas (${contagens.respondida})`,
            para: '/painel/atendimento',
            search: { estado: 'respondida' },
          },
          {
            rotulo: `Resolvidas (${contagens.resolvida})`,
            para: '/painel/atendimento',
            search: { estado: 'resolvida' },
          },
        ]}
      />

      {itens.length === 0 ? (
        <VazioDoPainel {...VAZIO[estado]} />
      ) : (
        <Card className="gap-0 py-0">
          <ul className="divide-y">
            {itens.map((c) => (
              <li key={c.id}>
                <Link
                  to="/painel/atendimento/$conversaId"
                  params={{ conversaId: c.id }}
                  className="flex flex-col gap-2 px-4 py-3 text-foreground no-underline hover:bg-accent sm:flex-row sm:items-center sm:justify-between sm:gap-3"
                >
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="font-medium [overflow-wrap:anywhere]">
                      {c.assunto}
                    </span>
                    <span className="text-xs text-muted-foreground [overflow-wrap:anywhere]">
                      {c.alunoNome || c.alunoEmail || 'Sem nome'}
                      {c.alunoNome && c.alunoEmail ? ` (${c.alunoEmail})` : ''}
                      {c.cursoNome ? ` · ${c.cursoNome}` : ''} ·{' '}
                      {formatarDataHoraNoFuso(
                        c.ultimaMensagemEm,
                        FUSO_DA_ESCOLA,
                      )}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    {c.visitante && <Badge variant="outline">Visitante</Badge>}
                    <EstadoDaConversaBadge estado={c.estado} />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </PaginaDoPainel>
  )
}
