import {
  createFileRoute,
  Link,
  notFound,
  useNavigate,
} from '@tanstack/react-router'
import { ChevronRight, Pencil } from 'lucide-react'
import { useState } from 'react'
import { AbasDoPainel } from '#/components/painel/abas'
import { BotaoExcluir } from '#/components/painel/botao-excluir'
import { BotoesDeOrdem } from '#/components/painel/botoes-de-ordem'
import { CampoDeImagem } from '#/components/painel/campo-de-arquivo'
import { VazioDoPainel } from '#/components/painel/estados'
import { EtiquetaDeEstado } from '#/components/painel/etiqueta-de-estado'
import {
  AcoesDoFormulario,
  CampoDoPainel,
} from '#/components/painel/formulario'
import { FormularioDeNome } from '#/components/painel/formulario-de-nome'
import { CabecalhoDaPagina, PaginaDoPainel } from '#/components/painel/pagina'
import { QuemCompraDoCurso } from '#/components/painel/quem-compra-do-curso'
import { RegrasDeLiberacao } from '#/components/painel/regras-de-liberacao'
import { TabelaDoPainel } from '#/components/painel/tabela'
import { useAcao } from '#/components/painel/use-acao'
import { Button } from '#/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '#/components/ui/card'
import { Checkbox } from '#/components/ui/checkbox'
import { Input } from '#/components/ui/input'
import { Label } from '#/components/ui/label'
import { SelectNativo } from '#/components/ui/select-nativo'
import { Textarea } from '#/components/ui/textarea'
import {
  excluirAulaFn,
  excluirModuloFn,
  reordenarFn,
  salvarAulaFn,
  salvarCursoFn,
  salvarModuloFn,
} from '#/lib/conteudo-fns'
import { type carregarCursoComAba, cursoComAbaFn } from '#/lib/curso-abas-fns'
import { FUSO_DA_ESCOLA, formatarDataNoFuso } from '#/lib/datas'
import { moverNaLista } from '#/lib/ordem'
import type { CursoCompleto } from '#/regras/conteudo'
import {
  LIMITE_DA_CARGA_HORARIA,
  LIMITE_DA_URL_DE_VENDAS,
  LIMITE_DO_NOME,
  validarCurso,
  validarNome,
} from '#/regras/formulario-do-curso'
import {
  ABAS_DO_CURSO,
  type AbaDoCurso,
  abaDoCurso,
} from '#/regras/grupo-de-ligacoes'
import { podeFazer, tratarPerfil } from '#/regras/permissoes'

export const Route = createFileRoute('/painel/conteudo/$cursoId')({
  validateSearch: (
    search: Record<string, unknown>,
  ): { aba?: AbaDoCurso; edicao?: string } => ({
    ...(search.aba ? { aba: abaDoCurso(search.aba) } : {}),
    ...(typeof search.edicao === 'string' && search.edicao
      ? { edicao: search.edicao }
      : {}),
  }),
  loaderDeps: ({ search }) => ({
    aba: search.aba ?? 'conteudo',
    edicao: search.edicao,
  }),
  loader: async ({ params, deps }) => {
    const dados = await cursoComAbaFn({
      data: { id: params.cursoId, aba: deps.aba, edicao: deps.edicao },
    })
    if (!dados.nome) throw notFound()
    return dados
  },
  head: () => ({ meta: [{ title: 'Curso · Estúdio' }] }),
  component: PaginaDoCurso,
})

type DadosDoCurso = Awaited<ReturnType<typeof carregarCursoComAba>>

const ROTULO_DA_ABA: Record<AbaDoCurso, string> = {
  conteudo: 'Conteúdo',
  'quem-compra': 'Quem compra',
  liberacao: 'Liberação',
  alunos: 'Alunos',
}

