import { createFileRoute, Link } from '@tanstack/react-router'
import { Lock, Pencil } from 'lucide-react'
import { useState } from 'react'
import {
  ICONES,
  IconeDaComunidade,
} from '#/components/comunidade/icone-da-comunidade'
import { BotaoExcluir } from '#/components/painel/botao-excluir'
import { VazioDoPainel } from '#/components/painel/estados'
import {
  AcoesDoFormulario,
  CampoDoPainel,
} from '#/components/painel/formulario'
import { CabecalhoDaPagina, PaginaDoPainel } from '#/components/painel/pagina'
import { useAcao } from '#/components/painel/use-acao'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '#/components/ui/card'
import { Checkbox } from '#/components/ui/checkbox'
import { Input } from '#/components/ui/input'
import { Label } from '#/components/ui/label'
import { RadioGroup, RadioGroupItem } from '#/components/ui/radio-group'
import { Textarea } from '#/components/ui/textarea'
import {
  excluirComunidadeFn,
  painelDeComunidadesFn,
  salvarComunidadeFn,
} from '#/lib/comunidade-fns'
import { cn } from '#/lib/utils'
import {
  CORES_DA_COMUNIDADE,
  ICONES_DA_COMUNIDADE,
  NOMES_DAS_CORES_DA_COMUNIDADE,
} from '#/regras/comunidade-constantes'
import type { ErrosDoFormulario } from '#/regras/painel'

// Comunidades da Equipe: nome, ícone e cor, públicas ou restritas a turmas, e "só a equipe publica".
export const Route = createFileRoute('/painel/comunidades')({
  loader: () => painelDeComunidadesFn(),
  head: () => ({ meta: [{ title: 'Comunidades · Estúdio' }] }),
  component: Comunidades,
})

interface Formulario {
  id: string | null
  nome: string
  descricao: string
  icone: string
  cor: string
  soEquipePublica: boolean
  restrita: boolean
  turmaIds: string[]
}

const VAZIO: Formulario = {
  id: null,
  nome: '',
  descricao: '',
  icone: ICONES_DA_COMUNIDADE[0],
  cor: CORES_DA_COMUNIDADE[0],
  soEquipePublica: false,
  restrita: false,
  turmaIds: [],
}

