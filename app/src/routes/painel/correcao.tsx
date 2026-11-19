import { createFileRoute } from '@tanstack/react-router'
import { Check, X } from 'lucide-react'
import { useState } from 'react'
import { AbasDoPainel } from '#/components/painel/abas'
import { RespostaDaPergunta, rotuloDoTipo } from '#/components/painel/entrega'
import { VazioDoPainel } from '#/components/painel/estados'
import { EtiquetaDeEstado } from '#/components/painel/etiqueta-de-estado'
import { CabecalhoDaPagina, PaginaDoPainel } from '#/components/painel/pagina'
import { useAcao } from '#/components/painel/use-acao'
import { Button } from '#/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '#/components/ui/card'
import { Textarea } from '#/components/ui/textarea'
import { FUSO_DA_ESCOLA, formatarDataHoraNoFuso } from '#/lib/datas'
import {
  corrigirRespostaFn,
  filaDeCorrecaoFn,
  liberarTentativaFn,
  semTentativasFn,
} from '#/lib/quiz-correcao-fns'
import type { PerguntaDaEntrega } from '#/regras/entregas-do-painel'
import type { ItemDaFila, RespostaNaFila } from '#/regras/quiz-correcao'

// Fila "Aguardando correção" (#52): as respostas abertas dos quizzes, que a equipe marca como
// certas ou erradas, com comentário opcional. A outra aba lista quem esgotou as tentativas, para
// "liberar nova tentativa".
type Aba = 'fila' | 'tentativas'

export const Route = createFileRoute('/painel/correcao')({
  validateSearch: (search: Record<string, unknown>): { aba?: 'tentativas' } =>
    search.aba === 'tentativas' ? { aba: 'tentativas' } : {},
  loader: async () => {
    const [fila, semTentativas] = await Promise.all([
      filaDeCorrecaoFn(),
      semTentativasFn(),
    ])
    return { fila, semTentativas }
  },
  head: () => ({ meta: [{ title: 'Correção de exercícios · Estúdio' }] }),
  component: Correcao,
})

const dataHora = {
  format: (data: Date) => formatarDataHoraNoFuso(data, FUSO_DA_ESCOLA),
}

type Marcacao = Pick<RespostaNaFila, 'situacao' | 'comentario'>

