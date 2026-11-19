import { useState } from 'react'
import { BotaoExcluir } from '#/components/painel/botao-excluir'
import {
  AcoesDoFormulario,
  CampoDoPainel,
} from '#/components/painel/formulario'
import { ProdutosDoCurso } from '#/components/painel/produtos-do-curso'
import { useAcao } from '#/components/painel/use-acao'
import { Button } from '#/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '#/components/ui/card'
import { Input } from '#/components/ui/input'
import { excluirTurmaFn, salvarTurmaFn } from '#/lib/matricula-fns'
import type { quemCompraDoCurso } from '#/regras/curso-do-painel'
import { LIMITE_DO_NOME, validarNome } from '#/regras/formulario-do-curso'
import { textoDeAcesso } from '#/regras/grupo-de-ligacoes'
import type { ErrosDoFormulario } from '#/regras/painel'

// Prazo de acesso em dias: vazio é para sempre; senão, inteiro de 1 em diante.
function validarPrazo(texto: string): string | undefined {
  if (texto.trim() === '') return undefined
  const n = Number(texto)
  return Number.isInteger(n) && n >= 1
    ? undefined
    : 'Informe um número inteiro de dias, de 1 em diante, ou deixe vazio para acesso para sempre.'
}

type Dados = Awaited<ReturnType<typeof quemCompraDoCurso>>
type Edicao = Dados['edicoes'][number]