// O curso é o lugar único: conteúdo, quem compra, liberação e alunos, em abas (`?aba=`, link compartilhável).
function PaginaDoCurso() {
  const dados = Route.useLoaderData()
  const { cursoId } = Route.useParams()
  const busca = Route.useSearch()
  const aba = busca.aba ?? 'conteudo'
  const { session } = Route.useRouteContext()
  const podeLigar = podeFazer(
    tratarPerfil(session.user.perfil),
    'ligar-produto-da-hotmart',
  )
  const primeiraEdicao = dados.edicoes[0]?.id

  // A aba aberta leva a busca da URL como está (assim ela fica marcada como a atual, com ou sem
  // `?aba=` e `?edicao=`); as outras levam o endereço de sempre.
  const abas = ABAS_DO_CURSO.map((a) => ({
    rotulo: a === 'alunos' ? `Alunos · ${dados.total}` : ROTULO_DA_ABA[a],
    para: '/painel/conteudo/$cursoId' as const,
    params: { cursoId },
    search:
      a === aba
        ? { aba: busca.aba, edicao: busca.edicao }
        : a === 'conteudo'
          ? { aba: undefined, edicao: undefined }
          : a === 'liberacao' && primeiraEdicao
            ? { aba: a, edicao: primeiraEdicao }
            : { aba: a, edicao: undefined },
  }))

  return (
    <PaginaDoPainel>
      <CabecalhoDaPagina
        titulo={dados.nome}
        contexto="Dados, módulos e aulas, quem compra, regras de liberação e alunos deste curso."
        voltar={{ rotulo: 'Cursos', to: '/painel/conteudo' }}
        acao={
          <Button asChild variant="outline" className="toque:min-h-11">
            <Link to="/painel/certificado/$cursoId" params={{ cursoId }}>
              Certificado
            </Link>
          </Button>
        }
      />

      <AbasDoPainel rotulo="Abas do curso" abas={abas} />

      {aba === 'conteudo' && dados.conteudo?.completo && (
        <AbaConteudo
          completo={dados.conteudo.completo}
          categorias={dados.conteudo.categorias}
        />
      )}
      {aba === 'quem-compra' && dados.quemCompra && (
        <QuemCompraDoCurso
          cursoId={cursoId}
          dados={dados.quemCompra}
          podeLigar={podeLigar}
        />
      )}
      {aba === 'liberacao' && dados.liberacao && (
        <AbaLiberacao cursoId={cursoId} dados={dados.liberacao} />
      )}
      {aba === 'alunos' && dados.alunos && <AbaAlunos alunos={dados.alunos} />}
    </PaginaDoPainel>
  )
}

function AbaLiberacao({
  cursoId,
  dados,
}: {
  cursoId: string
  dados: NonNullable<DadosDoCurso['liberacao']>
}) {
  const navigate = useNavigate()
  const { edicoes, regras, alvos } = dados
  if (edicoes.length === 0) {
    return (
      <VazioDoPainel
        mensagem="Este curso ainda não tem quem compra. Adicione um produto na aba Quem compra para poder definir regras de liberação."
        acao={
          <Button asChild variant="outline" className="toque:min-h-11">
            <Link
              to="/painel/conteudo/$cursoId"
              params={{ cursoId }}
              search={{ aba: 'quem-compra' }}
            >
              Ir para Quem compra
            </Link>
          </Button>
        }
      />
    )
  }
  return (
    <div className="flex flex-col gap-4">
      <p className="text-muted-foreground">
        Quando cada parte do curso abre para a aluna. Sem regra, tudo abre na
        compra. Uma aula pode ter regra própria, no lugar da do módulo. Datas no
        horário de Brasília.
      </p>
      {edicoes.length > 1 && (
        <div className="flex max-w-md flex-col gap-2">
          <Label htmlFor="edicao-das-regras">Edição</Label>
          <SelectNativo
            id="edicao-das-regras"
            value={regras?.turma.id ?? ''}
            onChange={(e) =>
              navigate({
                to: '/painel/conteudo/$cursoId',
                params: { cursoId },
                search: { aba: 'liberacao', edicao: e.target.value },
              })
            }
          >
            {edicoes.map((e) => (
              <option key={e.id} value={e.id}>
                {e.nome}
              </option>
            ))}
          </SelectNativo>
        </div>
      )}
      {regras && alvos && (
        <RegrasDeLiberacao
          key={regras.turma.id}
          turma={regras.turma}
          modulos={regras.modulos}
          alvos={alvos}
        />
      )}
    </div>
  )
}