function Correcao() {
  const { fila: filaDoServidor, semTentativas } = Route.useLoaderData()
  const { aba } = Route.useSearch()
  // O que a Equipe acabou de marcar vale na tela na hora, sem esperar a releitura da fila: o
  // `corrigirRespostaFn` já devolve se a tentativa fechou, então não dependemos de a leitura
  // seguinte vir fresca (cache, réplica do D1 atrasada). Quando ela vem, concorda com isto.
  const [marcadas, setMarcadas] = useState<Record<string, Marcacao>>({})
  const [fechadas, setFechadas] = useState<ReadonlySet<string>>(new Set())
  const fila: ItemDaFila[] = filaDoServidor
    .filter((item) => !fechadas.has(item.tentativaId))
    .map((item) => ({
      ...item,
      respostas: item.respostas.map((r) => ({ ...r, ...marcadas[r.id] })),
    }))
  const aoMarcar = (
    tentativaId: string,
    respostaId: string,
    marcacao: Marcacao,
    fechou: boolean,
  ) => {
    setMarcadas((atual) => ({ ...atual, [respostaId]: marcacao }))
    if (fechou) setFechadas((atual) => new Set(atual).add(tentativaId))
  }
  const atual: Aba = aba === 'tentativas' ? 'tentativas' : 'fila'

  return (
    <PaginaDoPainel>
      <CabecalhoDaPagina
        titulo="Correção de exercícios"
        contexto="Entregas de texto e de arquivo dos exercícios. Marque cada resposta como certa ou errada; quando a última for marcada, o aluno recebe a nota."
      />

      <AbasDoPainel
        rotulo="Seções da Correção de exercícios"
        abas={[
          {
            rotulo: `Aguardando correção (${fila.length})`,
            para: '/painel/correcao',
            search: { aba: undefined },
          },
          {
            rotulo: `Sem tentativas (${semTentativas.length})`,
            para: '/painel/correcao',
            search: { aba: 'tentativas' },
          },
        ]}
      />

      {atual === 'fila' ? (
        fila.length === 0 ? (
          <VazioDoPainel
            titulo="Nada para corrigir"
            mensagem="Todas as entregas estão em dia. Quando um aluno enviar texto ou arquivo num exercício, a entrega aparece aqui."
          />
        ) : (
          <ul className="flex flex-col gap-4">
            {fila.map((item) => (
              <li key={item.tentativaId}>
                <Card>
                  <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
                    <CardTitle className="text-base">
                      {item.aulaTitulo}
                      <span className="block text-xs font-normal text-muted-foreground">
                        {item.cursoNome}
                      </span>
                    </CardTitle>
                    <div className="min-w-0 text-xs text-muted-foreground sm:text-right">
                      <p className="[overflow-wrap:anywhere]">
                        {item.alunoNome} ({item.alunoEmail})
                      </p>
                      <p>
                        Tentativa {item.numero} ·{' '}
                        {dataHora.format(item.enviadaEm)}
                      </p>
                    </div>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-4">
                    {item.perguntas.map((p) => {
                      const r = item.respostas.find(
                        (x) => x.perguntaId === p.id,
                      )
                      return r ? (
                        <RespostaParaCorrigir
                          key={p.id}
                          pergunta={p}
                          resposta={r}
                          tentativaId={item.tentativaId}
                          aoMarcar={aoMarcar}
                        />
                      ) : (
                        <PerguntaSoParaLer key={p.id} pergunta={p} />
                      )
                    })}
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        )
      ) : semTentativas.length === 0 ? (
        <VazioDoPainel
          titulo="Ninguém está sem tentativas"
          mensagem="Quem reprovar e esgotar as tentativas de um exercício aparece aqui, para você liberar uma nova."
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {semTentativas.map((s) => (
            <li key={`${s.quizId}:${s.alunoId}`}>
              <LinhaSemTentativas linha={s} />
            </li>
          ))}
        </ul>
      )}
    </PaginaDoPainel>
  )
}

// Pergunta de escolha: a Equipe só vê o que a aluna marcou; a correção é automática.
function PerguntaSoParaLer({ pergunta }: { pergunta: PerguntaDaEntrega }) {
  return (
    <section
      aria-label={pergunta.enunciado}
      className="flex flex-col gap-3 rounded-md border bg-surface p-4"
    >
      <h3 className="min-w-0 text-sm font-semibold [overflow-wrap:anywhere]">
        {pergunta.enunciado}
        <span className="block text-xs font-normal text-muted-foreground">
          {rotuloDoTipo(pergunta.tipo)}
          {pergunta.tipo === 'texto_livre' || pergunta.tipo === 'arquivo'
            ? ' · opcional, sem resposta'
            : ' · corrigida automaticamente'}
        </span>
      </h3>
      <RespostaDaPergunta pergunta={pergunta} />
    </section>
  )
}

function RespostaParaCorrigir({
  pergunta,
  resposta,
  tentativaId,
  aoMarcar,
}: {
  pergunta: PerguntaDaEntrega
  resposta: RespostaNaFila
  tentativaId: string
  aoMarcar: (
    tentativaId: string,
    respostaId: string,
    marcacao: Marcacao,
    fechou: boolean,
  ) => void
}) {
  const { executar, ocupado } = useAcao()
  const [comentario, setComentario] = useState(resposta.comentario ?? '')

  const marcar = (correta: boolean) =>
    executar(
      async () => {
        const resultado = await corrigirRespostaFn({
          data: { respostaId: resposta.id, correta, comentario },
        })
        // Antes de a fila ser lida de novo: a tela já mostra o que foi marcado.
        aoMarcar(
          tentativaId,
          resposta.id,
          {
            situacao: correta ? 'certa' : 'errada',
            comentario: comentario.trim() || null,
          },
          resultado.fechada,
        )
        return resultado
      },
      ({ fechada, estado }) => {
        const marcada = correta ? 'Marcada como certa.' : 'Marcada como errada.'
        if (!fechada) return marcada
        return `${marcada} Correção concluída: ${estado === 'aprovada' ? 'aprovada' : 'reprovada'}.`
      },
    )

  return (
    <section
      aria-label={resposta.enunciado}
      className="flex flex-col gap-3 rounded-md border bg-surface p-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="min-w-0 text-sm font-semibold [overflow-wrap:anywhere]">
          {resposta.enunciado}
          <span className="block text-xs font-normal text-muted-foreground">
            {rotuloDoTipo(resposta.tipo)}
          </span>
        </h3>
        {resposta.situacao !== 'pendente' && (
          <EtiquetaDeEstado
            tom={resposta.situacao === 'certa' ? 'ok' : 'perigo'}
            rotulo={resposta.situacao === 'certa' ? 'Certa' : 'Errada'}
          />
        )}
      </div>
      <RespostaDaPergunta pergunta={pergunta} />
      <Textarea
        aria-label={`Comentário sobre: ${resposta.enunciado}`}
        placeholder="Comentário para o aluno (opcional)"
        rows={2}
        maxLength={2000}
        value={comentario}
        onChange={(e) => setComentario(e.target.value)}
      />
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          className="toque:min-h-11"
          disabled={ocupado}
          onClick={() => marcar(true)}
        >
          <Check />
          Certa
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="toque:min-h-11"
          disabled={ocupado}
          onClick={() => marcar(false)}
        >
          <X />
          Errada
        </Button>
      </div>
    </section>
  )
}

function LinhaSemTentativas({
  linha,
}: {
  linha: {
    quizId: string
    alunoId: string
    alunoNome: string
    alunoEmail: string
    aulaTitulo: string
    cursoNome: string
    tentativas: number
    ultimaEm: Date
    ultimoPercentual: number
  }
}) {
  const { executar, ocupado } = useAcao()
  return (
    <Card>
      <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-6">
        <div className="min-w-0 text-sm [overflow-wrap:anywhere]">
          <p className="font-medium">
            {linha.alunoNome}{' '}
            <span className="font-normal text-muted-foreground">
              ({linha.alunoEmail})
            </span>
          </p>
          <p className="text-muted-foreground">
            {linha.aulaTitulo} · {linha.cursoNome}
          </p>
          <p className="text-xs text-muted-foreground">
            {linha.tentativas}{' '}
            {linha.tentativas === 1 ? 'tentativa' : 'tentativas'}, última com{' '}
            {linha.ultimoPercentual}% em {dataHora.format(linha.ultimaEm)}
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="toque:min-h-11"
          disabled={ocupado}
          onClick={() =>
            executar(
              () =>
                liberarTentativaFn({
                  data: { quizId: linha.quizId, alunoId: linha.alunoId },
                }),
              'Tentativa liberada.',
            )
          }
        >
          Liberar nova tentativa
        </Button>
      </CardContent>
    </Card>
  )
}
