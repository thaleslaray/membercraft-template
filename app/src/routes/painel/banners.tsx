import { createFileRoute } from '@tanstack/react-router'
import { GripVertical, Pencil } from 'lucide-react'
import { useState } from 'react'
import { BotaoExcluir } from '#/components/painel/botao-excluir'
import { BotoesDeOrdem } from '#/components/painel/botoes-de-ordem'
import { CampoDeImagem } from '#/components/painel/campo-de-arquivo'
import { VazioDoPainel } from '#/components/painel/estados'
import { EtiquetaDeEstado } from '#/components/painel/etiqueta-de-estado'
import {
  AcoesDoFormulario,
  CampoDoPainel,
} from '#/components/painel/formulario'
import { CabecalhoDaPagina, PaginaDoPainel } from '#/components/painel/pagina'
import { useAcao } from '#/components/painel/use-acao'
import { Button } from '#/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '#/components/ui/card'
import { Checkbox } from '#/components/ui/checkbox'
import { Input } from '#/components/ui/input'
import { Label } from '#/components/ui/label'
import { SelectNativo } from '#/components/ui/select-nativo'
import {
  criarBannerFn,
  editarBannerFn,
  excluirBannerFn,
  painelDeBannersFn,
  pausarOuAtivarBannerFn,
  reordenarBannersFn,
} from '#/lib/banner-fns'
import { dataParaCampo, FUSO_DA_ESCOLA, formatarDataNoFuso } from '#/lib/datas'
import { urlDaImagem } from '#/lib/imagens'
import { moverNaLista, soltarNaPosicao } from '#/lib/ordem'
import type { PublicoDoBanner, SituacaoDoBanner } from '#/regras/banners'
import {
  LIMITE_DO_LINK_DO_BANNER,
  LIMITE_DO_TITULO_DO_BANNER,
  validarBanner,
} from '#/regras/formulario-do-banner'
import type { TomDeEstado } from '#/regras/painel'

export const Route = createFileRoute('/painel/banners')({
  loader: () => painelDeBannersFn(),
  head: () => ({ meta: [{ title: 'Banners · Estúdio' }] }),
  component: Banners,
})

const ROTULO_DO_PUBLICO: Record<PublicoDoBanner, string> = {
  todos: 'Todos os alunos',
  com_matricula: 'Quem tem matrícula ativa em',
  sem_matricula: 'Quem não tem matrícula ativa em',
}

const ESTADO_DA_SITUACAO: Record<
  SituacaoDoBanner,
  { rotulo: string; tom: TomDeEstado }
> = {
  ativo: { rotulo: 'No ar', tom: 'ok' },
  pausado: { rotulo: 'Pausado', tom: 'neutro' },
  agendado: { rotulo: 'Agendado', tom: 'atencao' },
  encerrado: { rotulo: 'Encerrado', tom: 'neutro' },
}

interface Formulario {
  id: string | null
  titulo: string
  imagemComputador: string | null
  imagemCelular: string | null
  link: string
  publico: PublicoDoBanner
  cursoIds: string[]
  ativo: boolean
  inicio: string
  fim: string
}

const VAZIO: Formulario = {
  id: null,
  titulo: '',
  imagemComputador: null,
  imagemCelular: null,
  link: '',
  publico: 'todos',
  cursoIds: [],
  ativo: true,
  inicio: '',
  fim: '',
}