function AbaAlunos({
  alunos,
}: {
  alunos: NonNullable<DadosDoCurso['alunos']>
}) {
  return (
    <TabelaDoPainel
      rotulo="Alunos do curso"
      linhas={alunos}
      chave={(a) => a.matriculaId}
      testIdDaLinha={(a) => `aluno-${a.matriculaId}`}
      vazio={
        <VazioDoPainel
          mensagem="Ninguém está neste curso ainda. Matricule alunos à mão ou ligue um produto na aba Quem compra."
          acao={
            <Button asChild variant="outline" className="toque:min-h-11">
              <Link to="/painel/matricular">Matricular alunos</Link>
            </Button>
          }
        />
      }
      colunas={[
        {
          rotulo: 'Nome',
          essencial: true,
          celula: (a) => (
            <Link
              to="/painel/alunos/$alunoId"
              params={{ alunoId: a.alunoId }}
              className="font-medium underline-offset-4 hover:underline"
            >
              {a.nome}
            </Link>
          ),
        },
        {
          rotulo: 'E-mail',
          essencial: true,
          className: 'break-all',
          celula: (a) => a.email,
        },
        { rotulo: 'Edição', essencial: true, celula: (a) => a.edicao },
        {
          rotulo: 'Desde',
          essencial: true,
          celula: (a) => (
            <span className="tabular-nums">
              {formatarDataNoFuso(a.desde, FUSO_DA_ESCOLA)}
            </span>
          ),
        },
      ]}
    />
  )
}

