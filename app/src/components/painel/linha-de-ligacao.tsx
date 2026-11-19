import { type ReactNode, useState } from 'react'
import { BotaoExcluir } from '#/components/painel/botao-excluir'
import { CampoDoPainel } from '#/components/painel/formulario'
import { useAcao } from '#/components/painel/use-acao'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { SelectNativo } from '#/components/ui/select-nativo'

export interface LigacaoDaLista {
  id: string
  produtoId: string
  turmaId: string
  turmaNome: string
  cursoNome: string
  prazoEmDias: number | null
}

export interface TurmaParaLigar {
  id: string
  nome: string
  cursoNome: string
}

interface Props {
  ligacao: LigacaoDaLista
  /** Identificação do produto/oferta, que muda de tela para tela. */
  identificacao: ReactNode
  turmas: TurmaParaLigar[]
  salvar: (dados: {
    id: string
    turmaId: string
    prazoEmDias: number | null
  }) => Promise<unknown>
  remover: (id: string) => Promise<unknown>
}

// Linha de uma ligação de venda (Voomp e Hotmart): mostra, edita (turma e prazo) e remove.
export function LinhaDeLigacao({
  ligacao: l,
  identificacao,
  turmas,
  salvar,
  remover,
}: Props) {
  const { executar, ocupado } = useAcao()
  const [editando, setEditando] = useState(false)
  const [turmaId, setTurmaId] = useState(l.turmaId)
  const [prazo, setPrazo] = useState(l.prazoEmDias ? String(l.prazoEmDias) : '')

  function abrir() {
    setTurmaId(l.turmaId)
    setPrazo(l.prazoEmDias ? String(l.prazoEmDias) : '')
    setEditando(true)
  }

  if (editando) {
    return (
      <li className="px-3 py-2 text-sm">
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={async (e) => {
            e.preventDefault()
            const ok = await executar(
              () =>
                salvar({
                  id: l.id,
                  turmaId,
                  prazoEmDias: prazo ? Number(prazo) : null,
                }).then(() => true),
              'Ligação atualizada.',
            )
            if (ok) setEditando(false)
          }}
        >
          <div className="flex w-full flex-col gap-1 font-medium">
            {identificacao}
          </div>
          <CampoDoPainel rotulo="Turma da ligação" className="w-full sm:w-72">
            <SelectNativo
              id={`turma-${l.id}`}
              value={turmaId}
              onChange={(e) => setTurmaId(e.target.value)}
            >
              {turmas.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.cursoNome} · {t.nome}
                </option>
              ))}
            </SelectNativo>
          </CampoDoPainel>
          <CampoDoPainel
            rotulo="Prazo da ligação (dias)"
            className="w-full sm:w-44"
          >
            <Input
              id={`prazo-${l.id}`}
              type="number"
              inputMode="numeric"
              min={1}
              step={1}
              placeholder="Prazo da turma"
              value={prazo}
              onChange={(e) => setPrazo(e.target.value)}
            />
          </CampoDoPainel>
          <Button
            type="submit"
            size="sm"
            disabled={ocupado || !turmaId}
            className="toque:min-h-11"
          >
            Salvar
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={ocupado}
            className="toque:min-h-11"
            onClick={() => setEditando(false)}
          >
            Cancelar
          </Button>
        </form>
      </li>
    )
  }

  return (
    <li className="flex flex-wrap items-center gap-3 px-3 py-2 text-sm">
      {identificacao}
      <span className="min-w-0 flex-1 basis-48 break-words">
        {l.cursoNome} · {l.turmaNome}
      </span>
      <span className="text-muted-foreground">
        {l.prazoEmDias ? `${l.prazoEmDias} dias de acesso` : 'prazo da turma'}
      </span>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={ocupado}
        className="toque:min-h-11"
        aria-label={`Editar a ligação do produto ${l.produtoId} com ${l.turmaNome}`}
        onClick={abrir}
      >
        Editar
      </Button>
      <BotaoExcluir
        icone
        disabled={ocupado}
        rotulo={`Remover a ligação do produto ${l.produtoId} com ${l.turmaNome}`}
        titulo="Remover esta ligação?"
        descricao={`Vendas novas do produto ${l.produtoId} deixam de matricular na turma ${l.turmaNome}. As matrículas que já existem continuam como estão.`}
        acao="Remover ligação"
        onConfirmado={() => executar(() => remover(l.id), 'Ligação removida.')}
      />
    </li>
  )
}