// Aba "Quem compra" da página do curso. Com uma só edição (o comum) mostra só os produtos e o prazo de acesso;
// com duas ou mais, um bloco por edição. No banco a edição é a turma.
export function QuemCompraDoCurso({
  cursoId,
  dados,
  podeLigar,
}: {
  cursoId: string
  dados: Dados
  podeLigar: boolean
}) {
  const { ocupado } = useAcao()
  const [criando, setCriando] = useState(false)
  const { edicoes } = dados

  const formNova = criando && (
    <FormularioDeEdicao
      cursoId={cursoId}
      titulo="Nova edição"
      onFechar={() => setCriando(false)}
    />
  )

  if (edicoes.length <= 1) {
    const unica = edicoes[0]
    return (
      <div className="flex flex-col gap-4">
        <Card>
          <CardContent className="flex flex-col gap-4">
            <ProdutosDoCurso
              ligacoes={unica?.ligacoes ?? []}
              podeLigar={podeLigar}
            />
            {unica && <LinhaDeAcesso edicao={unica} cursoId={cursoId} />}
          </CardContent>
        </Card>
        {formNova}
        {!criando && (
          <div>
            <button
              type="button"
              className="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground disabled:opacity-50"
              disabled={ocupado}
              onClick={() => setCriando(true)}
            >
              Criar edição separada
            </button>
            <p className="text-xs text-muted-foreground">
              Para uma turma com outro prazo, como a turma de março.
            </p>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {edicoes.map((e) => (
        <BlocoDaEdicao
          key={e.id}
          edicao={e}
          cursoId={cursoId}
          podeLigar={podeLigar}
        />
      ))}
      {formNova}
      {!criando && (
        <div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setCriando(true)}
          >
            Nova edição
          </Button>
        </div>
      )}
    </div>
  )
}

// "Acesso: para sempre" / "Acesso: 90 dias", editável no lugar. Vale só para matrículas novas.
function LinhaDeAcesso({
  edicao,
  cursoId,
}: {
  edicao: Edicao
  cursoId: string
}) {
  const { executar, ocupado, erros, limparErros } = useAcao()
  const [editando, setEditando] = useState(false)
  const [prazo, setPrazo] = useState(
    edicao.prazoEmDias ? String(edicao.prazoEmDias) : '',
  )

  if (!editando) {
    return (
      <p className="flex flex-wrap items-center gap-2 text-sm">
        <span>Acesso: {textoDeAcesso(edicao.prazoEmDias)}</span>
        <button
          type="button"
          className="text-muted-foreground underline underline-offset-4 hover:text-foreground toque:min-h-11"
          aria-label="Mudar o prazo de acesso"
          onClick={() => setEditando(true)}
        >
          Mudar
        </button>
      </p>
    )
  }
  return (
    <form
      noValidate
      className="flex flex-col gap-3"
      onSubmit={async (e) => {
        e.preventDefault()
        const ok = await executar(
          () =>
            salvarTurmaFn({
              data: {
                id: edicao.id,
                cursoId,
                nome: edicao.nome,
                prazoEmDias: prazo ? Number(prazo) : null,
              },
            }).then(() => true),
          'Acesso atualizado.',
          {
            validar: () => ({ prazo: validarPrazo(prazo) }),
            campoDoErro: () => 'prazo',
          },
        )
        if (ok) setEditando(false)
      }}
    >
      <CampoDoPainel
        rotulo="Acesso (dias)"
        ajuda="Sem número, o acesso é para sempre. Vale só para quem entrar depois; quem já está dentro não muda."
        erro={erros.prazo}
        className="max-w-xs"
      >
        <Input
          id={`acesso-${edicao.id}`}
          type="number"
          inputMode="numeric"
          min={1}
          step={1}
          placeholder="Para sempre"
          value={prazo}
          onChange={(e) => setPrazo(e.target.value)}
        />
      </CampoDoPainel>
      <AcoesDoFormulario
        salvar="Salvar acesso"
        ocupado={ocupado}
        erros={erros}
        className="pt-0"
        onCancelar={() => {
          limparErros()
          setEditando(false)
        }}
      />
    </form>
  )
}

function BlocoDaEdicao({
  edicao,
  cursoId,
  podeLigar,
}: {
  edicao: Edicao
  cursoId: string
  podeLigar: boolean
}) {
  const [editando, setEditando] = useState(false)
  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center gap-3">
        <CardTitle className="flex-1 text-base">{edicao.nome}</CardTitle>
        <span className="text-sm text-muted-foreground">
          Acesso: {textoDeAcesso(edicao.prazoEmDias)}
        </span>
        <span className="text-sm text-muted-foreground tabular-nums">
          {edicao.alunos} {edicao.alunos === 1 ? 'aluno' : 'alunos'}
        </span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-label={`Editar a edição ${edicao.nome}`}
          onClick={() => setEditando((v) => !v)}
        >
          Editar
        </Button>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {editando && (
          <FormularioDeEdicao
            cursoId={cursoId}
            titulo="Editar edição"
            edicao={edicao}
            podeExcluir
            onFechar={() => setEditando(false)}
          />
        )}
        <ProdutosDoCurso ligacoes={edicao.ligacoes} podeLigar={podeLigar} />
      </CardContent>
    </Card>
  )
}

// Criar ou editar uma edição (nome e prazo de acesso).
function FormularioDeEdicao({
  cursoId,
  titulo,
  edicao,
  podeExcluir = false,
  onFechar,
}: {
  cursoId: string
  titulo: string
  edicao?: Edicao
  podeExcluir?: boolean
  onFechar: () => void
}) {
  const { executar, ocupado, erros, limparErros } = useAcao()
  const [nome, setNome] = useState(edicao?.nome ?? '')
  const [prazo, setPrazo] = useState(
    edicao?.prazoEmDias ? String(edicao.prazoEmDias) : '',
  )
  const chave = edicao?.id ?? 'nova'
  return (
    <form
      aria-label={titulo}
      noValidate
      className="flex flex-col gap-4 rounded-md border bg-background p-3"
      onSubmit={async (e) => {
        e.preventDefault()
        const ok = await executar(
          () =>
            salvarTurmaFn({
              data: {
                id: edicao?.id,
                cursoId,
                nome,
                prazoEmDias: prazo ? Number(prazo) : null,
              },
            }).then(() => true),
          edicao ? 'Edição atualizada.' : 'Edição criada.',
          {
            validar: (): ErrosDoFormulario => ({
              nome: validarNome(nome, 'nome da edição'),
              prazo: validarPrazo(prazo),
            }),
            campoDoErro: (m) => (/nome/i.test(m) ? 'nome' : undefined),
          },
        )
        if (ok) onFechar()
      }}
    >
      <div className="flex flex-wrap items-start gap-4">
        <CampoDoPainel
          rotulo="Nome da edição"
          erro={erros.nome}
          className="w-full sm:w-72"
        >
          <Input
            id={`nome-da-edicao-${chave}`}
            value={nome}
            maxLength={LIMITE_DO_NOME}
            onChange={(e) => setNome(e.target.value)}
            placeholder="Ex.: Black Friday"
          />
        </CampoDoPainel>
        <CampoDoPainel
          rotulo="Acesso (dias)"
          erro={erros.prazo}
          className="w-full sm:w-44"
        >
          <Input
            id={`prazo-da-edicao-${chave}`}
            type="number"
            inputMode="numeric"
            min={1}
            step={1}
            placeholder="Para sempre"
            value={prazo}
            onChange={(e) => setPrazo(e.target.value)}
          />
        </CampoDoPainel>
      </div>
      <AcoesDoFormulario
        salvar="Salvar edição"
        ocupado={ocupado}
        erros={erros}
        className="pt-0"
        onCancelar={() => {
          limparErros()
          onFechar()
        }}
      />
      {edicao && podeExcluir && (
        <div className="w-full border-t pt-3">
          {edicao.alunos > 0 ? (
            <p className="text-sm text-muted-foreground">
              Esta edição tem {edicao.alunos}{' '}
              {edicao.alunos === 1 ? 'aluno' : 'alunos'}. Mova ou cancele as
              matrículas antes de excluir.
            </p>
          ) : (
            <BotaoExcluir
              rotulo="Excluir edição"
              titulo={`Excluir a edição ${edicao.nome}?`}
              descricao="Os produtos ligados a ela deixam de dar acesso. Isso não pode ser desfeito."
              acao="Excluir edição"
              disabled={ocupado}
              onConfirmado={() =>
                executar(
                  () =>
                    excluirTurmaFn({ data: { id: edicao.id } }).then(
                      () => true,
                    ),
                  'Edição excluída.',
                )
              }
            />
          )}
        </div>
      )}
    </form>
  )
}