function AbaConteudo({
  completo,
  categorias,
}: {
  completo: CursoCompleto
  categorias: { id: string; nome: string }[]
}) {
  const { curso, modulos } = completo
  const { ocupado, executar, erros, limparErros } = useAcao()
  const criacaoDeModulo = useAcao()

  // O último conteúdo salvo: base para "Alterações não salvas" e para cancelar.
  const [salvo, setSalvo] = useState(() => ({
    nome: curso.nome,
    descricao: curso.descricao,
    categoriaId: curso.categoriaId ?? '',
    cargaHoraria: curso.cargaHoraria === null ? '' : String(curso.cargaHoraria),
    capaHorizontal: curso.capaHorizontal,
    capaVertical: curso.capaVertical,
    imagemDestaque: curso.imagemDestaque,
    mostrarATodos: curso.mostrarATodos,
    urlDeVendas: curso.urlDeVendas ?? '',
    geraPedidoDoMec: curso.geraPedidoDoMec,
  }))
  const [nome, setNome] = useState(salvo.nome)
  const [descricao, setDescricao] = useState(salvo.descricao)
  const [categoriaId, setCategoriaId] = useState(salvo.categoriaId)
  const [cargaHoraria, setCargaHoraria] = useState(salvo.cargaHoraria)
  const [capaHorizontal, setCapaHorizontal] = useState(salvo.capaHorizontal)
  const [capaVertical, setCapaVertical] = useState(salvo.capaVertical)
  const [imagemDestaque, setImagemDestaque] = useState(salvo.imagemDestaque)
  const [mostrarATodos, setMostrarATodos] = useState(salvo.mostrarATodos)
  const [urlDeVendas, setUrlDeVendas] = useState(salvo.urlDeVendas)
  const [geraPedidoDoMec, setGeraPedidoDoMec] = useState(salvo.geraPedidoDoMec)
  const [novoModulo, setNovoModulo] = useState('')

  const atuais = {
    nome,
    descricao,
    categoriaId,
    cargaHoraria,
    capaHorizontal,
    capaVertical,
    imagemDestaque,
    mostrarATodos,
    urlDeVendas,
    geraPedidoDoMec,
  }
  const alterado = (Object.keys(atuais) as (keyof typeof atuais)[]).some(
    (k) => atuais[k] !== salvo[k],
  )

  function cancelar() {
    setNome(salvo.nome)
    setDescricao(salvo.descricao)
    setCategoriaId(salvo.categoriaId)
    setCargaHoraria(salvo.cargaHoraria)
    setCapaHorizontal(salvo.capaHorizontal)
    setCapaVertical(salvo.capaVertical)
    setImagemDestaque(salvo.imagemDestaque)
    setMostrarATodos(salvo.mostrarATodos)
    setUrlDeVendas(salvo.urlDeVendas)
    setGeraPedidoDoMec(salvo.geraPedidoDoMec)
    limparErros()
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Dados do curso</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            className="flex flex-col gap-4"
            noValidate
            onSubmit={async (e) => {
              e.preventDefault()
              const enviado = atuais
              const id = await executar(
                () =>
                  salvarCursoFn({
                    data: {
                      id: curso.id,
                      nome,
                      descricao,
                      categoriaId: categoriaId || null,
                      cargaHoraria:
                        cargaHoraria.trim() === ''
                          ? null
                          : Number(cargaHoraria),
                      capaHorizontal,
                      capaVertical,
                      imagemDestaque,
                      mostrarATodos,
                      urlDeVendas: urlDeVendas.trim() || null,
                      geraPedidoDoMec,
                    },
                  }),
                'Curso salvo.',
                {
                  validar: () =>
                    validarCurso({
                      nome,
                      cargaHoraria,
                      urlDeVendas,
                      mostrarATodos,
                    }),
                  campoDoErro: (m) =>
                    /nome/i.test(m)
                      ? 'nome'
                      : /carga/i.test(m)
                        ? 'cargaHoraria'
                        : /URL/.test(m)
                          ? 'urlDeVendas'
                          : undefined,
                },
              )
              if (id) setSalvo(enviado)
            }}
          >
            <CampoDoPainel rotulo="Nome" erro={erros.nome}>
              <Input
                id="nome"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                maxLength={LIMITE_DO_NOME}
                required
              />
            </CampoDoPainel>
            <CampoDoPainel rotulo="Descrição">
              <Textarea
                id="descricao"
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
                rows={4}
                maxLength={5000}
              />
            </CampoDoPainel>
            <div className="grid gap-4 sm:grid-cols-2">
              <CampoDoPainel rotulo="Categoria">
                <SelectNativo
                  id="categoria"
                  value={categoriaId}
                  onChange={(e) => setCategoriaId(e.target.value)}
                >
                  <option value="">Sem categoria</option>
                  {categorias.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nome}
                    </option>
                  ))}
                </SelectNativo>
              </CampoDoPainel>
              <CampoDoPainel
                rotulo="Carga horária (horas)"
                erro={erros.cargaHoraria}
              >
                <Input
                  id="carga"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={LIMITE_DA_CARGA_HORARIA}
                  step={1}
                  value={cargaHoraria}
                  onChange={(e) => setCargaHoraria(e.target.value)}
                />
              </CampoDoPainel>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <CampoDeImagem
                rotulo="Capa horizontal"
                valor={capaHorizontal}
                onChange={setCapaHorizontal}
              />
              <CampoDeImagem
                rotulo="Capa vertical"
                valor={capaVertical}
                onChange={setCapaVertical}
              />
              <CampoDeImagem
                rotulo="Imagem de destaque"
                valor={imagemDestaque}
                onChange={setImagemDestaque}
              />
            </div>
            <div className="flex flex-col gap-3 rounded-md border p-3">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="mostrar"
                  checked={mostrarATodos}
                  onCheckedChange={(v) => setMostrarATodos(v === true)}
                />
                <Label htmlFor="mostrar">Mostrar a todos na vitrine</Label>
              </div>
              <p className="text-xs text-muted-foreground">
                Quem não tem o curso o vê com cadeado e vai para a página de
                vendas.
              </p>
              <CampoDoPainel
                rotulo="URL da página de vendas"
                erro={erros.urlDeVendas}
              >
                <Input
                  id="vendas"
                  type="url"
                  inputMode="url"
                  placeholder="https://"
                  autoComplete="off"
                  spellCheck={false}
                  maxLength={LIMITE_DA_URL_DE_VENDAS}
                  value={urlDeVendas}
                  onChange={(e) => setUrlDeVendas(e.target.value)}
                />
              </CampoDoPainel>
            </div>
            <div className="flex flex-col gap-2 rounded-md border p-3">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="gera-mec"
                  checked={geraPedidoDoMec}
                  onCheckedChange={(v) => setGeraPedidoDoMec(v === true)}
                />
                <Label htmlFor="gera-mec">Gera Pedido do MEC</Label>
              </div>
              <p className="text-xs text-muted-foreground">
                Ao emitir o certificado deste curso, a equipe recebe um pedido
                para liberar o certificado do MEC na Voomp. Só a Formação usa.
              </p>
            </div>
            <AcoesDoFormulario
              salvar="Salvar curso"
              ocupado={ocupado}
              alterado={alterado}
              erros={erros}
              onCancelar={alterado ? cancelar : undefined}
            />
          </form>
        </CardContent>
      </Card>

      <section className="flex flex-col gap-4" aria-label="Módulos">
        <h2 className="text-lg font-semibold tracking-tight">
          Módulos e aulas
        </h2>
        {modulos.length === 0 && (
          <VazioDoPainel mensagem="Nenhum módulo ainda. Crie o primeiro aqui embaixo; as aulas entram dentro dele." />
        )}
        {modulos.map((m, i) => (
          <ModuloCard
            key={m.id}
            modulo={m}
            posicao={i}
            total={modulos.length}
            idsDosModulos={modulos.map((x) => x.id)}
          />
        ))}
        <FormularioDeNome
          rotulo="Novo módulo"
          nomeAcessivel="Nome do novo módulo"
          placeholder="Nome do novo módulo"
          salvar="Criar módulo"
          secundario
          valor={novoModulo}
          onChange={setNovoModulo}
          erros={criacaoDeModulo.erros}
          ocupado={criacaoDeModulo.ocupado}
          onEnviar={async () => {
            const ok = await criacaoDeModulo.executar(
              () =>
                salvarModuloFn({
                  data: { cursoId: curso.id, nome: novoModulo },
                }).then(() => true),
              'Módulo criado.',
              {
                validar: () => ({
                  nome: validarNome(novoModulo, 'nome do módulo'),
                }),
                campoDoErro: () => 'nome',
              },
            )
            if (ok) setNovoModulo('')
          }}
        />
      </section>
    </>
  )
}

