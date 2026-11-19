import { useState } from 'react'
import { VazioDoPainel } from '#/components/painel/estados'
import {
  AcoesDoFormulario,
  CampoDoPainel,
} from '#/components/painel/formulario'
import { LinhaDeLigacao } from '#/components/painel/linha-de-ligacao'
import { useAcao } from '#/components/painel/use-acao'
import { Card, CardContent, CardHeader } from '#/components/ui/card'
import { Input } from '#/components/ui/input'
import { SelectNativo } from '#/components/ui/select-nativo'
import {
  atualizarLigacaoFn,
  ligarProdutoFn,
  removerLigacaoFn,
  type vendasDaVoompFn,
} from '#/lib/vendas-fns'

export function LigacoesDaVoomp({
  dados,
}: {
  dados: Awaited<ReturnType<typeof vendasDaVoompFn>>
}) {
  const { ligacoes, turmas, produtos } = dados
  const { executar, ocupado, erros } = useAcao()
  const [produtoId, setProdutoId] = useState('')
  const [ofertaHash, setOfertaHash] = useState('')
  const [turmaId, setTurmaId] = useState('')
  const [prazo, setPrazo] = useState('')

  const prazoNumero = prazo.trim() === '' ? null : Number(prazo)

  function validar() {
    return {
      produtoId: produtoId.trim()
        ? undefined
        : 'Informe o id do Produto da Voomp.',
      turmaId: turmaId ? undefined : 'Escolha a turma.',
      prazo:
        prazoNumero === null ||
        (Number.isInteger(prazoNumero) && prazoNumero >= 1)
          ? undefined
          : 'O prazo é um número inteiro de dias, a partir de 1.',
    }
  }

  return (
    <Card>
      <CardHeader>
        <h3 className="text-base leading-snug font-semibold">
          Produtos da Voomp ligados a turmas
        </h3>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <p className="text-sm text-muted-foreground">
          Cada venda paga de um Produto da Voomp matricula o aluno nas turmas
          ligadas. Uma oferta libera o que está ligado a ela mais o que está
          ligado a todas as ofertas do produto. O prazo da ligação vale no lugar
          do prazo da turma; sem prazo, vale o da turma. Ao ligar, as vendas que
          esperavam turma viram matrícula na hora.
        </p>
        {ligacoes.length === 0 ? (
          <VazioDoPainel
            titulo="Nenhuma ligação ainda"
            mensagem="Ligue um Produto da Voomp a uma turma no formulário abaixo: a próxima venda paga já matricula o aluno."
          />
        ) : (
          <ul className="flex flex-col divide-y rounded-md border">
            {ligacoes.map((l) => (
              <LinhaDeLigacao
                key={l.id}
                ligacao={l}
                turmas={turmas}
                salvar={(dados) => atualizarLigacaoFn({ data: dados })}
                remover={(id) => removerLigacaoFn({ data: { id } })}
                identificacao={
                  <>
                    <span className="font-medium">Produto {l.produtoId}</span>
                    <span className="text-muted-foreground">
                      {l.ofertaHash
                        ? `oferta ${l.ofertaHash}`
                        : 'todas as ofertas'}
                    </span>
                  </>
                }
              />
            ))}
          </ul>
        )}

        <form
          noValidate
          className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
          onSubmit={async (e) => {
            e.preventDefault()
            const r = await executar(
              () =>
                ligarProdutoFn({
                  data: {
                    produtoId,
                    ofertaHash,
                    turmaId,
                    prazoEmDias: prazoNumero,
                  },
                }),
              'Produto ligado à turma.',
              { validar },
            )
            if (r) {
              // Salvou: o formulário volta limpo, senão ele conta como "não salvo" ao sair da tela.
              setProdutoId('')
              setOfertaHash('')
              setTurmaId('')
              setPrazo('')
            }
          }}
        >
          <CampoDoPainel rotulo="Id do Produto da Voomp" erro={erros.produtoId}>
            <Input
              id="produto-da-voomp"
              list="produtos-vistos"
              autoComplete="off"
              spellCheck={false}
              value={produtoId}
              onChange={(e) => setProdutoId(e.target.value)}
            />
          </CampoDoPainel>
          <datalist id="produtos-vistos">
            {[...new Set(produtos.map((p) => p.produtoId))].map((id) => (
              <option key={id} value={id}>
                {produtos.find((p) => p.produtoId === id)?.produtoNome ?? ''}
              </option>
            ))}
          </datalist>
          <CampoDoPainel rotulo="Código da oferta (opcional)">
            <Input
              id="oferta-da-voomp"
              list="ofertas-vistas"
              autoComplete="off"
              spellCheck={false}
              placeholder="Todas as ofertas"
              value={ofertaHash}
              onChange={(e) => setOfertaHash(e.target.value)}
            />
          </CampoDoPainel>
          <datalist id="ofertas-vistas">
            {produtos
              .filter((p) => p.produtoId === produtoId && p.ofertaHash)
              .map((p) => (
                <option key={p.ofertaHash} value={p.ofertaHash ?? ''} />
              ))}
          </datalist>
          <CampoDoPainel rotulo="Turma" erro={erros.turmaId}>
            <SelectNativo
              id="turma-da-ligacao"
              value={turmaId}
              onChange={(e) => setTurmaId(e.target.value)}
            >
              <option value="">Escolha a turma</option>
              {turmas.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.cursoNome} · {t.nome}
                </option>
              ))}
            </SelectNativo>
          </CampoDoPainel>
          <CampoDoPainel rotulo="Prazo de acesso (dias)" erro={erros.prazo}>
            <Input
              id="prazo-da-ligacao"
              type="number"
              inputMode="numeric"
              min={1}
              step={1}
              placeholder="Prazo da turma"
              value={prazo}
              onChange={(e) => setPrazo(e.target.value)}
            />
          </CampoDoPainel>
          <div className="sm:col-span-2 lg:col-span-4">
            <AcoesDoFormulario
              salvar="Ligar à turma"
              ocupado={ocupado}
              erros={erros}
              alterado={
                produtoId.trim() !== '' ||
                ofertaHash !== '' ||
                turmaId !== '' ||
                prazo !== ''
              }
            />
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
