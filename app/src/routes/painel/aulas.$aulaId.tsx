import { createFileRoute, notFound } from '@tanstack/react-router'
import { Download } from 'lucide-react'
import { useRef, useState } from 'react'
import { EditorDeTexto } from '#/components/comunidade/editor-de-texto'
import { BotaoExcluir } from '#/components/painel/botao-excluir'
import {
  CampoDeImagem,
  enviarArquivo,
} from '#/components/painel/campo-de-arquivo'
import { EditorDeQuiz } from '#/components/painel/editor-de-quiz'
import { VazioDoPainel } from '#/components/painel/estados'
import {
  AcoesDoFormulario,
  CampoDoPainel,
} from '#/components/painel/formulario'
import { CabecalhoDaPagina, PaginaDoPainel } from '#/components/painel/pagina'
import { useAcao } from '#/components/painel/use-acao'
import { Button } from '#/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '#/components/ui/card'
import { Input } from '#/components/ui/input'
import {
  anexarMaterialFn,
  aulaDoPainelFn,
  excluirMaterialFn,
  salvarAulaFn,
} from '#/lib/conteudo-fns'
import { quizDoPainelFn } from '#/lib/quiz-fns'
import { toast } from '#/lib/toast'
import {
  LIMITE_DO_TITULO_DA_AULA,
  validarAula,
} from '#/regras/formulario-da-aula'
import { urlDoPlayer } from '#/regras/vimeo'

export const Route = createFileRoute('/painel/aulas/$aulaId')({
  loader: async ({ params }) => {
    const aula = await aulaDoPainelFn({ data: { id: params.aulaId } })
    if (!aula) throw notFound()
    const quiz = await quizDoPainelFn({ data: { aulaId: params.aulaId } })
    return { ...aula, quiz }
  },
  head: () => ({ meta: [{ title: 'Aula · Estúdio' }] }),
  component: EditarAula,
})