function Banners() {
  const { banners, cursos } = Route.useLoaderData()
  const { executar, ocupado } = useAcao()
  const salvamento = useAcao()
  const [form, setForm] = useState<Formulario>(VAZIO)
  // O formulário como foi aberto (vazio ou o banner em edição): base de "Alterações não salvas".
  const [base, setBase] = useState<Formulario>(VAZIO)
  const [arrastando, setArrastando] = useState<string | null>(null)
  const ids = banners.map((b) => b.id)
  const nomeDoCurso = (id: string) =>
    cursos.find((c) => c.id === id)?.nome ?? 'curso removido'
  const alterado = JSON.stringify(form) !== JSON.stringify(base)

  function abrir(novo: Formulario) {
    setForm(novo)
    setBase(novo)
    salvamento.limparErros()
  }

  const reordenar = (novos: string[]) =>
    novos === ids
      ? undefined
      : executar(() => reordenarBannersFn({ data: { ids: novos } }))

  return (
    <PaginaDoPainel>
      <CabecalhoDaPagina
        titulo="Banners"
        contexto="O carrossel no topo da vitrine. Arraste para mudar a ordem: o primeiro aparece primeiro."
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Banners cadastrados</CardTitle>
        </CardHeader>
        <CardContent>
          {banners.length === 0 ? (
            <VazioDoPainel
              mensagem="Nenhum banner ainda. Preencha o formulário logo abaixo para criar o primeiro: ele entra no topo da vitrine."
              className="p-4 md:p-4"
            />
          ) : (
            <ul className="flex flex-col divide-y rounded-md border">
              {banners.map((b, i) => (
                <li
                  key={b.id}
                  draggable
                  onDragStart={() => setArrastando(b.id)}
                  onDragEnd={() => setArrastando(null)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => {
                    if (arrastando)
                      reordenar(soltarNaPosicao(ids, arrastando, b.id))
                    setArrastando(null)
                  }}
                  className={`flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2 ${arrastando === b.id ? 'opacity-50' : ''}`}
                >
                  <GripVertical
                    className="size-4 shrink-0 cursor-grab text-muted-foreground max-sm:hidden"
                    aria-hidden="true"
                  />
                  <img
                    src={urlDaImagem(b.imagemComputador) ?? ''}
                    alt=""
                    className="h-12 w-28 shrink-0 rounded border object-cover"
                    draggable={false}
                  />
                  <div className="flex min-w-0 flex-1 basis-40 flex-col gap-1">
                    <span className="font-medium break-words">{b.titulo}</span>
                    <span className="text-xs text-muted-foreground">
                      {b.publico === 'todos'
                        ? ROTULO_DO_PUBLICO.todos
                        : `${ROTULO_DO_PUBLICO[b.publico]} ${b.cursoIds.map(nomeDoCurso).join(', ')}`}
                      {' · '}
                      {b.inicio
                        ? formatarDataNoFuso(b.inicio, FUSO_DA_ESCOLA)
                        : 'sem início'}{' '}
                      a{' '}
                      {b.fim
                        ? formatarDataNoFuso(b.fim, FUSO_DA_ESCOLA)
                        : 'sem fim'}
                    </span>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {b.exibicoes} exibições · {b.cliques} cliques
                    </span>
                  </div>
                  <EtiquetaDeEstado {...ESTADO_DA_SITUACAO[b.situacao]} />
                  <div className="ml-auto flex flex-wrap items-center gap-1">
                    <BotoesDeOrdem
                      rotulo={`banner ${b.titulo}`}
                      naPrimeira={i === 0}
                      naUltima={i === banners.length - 1}
                      aoMover={(d) => reordenar(moverNaLista(ids, b.id, d))}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="toque:min-h-11"
                      disabled={ocupado}
                      onClick={() =>
                        executar(() =>
                          pausarOuAtivarBannerFn({
                            data: { id: b.id, ativo: !b.ativo },
                          }),
                        )
                      }
                    >
                      {b.ativo ? 'Pausar' : 'Ativar'}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      className="toque:size-11"
                      aria-label={`Editar ${b.titulo}`}
                      title={`Editar ${b.titulo}`}
                      onClick={() =>
                        abrir({
                          id: b.id,
                          titulo: b.titulo,
                          imagemComputador: b.imagemComputador,
                          imagemCelular: b.imagemCelular,
                          link: b.link ?? '',
                          publico: b.publico,
                          cursoIds: b.cursoIds,
                          ativo: b.ativo,
                          inicio: dataParaCampo(b.inicio),
                          fim: dataParaCampo(b.fim),
                        })
                      }
                    >
                      <Pencil />
                    </Button>
                    <BotaoExcluir
                      icone
                      rotulo={`Excluir ${b.titulo}`}
                      titulo="Excluir este banner?"
                      descricao={`“${b.titulo}” sai do topo da vitrine.`}
                      disabled={ocupado}
                      onConfirmado={() =>
                        executar(
                          () => excluirBannerFn({ data: { id: b.id } }),
                          'Banner excluído.',
                        )
                      }
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {form.id ? 'Editar banner' : 'Novo banner'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form
            noValidate
            className="grid gap-4 sm:grid-cols-2"
            onSubmit={async (e) => {
              e.preventDefault()
              const dados = {
                titulo: form.titulo,
                imagemComputador: form.imagemComputador ?? '',
                imagemCelular: form.imagemCelular,
                link: form.link,
                publico: form.publico,
                cursoIds: form.publico === 'todos' ? [] : form.cursoIds,
                ativo: form.ativo,
                inicio: form.inicio || undefined,
                fim: form.fim || undefined,
              }
              const ok = await salvamento.executar(
                () =>
                  (form.id
                    ? editarBannerFn({ data: { ...dados, id: form.id } })
                    : criarBannerFn({ data: dados })
                  ).then(() => true),
                form.id ? 'Banner salvo.' : 'Banner criado.',
                {
                  validar: () => validarBanner(form),
                  campoDoErro: (m) =>
                    /título/i.test(m)
                      ? 'titulo'
                      : /imagem/i.test(m)
                        ? 'imagemComputador'
                        : /curso/i.test(m)
                          ? 'cursoIds'
                          : /data|fim/i.test(m)
                            ? 'fim'
                            : /link/i.test(m)
                              ? 'link'
                              : undefined,
                },
              )
              if (ok) abrir(VAZIO)
            }}
          >
            <CampoDoPainel
              rotulo="Título (texto alternativo)"
              erro={salvamento.erros.titulo}
              className="sm:col-span-2"
            >
              <Input
                id="titulo-do-banner"
                value={form.titulo}
                maxLength={LIMITE_DO_TITULO_DO_BANNER}
                onChange={(e) => setForm({ ...form, titulo: e.target.value })}
              />
            </CampoDoPainel>
            <div className="flex flex-col gap-2">
              <CampoDeImagem
                rotulo="Imagem para computador"
                valor={form.imagemComputador}
                onChange={(chave) =>
                  setForm((f) => ({ ...f, imagemComputador: chave }))
                }
              />
              {salvamento.erros.imagemComputador ? (
                <p className="text-sm font-medium text-destructive">
                  {salvamento.erros.imagemComputador}
                </p>
              ) : null}
            </div>
            <CampoDeImagem
              rotulo="Imagem para celular (opcional)"
              valor={form.imagemCelular}
              onChange={(chave) =>
                setForm((f) => ({ ...f, imagemCelular: chave }))
              }
            />
            <CampoDoPainel
              rotulo="Link (opcional)"
              erro={salvamento.erros.link}
              className="sm:col-span-2"
            >
              <Input
                id="link-do-banner"
                placeholder="https://…"
                inputMode="url"
                autoComplete="off"
                spellCheck={false}
                maxLength={LIMITE_DO_LINK_DO_BANNER}
                value={form.link}
                onChange={(e) => setForm({ ...form, link: e.target.value })}
              />
            </CampoDoPainel>
            <CampoDoPainel rotulo="Quem vê" className="sm:col-span-2">
              <SelectNativo
                id="publico-do-banner"
                value={form.publico}
                onChange={(e) =>
                  setForm({
                    ...form,
                    publico: e.target.value as PublicoDoBanner,
                  })
                }
              >
                {(Object.keys(ROTULO_DO_PUBLICO) as PublicoDoBanner[]).map(
                  (p) => (
                    <option key={p} value={p}>
                      {ROTULO_DO_PUBLICO[p]}
                      {p === 'todos' ? '' : ' …'}
                    </option>
                  ),
                )}
              </SelectNativo>
            </CampoDoPainel>
            {form.publico !== 'todos' && (
              <fieldset className="flex flex-col gap-1 sm:col-span-2">
                <legend className="mb-1 text-sm font-medium">
                  Cursos do público
                </legend>
                {cursos.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    Cadastre um curso primeiro.
                  </p>
                )}
                {cursos.map((c) => (
                  <div
                    key={c.id}
                    className="flex min-h-8 items-center gap-2 toque:min-h-11"
                  >
                    <Checkbox
                      id={`curso-do-banner-${c.id}`}
                      checked={form.cursoIds.includes(c.id)}
                      aria-invalid={
                        salvamento.erros.cursoIds ? true : undefined
                      }
                      onCheckedChange={(marcado) =>
                        setForm({
                          ...form,
                          cursoIds:
                            marcado === true
                              ? [...form.cursoIds, c.id]
                              : form.cursoIds.filter((x) => x !== c.id),
                        })
                      }
                    />
                    <Label
                      htmlFor={`curso-do-banner-${c.id}`}
                      className="font-normal"
                    >
                      {c.nome}
                    </Label>
                  </div>
                ))}
                {salvamento.erros.cursoIds ? (
                  <p className="text-sm font-medium text-destructive">
                    {salvamento.erros.cursoIds}
                  </p>
                ) : null}
              </fieldset>
            )}
            <CampoDoPainel rotulo="Início (opcional)">
              <Input
                id="inicio-do-banner"
                type="date"
                value={form.inicio}
                onChange={(e) => setForm({ ...form, inicio: e.target.value })}
              />
            </CampoDoPainel>
            <CampoDoPainel rotulo="Fim (opcional)" erro={salvamento.erros.fim}>
              <Input
                id="fim-do-banner"
                type="date"
                value={form.fim}
                onChange={(e) => setForm({ ...form, fim: e.target.value })}
              />
            </CampoDoPainel>
            <div className="flex min-h-8 items-center gap-2 sm:col-span-2 toque:min-h-11">
              <Checkbox
                id="ativo-do-banner"
                checked={form.ativo}
                onCheckedChange={(marcado) =>
                  setForm({ ...form, ativo: marcado === true })
                }
              />
              <Label htmlFor="ativo-do-banner" className="font-normal">
                Ativo (desmarque para deixar pausado)
              </Label>
            </div>
            <AcoesDoFormulario
              className="sm:col-span-2"
              salvar={form.id ? 'Salvar banner' : 'Criar banner'}
              ocupado={salvamento.ocupado}
              alterado={alterado}
              erros={salvamento.erros}
              onCancelar={alterado || form.id ? () => abrir(VAZIO) : undefined}
            />
          </form>
        </CardContent>
      </Card>
    </PaginaDoPainel>
  )
}