function Comunidades() {
  const { comunidades, turmas } = Route.useLoaderData()
  const { executar, ocupado, erros } = useAcao()
  const [form, setForm] = useState<Formulario>(VAZIO)
  // O que o formulário tinha ao abrir (novo ou em edição): serve para avisar de alteração não salva.
  const [base, setBase] = useState<Formulario>(VAZIO)
  const alterado = JSON.stringify(form) !== JSON.stringify(base)
  const abrir = (f: Formulario) => {
    setForm(f)
    setBase(f)
  }

  function validar(): ErrosDoFormulario {
    return {
      nome: form.nome.trim() ? undefined : 'Informe o nome da comunidade.',
      turmas:
        form.restrita && form.turmaIds.length === 0
          ? 'Escolha ao menos uma turma, ou deixe a comunidade pública.'
          : undefined,
    }
  }
  const nomeDaTurma = (id: string) => {
    const t = turmas.find((x) => x.id === id)
    return t ? `${t.cursoNome} · ${t.nome}` : 'turma removida'
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault()
    const resultado = await executar(
      () =>
        salvarComunidadeFn({
          data: {
            id: form.id,
            dados: {
              nome: form.nome,
              descricao: form.descricao || null,
              icone: form.icone as (typeof ICONES_DA_COMUNIDADE)[number],
              cor: form.cor as (typeof CORES_DA_COMUNIDADE)[number],
              soEquipePublica: form.soEquipePublica,
              turmaIds: form.restrita ? form.turmaIds : [],
            },
          },
        }).then(() => true),
      form.id ? 'Comunidade salva.' : 'Comunidade criada.',
      { validar },
    )
    if (resultado) abrir(VAZIO)
  }

  const alternarTurma = (id: string, marcada: boolean) =>
    setForm((f) => ({
      ...f,
      turmaIds: marcada
        ? [...f.turmaIds, id]
        : f.turmaIds.filter((t) => t !== id),
    }))

  return (
    <PaginaDoPainel>
      <CabecalhoDaPagina
        titulo="Comunidades"
        contexto="Os fóruns dos alunos: públicos ou restritos a turmas."
        acao={
          <Button asChild variant="outline">
            <Link to="/painel/aguardando-resposta">Aguardando resposta</Link>
          </Button>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {form.id ? 'Editar comunidade' : 'Nova comunidade'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form noValidate onSubmit={salvar} className="flex flex-col gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <CampoDoPainel rotulo="Nome" erro={erros.nome}>
                <Input
                  id="comunidade-nome"
                  value={form.nome}
                  maxLength={80}
                  onChange={(e) => setForm({ ...form, nome: e.target.value })}
                />
              </CampoDoPainel>
              <CampoDoPainel rotulo="Descrição (opcional)">
                <Textarea
                  id="comunidade-descricao"
                  value={form.descricao}
                  maxLength={300}
                  className="min-h-9"
                  onChange={(e) =>
                    setForm({ ...form, descricao: e.target.value })
                  }
                />
              </CampoDoPainel>
            </div>

            <fieldset className="flex flex-col gap-2">
              <legend className="text-sm font-medium">Ícone</legend>
              <div className="flex flex-wrap gap-2">
                {ICONES_DA_COMUNIDADE.map((chave) => {
                  const Icone = ICONES[chave].icone
                  return (
                    <button
                      key={chave}
                      type="button"
                      aria-label={ICONES[chave].rotulo}
                      aria-pressed={form.icone === chave}
                      title={ICONES[chave].rotulo}
                      onClick={() => setForm({ ...form, icone: chave })}
                      className={cn(
                        'grid size-9 place-items-center rounded-md border text-muted-foreground transition-colors hover:bg-accent toque:size-11',
                        form.icone === chave &&
                          'border-primary bg-accent text-foreground',
                      )}
                    >
                      <Icone className="size-4" />
                    </button>
                  )
                })}
              </div>
            </fieldset>

            <fieldset className="flex flex-col gap-2">
              <legend className="text-sm font-medium">Cor</legend>
              <div className="flex flex-wrap gap-2">
                {CORES_DA_COMUNIDADE.map((cor) => (
                  <button
                    key={cor}
                    type="button"
                    aria-label={`Cor ${NOMES_DAS_CORES_DA_COMUNIDADE[cor]}`}
                    title={NOMES_DAS_CORES_DA_COMUNIDADE[cor]}
                    aria-pressed={form.cor === cor}
                    onClick={() => setForm({ ...form, cor })}
                    style={{ backgroundColor: cor }}
                    className={cn(
                      'size-7 rounded-full border-2 border-transparent toque:size-11',
                      form.cor === cor && 'ring-2 ring-ring ring-offset-2',
                    )}
                  />
                ))}
              </div>
            </fieldset>

            <div className="flex min-h-11 items-center gap-2">
              <Checkbox
                id="comunidade-so-equipe"
                checked={form.soEquipePublica}
                onCheckedChange={(v) =>
                  setForm({ ...form, soEquipePublica: v === true })
                }
              />
              <Label htmlFor="comunidade-so-equipe">
                Só a equipe publica (os alunos comentam)
              </Label>
            </div>

            <fieldset className="flex flex-col gap-2">
              <legend className="text-sm font-medium">Quem participa</legend>
              <RadioGroup
                aria-label="Quem participa"
                value={form.restrita ? 'restrita' : 'publica'}
                onValueChange={(v) =>
                  setForm({ ...form, restrita: v === 'restrita' })
                }
              >
                <div className="flex min-h-11 items-center gap-2">
                  <RadioGroupItem value="publica" id="comunidade-publica" />
                  <Label htmlFor="comunidade-publica">
                    Pública: todo aluno com matrícula ativa
                  </Label>
                </div>
                <div className="flex min-h-11 items-center gap-2">
                  <RadioGroupItem value="restrita" id="comunidade-restrita" />
                  <Label htmlFor="comunidade-restrita">
                    Restrita: só alunos de turmas escolhidas
                  </Label>
                </div>
              </RadioGroup>
              {form.restrita && (
                <ul className="ml-6 flex max-h-48 flex-col gap-1.5 overflow-auto">
                  {turmas.length === 0 && (
                    <li className="text-sm text-muted-foreground">
                      Nenhuma turma cadastrada ainda.
                    </li>
                  )}
                  {turmas.map((t) => (
                    <li key={t.id} className="flex min-h-11 items-center gap-2">
                      <Checkbox
                        id={`turma-${t.id}`}
                        checked={form.turmaIds.includes(t.id)}
                        onCheckedChange={(v) => alternarTurma(t.id, v === true)}
                      />
                      <Label htmlFor={`turma-${t.id}`}>
                        {t.cursoNome} · {t.nome}
                      </Label>
                    </li>
                  ))}
                </ul>
              )}
              {erros.turmas ? (
                <p
                  id="erro-turmas"
                  role="alert"
                  className="text-sm font-medium text-destructive"
                >
                  {erros.turmas}
                </p>
              ) : null}
            </fieldset>

            <AcoesDoFormulario
              salvar={form.id ? 'Salvar comunidade' : 'Criar comunidade'}
              ocupado={ocupado}
              alterado={alterado}
              erros={erros}
              onCancelar={form.id ? () => abrir(VAZIO) : undefined}
            />
          </form>
        </CardContent>
      </Card>

      {comunidades.length === 0 ? (
        <VazioDoPainel
          titulo="Nenhuma comunidade ainda"
          mensagem="Crie a primeira no formulário acima: escolha nome, ícone e cor, e diga se é pública ou restrita a turmas."
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {comunidades.map((c) => (
            <li key={c.id}>
              <Card>
                <CardContent className="flex flex-wrap items-center gap-3">
                  <IconeDaComunidade icone={c.icone} cor={c.cor} />
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="font-medium [overflow-wrap:anywhere]">
                      {c.nome}
                    </span>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      {c.turmaIds.length === 0 ? (
                        <Badge variant="secondary">Pública</Badge>
                      ) : (
                        <Badge
                          variant="outline"
                          className="h-auto max-w-full items-start rounded-lg py-1 text-left leading-snug whitespace-normal [overflow-wrap:anywhere]"
                        >
                          <Lock aria-hidden="true" className="mt-0.5" />
                          {c.turmaIds.map(nomeDaTurma).join(', ')}
                        </Badge>
                      )}
                      {c.soEquipePublica && (
                        <Badge variant="outline">Só a equipe publica</Badge>
                      )}
                      <span>
                        {c.publicacoes}{' '}
                        {c.publicacoes === 1 ? 'publicação' : 'publicações'}
                      </span>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="toque:size-11"
                      aria-label={`Editar ${c.nome}`}
                      onClick={() =>
                        abrir({
                          id: c.id,
                          nome: c.nome,
                          descricao: c.descricao ?? '',
                          icone: c.icone,
                          cor: c.cor,
                          soEquipePublica: c.soEquipePublica,
                          restrita: c.turmaIds.length > 0,
                          turmaIds: c.turmaIds,
                        })
                      }
                    >
                      <Pencil />
                    </Button>
                    <BotaoExcluir
                      icone
                      rotulo={`Excluir ${c.nome}`}
                      titulo={`Excluir “${c.nome}”?`}
                      descricao="A comunidade e as publicações dela somem das telas. O conteúdo fica guardado por 30 dias antes de ser apagado de vez."
                      disabled={ocupado}
                      onConfirmado={() =>
                        executar(
                          () => excluirComunidadeFn({ data: { id: c.id } }),
                          'Comunidade excluída.',
                        )
                      }
                    />
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
