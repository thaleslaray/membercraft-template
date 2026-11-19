import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { CheckCheck } from 'lucide-react'
import {
  EstadoDaConversaBadge,
  FormularioDeMensagem,
  Mensagens,
} from '#/components/atendimento/mensagens'
import { BotaoExcluir } from '#/components/painel/botao-excluir'
import { CabecalhoDaPagina, PaginaDoPainel } from '#/components/painel/pagina'
import { useAcao } from '#/components/painel/use-acao'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import {
  conversaFn,
  excluirConversaFn,
  resolverConversaFn,
  responderComoEquipeFn,
} from '#/lib/atendimento-fns'
import { toast } from '#/lib/toast'

// Uma conversa na visão da equipe: responder (por e-mail e pela área), resolver e excluir.
export const Route = createFileRoute('/painel/atendimento/$conversaId')({
  loader: ({ params }) =>
    conversaFn({ data: { conversaId: params.conversaId } }),
  head: () => ({ meta: [{ title: 'Conversa · Estúdio' }] }),
  component: Conversa,
})

function Conversa() {
  const conversa = Route.useLoaderData()
  const navigate = useNavigate()
  const { executar, ocupado } = useAcao()

  async function responder(mensagem: {
    texto: string
    anexos: string[]
    chaveDeEnvio: string
  }) {
    const feito = await executar(
      () =>
        responderComoEquipeFn({
          data: { conversaId: conversa.id, ...mensagem },
        }),
      conversa.visitante ? 'Resposta enviada por e-mail.' : 'Resposta enviada.',
    )
    return feito !== undefined
  }

  async function excluir() {
    const feito = await executar(() =>
      excluirConversaFn({ data: { conversaId: conversa.id } }),
    )
    if (feito !== undefined) {
      toast.success('Conversa excluída.')
      await navigate({ to: '/painel/atendimento' })
    }
  }

  return (
    <PaginaDoPainel>
      <CabecalhoDaPagina
        titulo={conversa.assunto}
        voltar={{ rotulo: 'Atendimento', to: '/painel/atendimento' }}
        contexto={
          <span className="[overflow-wrap:anywhere]">
            {conversa.alunoNome || conversa.alunoEmail || 'Sem nome'}
            {conversa.alunoNome && conversa.alunoEmail
              ? ` (${conversa.alunoEmail})`
              : ''}
            {conversa.cursoNome ? ` · ${conversa.cursoNome}` : ''}
          </span>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        {conversa.visitante && <Badge variant="outline">Visitante</Badge>}
        <EstadoDaConversaBadge estado={conversa.estado} />
        {conversa.estado !== 'resolvida' && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="toque:min-h-11"
            disabled={ocupado}
            onClick={() =>
              executar(
                () => resolverConversaFn({ data: { conversaId: conversa.id } }),
                'Conversa resolvida.',
              )
            }
          >
            <CheckCheck />
            Marcar como resolvida
          </Button>
        )}
        <BotaoExcluir
          rotulo="Excluir conversa"
          titulo="Excluir esta conversa?"
          descricao="Ela some das telas e é apagada de vez em 30 dias."
          disabled={ocupado}
          onConfirmado={excluir}
        />
      </div>

      <Mensagens mensagens={conversa.mensagens} />

      <section aria-labelledby="responder" className="flex flex-col gap-2">
        <h2 id="responder" className="text-sm font-medium">
          {conversa.visitante
            ? 'Sua resposta (vai por e-mail, porque é um visitante)'
            : 'Sua resposta (o aluno recebe por e-mail e vê na área)'}
        </h2>
        <FormularioDeMensagem
          rotuloDoBotao="Responder"
          aoEnviar={responder}
          ocupado={ocupado}
        />
      </section>
    </PaginaDoPainel>
  )
}