function tamanhoLegivel(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`
}

function EditarAula() {
  const { aula, curso, modulo, materiais, quiz } = Route.useLoaderData()
  const { executar, ocupado } = useAcao()
  // O formulário tem a própria ação: os erros dele não se misturam com os dos materiais.
  const salvamento = useAcao()
  // O último conteúdo salvo: base para "Alterações não salvas" e para desfazer.
  const [salvo, setSalvo] = useState(() => ({
    titulo: aula.titulo,
    video: aula.vimeoId ? urlDoPlayer(aula.vimeoId, aula.vimeoHash) : '',
    texto: aula.textoHtml,
    miniatura: aula.miniatura,
  }))
  const [titulo, setTitulo] = useState(salvo.titulo)
  const [video, setVideo] = useState(salvo.video)
  const [texto, setTexto] = useState(salvo.texto)
  // O editor só lê o valor inicial na montagem: o desfazer o remonta com outra chave.
  const [versaoDoEditor, setVersaoDoEditor] = useState(0)
  const [miniatura, setMiniatura] = useState(salvo.miniatura)
  const alterado =
    titulo !== salvo.titulo ||
    video !== salvo.video ||
    texto !== salvo.texto ||
    miniatura !== salvo.miniatura

  function desfazer() {
    setTitulo(salvo.titulo)
    setVideo(salvo.video)
    setTexto(salvo.texto)
    setVersaoDoEditor((v) => v + 1)
    setMiniatura(salvo.miniatura)
    salvamento.limparErros()
  }
  const entradaMaterial = useRef<HTMLInputElement>(null)
  const [enviando, setEnviando] = useState(false)

  async function anexar(arquivo: File | undefined) {
    if (!arquivo) return
    setEnviando(true)
    try {
      const enviado = await enviarArquivo(arquivo, 'material')
      await executar(
        () =>
          anexarMaterialFn({
            data: {
              aulaId: aula.id,
              nome: enviado.nome,
              chave: enviado.chave,
              tipo: enviado.tipo,
              tamanho: enviado.tamanho,
            },
          }),
        'Material anexado.',
      )
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Não deu para enviar.')
    } finally {
      setEnviando(false)
      if (entradaMaterial.current) entradaMaterial.current.value = ''
    }
  }

  const botaoAnexar = (
    <Button
      type="button"
      variant="outline"
      className="toque:min-h-11"
      disabled={enviando || ocupado}
      onClick={() => entradaMaterial.current?.click()}
    >
      {enviando ? 'Enviando…' : 'Anexar material'}
    </Button>
  )

  return (
    <PaginaDoPainel>
      <CabecalhoDaPagina
        titulo={aula.titulo}
        contexto={`${curso.nome} · ${modulo.nome}`}
        voltar={{
          rotulo: curso.nome,
          to: '/painel/conteudo/$cursoId',
          params: { cursoId: curso.id },
        }}
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Conteúdo da aula</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            className="flex flex-col gap-4"
            noValidate
            onSubmit={async (e) => {
              e.preventDefault()
              const enviado = { titulo, video, texto, miniatura }
              const id = await salvamento.executar(
                () =>
                  salvarAulaFn({
                    data: {
                      id: aula.id,
                      titulo,
                      video,
                      textoHtml: texto,
                      miniatura,
                    },
                  }),
                'Aula salva.',
                {
                  validar: () => validarAula({ titulo, video }),
                  campoDoErro: (m) =>
                    /Vimeo/.test(m)
                      ? 'video'
                      : /título/.test(m)
                        ? 'titulo'
                        : undefined,
                },
              )
              if (id) setSalvo(enviado)
            }}
          >
            <CampoDoPainel rotulo="Título" erro={salvamento.erros.titulo}>
              <Input
                id="titulo"
                value={titulo}
                onChange={(e) => setTitulo(e.target.value)}
                maxLength={LIMITE_DO_TITULO_DA_AULA}
                required
              />
            </CampoDoPainel>
            <CampoDoPainel
              rotulo="Vídeo do Vimeo"
              erro={salvamento.erros.video}
              ajuda="Cole o link do Vimeo. Nos vídeos não listados, o link traz o código depois do número; ele é guardado junto. Deixe vazio para aula só de texto."
            >
              <Input
                id="video"
                value={video}
                onChange={(e) => setVideo(e.target.value)}
                placeholder="https://vimeo.com/123456789/abc123def4"
                inputMode="url"
                autoComplete="off"
                spellCheck={false}
              />
            </CampoDoPainel>
            <CampoDoPainel
              rotulo="Texto da aula"
              ajuda="Aceita parágrafos, títulos, listas, negrito, itálico, links, botões e imagens https. Use Botão para um botão largo com link https e HTML para colar vídeo (YouTube, Typebot) ou tabelas. O resto é removido ao salvar."
            >
              <EditorDeTexto
                key={versaoDoEditor}
                valorInicial={texto}
                onChange={setTexto}
                rotulo="Texto da aula"
                comBotao
                comHtml
                comImagem={false}
              />
            </CampoDoPainel>
            <CampoDeImagem
              rotulo="Miniatura da aula"
              valor={miniatura}
              onChange={setMiniatura}
            />
            <AcoesDoFormulario
              salvar="Salvar aula"
              ocupado={salvamento.ocupado}
              alterado={alterado}
              erros={salvamento.erros}
              onCancelar={alterado ? desfazer : undefined}
            />
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Materiais</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {materiais.length === 0 && (
            <VazioDoPainel
              mensagem="Nenhum material nesta aula. Anexe PDFs, planilhas ou outros arquivos para os alunos baixarem."
              acao={botaoAnexar}
              className="p-4 md:p-4"
            />
          )}
          <ul className="flex flex-col divide-y rounded-md border empty:hidden">
            {materiais.map((m) => (
              <li
                key={m.id}
                className="flex flex-wrap items-center gap-x-2 gap-y-1 px-3 py-2 text-sm"
              >
                <span
                  className="min-w-0 flex-1 basis-40 break-words"
                  title={m.nome}
                >
                  {m.nome}
                </span>
                <span className="text-xs text-muted-foreground">
                  {tamanhoLegivel(m.tamanho)}
                </span>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="toque:size-11"
                  asChild
                  aria-label={`Baixar ${m.nome}`}
                >
                  <a href={`/api/materiais/${m.id}`}>
                    <Download />
                  </a>
                </Button>
                <BotaoExcluir
                  icone
                  rotulo={`Excluir ${m.nome}`}
                  titulo="Excluir este material?"
                  descricao={`“${m.nome}” sai da aula e os alunos deixam de ver o arquivo.`}
                  disabled={ocupado}
                  onConfirmado={() =>
                    executar(
                      () => excluirMaterialFn({ data: { id: m.id } }),
                      'Material excluído.',
                    )
                  }
                />
              </li>
            ))}
          </ul>
          <input
            ref={entradaMaterial}
            type="file"
            className="sr-only"
            aria-label="Escolher material"
            onChange={(e) => anexar(e.target.files?.[0])}
          />
          {materiais.length > 0 && <div>{botaoAnexar}</div>}
        </CardContent>
      </Card>

      <EditorDeQuiz key={aula.id} aulaId={aula.id} inicial={quiz} />
    </PaginaDoPainel>
  )
}