type ModuloDoCurso = CursoCompleto['modulos'][number]

function ModuloCard({
  modulo,
  posicao,
  total,
  idsDosModulos,
}: {
  modulo: ModuloDoCurso
  posicao: number
  total: number
  idsDosModulos: string[]
}) {
  const { executar, ocupado } = useAcao()
  const edicaoDoModulo = useAcao()
  const criacaoDeAula = useAcao()
  const navegar = useNavigate()
  const [nome, setNome] = useState(modulo.nome)
  const [capa, setCapa] = useState(modulo.capa)
  const [novaAula, setNovaAula] = useState('')
  const [editando, setEditando] = useState(false)
  // Recolhido por padrão: a página do curso mostra a estrutura, e as aulas abrem quando alguém
  // vai mexer nelas (abre sozinho ao editar o módulo).
  const [aberto, setAberto] = useState(false)
  const totalDeAulas = modulo.aulas.length

  return (
    <Card className={aberto || editando ? 'gap-3 py-4' : 'py-2'}>
      {/* No celular o nome ocupa a linha toda e as ações ficam numa segunda linha. */}
      <CardHeader className="flex flex-row flex-wrap items-center gap-x-2 gap-y-1 px-4">
        <button
          type="button"
          aria-expanded={aberto}
          onClick={() => setAberto((v) => !v)}
          className="-ml-1 flex min-w-0 basis-full items-center gap-2 rounded-md px-1 py-1 text-left transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring sm:flex-1 sm:basis-0 toque:min-h-11"
        >
          <ChevronRight
            aria-hidden
            className={`size-4 shrink-0 text-muted-foreground transition-transform ${aberto ? 'rotate-90' : ''}`}
          />
          <CardTitle className="truncate text-base" title={modulo.nome}>
            {modulo.nome}
          </CardTitle>
          <span className="shrink-0 text-sm text-muted-foreground tabular-nums">
            {totalDeAulas} {totalDeAulas === 1 ? 'aula' : 'aulas'}
          </span>
        </button>
        <div className="flex items-center sm:ml-auto">
          <BotoesDeOrdem
            rotulo={`módulo ${modulo.nome}`}
            naPrimeira={posicao === 0}
            naUltima={posicao === total - 1}
            aoMover={(d) =>
              executar(() =>
                reordenarFn({
                  data: {
                    entidade: 'modulo',
                    ids: moverNaLista(idsDosModulos, modulo.id, d),
                  },
                }),
              )
            }
          />
          <Button
            variant="ghost"
            size="icon-sm"
            className="toque:size-11"
            aria-label={`Editar módulo ${modulo.nome}`}
            title={`Editar módulo ${modulo.nome}`}
            onClick={() => {
              setEditando((v) => !v)
              setAberto(true)
            }}
          >
            <Pencil />
          </Button>
          <BotaoExcluir
            icone
            rotulo={`Excluir módulo ${modulo.nome}`}
            titulo="Excluir este módulo?"
            descricao={`“${modulo.nome}” sai com as aulas. Dá para desfazer por 30 dias.`}
            disabled={ocupado}
            onConfirmado={() =>
              executar(
                () => excluirModuloFn({ data: { id: modulo.id } }),
                'Módulo excluído.',
              )
            }
          />
        </div>
      </CardHeader>
      {(aberto || editando) && (
        <CardContent className="flex flex-col gap-3 px-4">
          {editando && (
            <form
              noValidate
              className="flex flex-col gap-3 rounded-md border p-3"
              onSubmit={async (e) => {
                e.preventDefault()
                const ok = await edicaoDoModulo.executar(
                  () =>
                    salvarModuloFn({
                      data: {
                        id: modulo.id,
                        cursoId: modulo.cursoId,
                        nome,
                        capa,
                      },
                    }).then(() => true),
                  'Módulo salvo.',
                  {
                    validar: () => ({
                      nome: validarNome(nome, 'nome do módulo'),
                    }),
                    campoDoErro: () => 'nome',
                  },
                )
                if (ok) setEditando(false)
              }}
            >
              <CampoDoPainel
                rotulo="Nome do módulo"
                erro={edicaoDoModulo.erros.nome}
              >
                <Input
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  maxLength={LIMITE_DO_NOME}
                  required
                />
              </CampoDoPainel>
              <CampoDeImagem
                rotulo="Capa do módulo"
                valor={capa}
                onChange={setCapa}
              />
              <AcoesDoFormulario
                salvar="Salvar módulo"
                ocupado={edicaoDoModulo.ocupado}
                erros={edicaoDoModulo.erros}
                className="pt-0"
                onCancelar={() => {
                  setNome(modulo.nome)
                  setCapa(modulo.capa)
                  edicaoDoModulo.limparErros()
                  setEditando(false)
                }}
              />
            </form>
          )}
          {modulo.aulas.length > 0 && (
            <ul className="flex flex-col divide-y rounded-md border">
              {modulo.aulas.map((a, i) => (
                <li
                  key={a.id}
                  className="flex flex-wrap items-center gap-x-2 gap-y-1 px-3 py-1.5 text-sm"
                >
                  <Link
                    to="/painel/aulas/$aulaId"
                    params={{ aulaId: a.id }}
                    className="min-w-0 flex-1 basis-40 break-words no-underline hover:underline toque:py-2"
                  >
                    {a.titulo}
                  </Link>
                  {!a.vimeoId && (
                    <EtiquetaDeEstado tom="atencao">Sem vídeo</EtiquetaDeEstado>
                  )}
                  <div className="ml-auto flex items-center">
                    <BotoesDeOrdem
                      rotulo={`aula ${a.titulo}`}
                      naPrimeira={i === 0}
                      naUltima={i === modulo.aulas.length - 1}
                      aoMover={(d) =>
                        executar(() =>
                          reordenarFn({
                            data: {
                              entidade: 'aula',
                              ids: moverNaLista(
                                modulo.aulas.map((x) => x.id),
                                a.id,
                                d,
                              ),
                            },
                          }),
                        )
                      }
                    />
                    <BotaoExcluir
                      icone
                      rotulo={`Excluir aula ${a.titulo}`}
                      titulo="Excluir esta aula?"
                      descricao={`“${a.titulo}” sai do módulo. Dá para desfazer por 30 dias.`}
                      disabled={ocupado}
                      onConfirmado={() =>
                        executar(
                          () => excluirAulaFn({ data: { id: a.id } }),
                          'Aula excluída.',
                        )
                      }
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
          <FormularioDeNome
            rotulo="Nova aula"
            nomeAcessivel={`Título da nova aula em ${modulo.nome}`}
            placeholder="Título da nova aula"
            salvar="Criar aula"
            secundario
            valor={novaAula}
            onChange={setNovaAula}
            erros={criacaoDeAula.erros}
            ocupado={criacaoDeAula.ocupado}
            onEnviar={async () => {
              const id = await criacaoDeAula.executar(
                () =>
                  salvarAulaFn({
                    data: { moduloId: modulo.id, titulo: novaAula },
                  }),
                undefined,
                {
                  validar: () => ({
                    nome: validarNome(novaAula, 'título da aula'),
                  }),
                  campoDoErro: () => 'nome',
                },
              )
              if (id) {
                setNovaAula('')
                navegar({ to: '/painel/aulas/$aulaId', params: { aulaId: id } })
              }
            }}
          />
        </CardContent>
      )}
    </Card>
  )
}
