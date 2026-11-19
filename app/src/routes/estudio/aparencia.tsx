import { useQueryClient } from '@tanstack/react-query'
import { createFileRoute, redirect, useRouter } from '@tanstack/react-router'
import { Check, ImageIcon, TriangleAlert, X } from 'lucide-react'
import { useTheme } from 'next-themes'
import { useEffect, useId, useRef, useState } from 'react'
import {
  type Modo,
  PreviaDaAparencia,
  type Rascunho,
} from '#/components/aparencia/previa'
import { useConfirmar } from '#/components/confirmar'
import { CascaPainel } from '#/components/painel/casca-painel'
import { AcoesDoFormulario } from '#/components/painel/formulario'
import { CabecalhoDaPagina, PaginaDoPainel } from '#/components/painel/pagina'
import { Button } from '#/components/ui/button'
import { Checkbox } from '#/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog'
import { Input } from '#/components/ui/input'
import { Label } from '#/components/ui/label'
import { appConfig } from '#/config/app'
import { type ThemeDef, type ThemeId, themeById, themes } from '#/config/themes'
import {
  enviarImagemFn,
  restaurarAparenciaFn,
  salvarAparenciaFn,
} from '#/lib/aparencia-fns'
import { aparenciaQuery, useAparencia } from '#/lib/aparencia-queries'
import { filasQuery } from '#/lib/filas-queries'
import { exigirAcesso } from '#/lib/guardas'
import { toast } from '#/lib/toast'
import type { Aparencia, CascaDoAluno } from '#/regras/aparencia'
import { avaliarCorDaMarca } from '#/regras/aparencia-cor'
import { type CampoDeImagem, validarImagem } from '#/regras/aparencia-imagem'
import { podeFazer, tratarPerfil } from '#/regras/permissoes'

// Aparência (#63): o Proprietário escolhe tema, cor da marca, logo, favicon e fundos, com
// prévia ao vivo, aviso de contraste e "restaurar padrão".
export const Route = createFileRoute('/estudio/aparencia')({
  // Só o Proprietário entra (ação sensível `configurar-area`, verificação central da #37).
  // Quem não pode volta ao Início em vez de ver um erro.
  beforeLoad: async ({ context, location }) => {
    const session = await exigirAcesso(context, location)
    if (!podeFazer(tratarPerfil(session.user.perfil), 'configurar-area')) {
      throw redirect({ to: '/' })
    }
    await context.queryClient.ensureQueryData(filasQuery)
    return { session }
  },
  head: () => ({ meta: [{ title: 'Aparência · Estúdio' }] }),
  component: PaginaAparencia,
})

function rascunhoDe(aparencia: Aparencia): Rascunho {
  return {
    tema: aparencia.tema,
    casca: aparencia.casca,
    mostrarComunidade: aparencia.mostrarComunidade,
    corDaMarca: aparencia.corDaMarca,
    logoUrl: aparencia.logoUrl,
    faviconUrl: aparencia.faviconUrl,
    fundoDoMenuUrl: aparencia.fundoDoMenuUrl,
    fundoDoLoginUrl: aparencia.fundoDoLoginUrl,
  }
}

function mensagemDe(erro: unknown): string {
  return erro instanceof Error && erro.message
    ? erro.message
    : 'Não deu certo. Tente de novo em instantes.'
}

function PaginaAparencia() {
  const { session } = Route.useRouteContext()
  const aparencia = useAparencia()
  const queryClient = useQueryClient()
  const router = useRouter()
  const { resolvedTheme } = useTheme()
  const [rascunho, setRascunho] = useState<Rascunho>(() =>
    rascunhoDe(aparencia),
  )
  const [modo, setModo] = useState<Modo>('claro')
  const [salvando, setSalvando] = useState(false)
  const [restaurando, setRestaurando] = useState(false)
  const [previaAberta, setPreviaAberta] = useState(false)
  const telaLarga = useTelaLarga()
  const confirmar = useConfirmar()

  // A prévia abre no modo que a pessoa está vendo (só conhecido depois de montar).
  useEffect(() => {
    if (resolvedTheme === 'dark') setModo('escuro')
  }, [resolvedTheme])

  const mudou =
    JSON.stringify(rascunho) !== JSON.stringify(rascunhoDe(aparencia))

  function atualizar(parte: Partial<Rascunho>) {
    setRascunho((atual) => ({ ...atual, ...parte }))
  }

  async function aplicar(nova: Aparencia) {
    queryClient.setQueryData(aparenciaQuery.queryKey, nova)
    setRascunho(rascunhoDe(nova))
    await router.invalidate()
  }

  async function salvar(event: React.FormEvent) {
    event.preventDefault()
    setSalvando(true)
    try {
      const nova = await salvarAparenciaFn({ data: rascunho })
      await aplicar(nova)
      toast.success('Aparência salva. Já vale para todos os alunos.')
    } catch (erro) {
      toast.error(mensagemDe(erro))
    } finally {
      setSalvando(false)
    }
  }

  async function restaurar() {
    const sim = await confirmar({
      titulo: 'Restaurar o padrão do Estúdio?',
      descricao:
        'O tema volta para o Estúdio, a cor da marca para o verde e as imagens são removidas. Isso vale na hora para todos os alunos.',
      acao: 'Restaurar',
      perigo: true,
    })
    if (!sim) return
    setRestaurando(true)
    try {
      const nova = await restaurarAparenciaFn()
      await aplicar(nova)
      toast.success('Aparência restaurada ao padrão do Estúdio.')
    } catch (erro) {
      toast.error(mensagemDe(erro))
    } finally {
      setRestaurando(false)
    }
  }

  return (
    // Dentro da casca do painel, com o menu da equipe, como as outras telas do Estúdio.
    <CascaPainel perfil={tratarPerfil(session.user.perfil)}>
      <PaginaDoPainel largura="larga">
        <CabecalhoDaPagina
          titulo="Aparência"
          voltar={{ rotulo: 'Estúdio', to: '/painel' }}
          contexto={`O tema, a cor da marca e as imagens da ${appConfig.marca.nome}. A prévia mostra o resultado antes de salvar; salvar vale na hora para todos os alunos.`}
        />
        <form
          onSubmit={salvar}
          className="grid w-full flex-1 gap-8 lg:grid-cols-[minmax(0,1fr)_400px]"
        >
          <div className="flex min-w-0 flex-col gap-8">
            <Secao
              titulo="Tema"
              descricao="Seis conjuntos de cores, fontes e cantos. Cada um tem a face clara e a escura; o aluno escolhe o modo pelo botão da lua."
            >
              <fieldset className="grid gap-3 sm:grid-cols-2">
                <legend className="sr-only">Tema</legend>
                {themes.map((tema) => (
                  <CartaoDeTema
                    key={tema.id}
                    tema={tema}
                    selecionado={rascunho.tema === tema.id}
                    onSelecionar={() => atualizar({ tema: tema.id })}
                  />
                ))}
              </fieldset>
            </Secao>

            <Secao
              titulo="Estilo da área do aluno"
              descricao="O desenho das telas do aluno. O tema, a cor da marca e o logo valem nos dois estilos."
            >
              <fieldset className="grid gap-3 sm:grid-cols-2">
                <legend className="sr-only">Estilo da área do aluno</legend>
                {ESTILOS.map((estilo) => (
                  <CartaoDeEstilo
                    key={estilo.id}
                    estilo={estilo}
                    selecionado={rascunho.casca === estilo.id}
                    onSelecionar={() => atualizar({ casca: estilo.id })}
                  />
                ))}
              </fieldset>
            </Secao>

            <Secao
              titulo="Menu do aluno"
              descricao="O que aparece nos destinos do topo e nas abas do celular."
            >
              <div className="flex items-start gap-3">
                <Checkbox
                  id="mostrar-comunidade"
                  checked={rascunho.mostrarComunidade}
                  onCheckedChange={(v) =>
                    atualizar({ mostrarComunidade: v === true })
                  }
                  className="mt-0.5"
                />
                <div className="flex flex-col gap-1">
                  <Label htmlFor="mostrar-comunidade">
                    Mostrar Comunidade no menu do aluno
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Desligada, a aba Comunidade sai do menu e no lugar aparece
                    Falar com a equipe.
                  </p>
                </div>
              </div>
            </Secao>

            <Secao
              titulo="Cor da marca"
              descricao="Usada em botões, links, barras de progresso e no item ativo do menu. Sem escolha, vale a cor do próprio tema."
            >
              <CampoDeCor
                tema={rascunho.tema}
                cor={rascunho.corDaMarca}
                onCor={(corDaMarca) => atualizar({ corDaMarca })}
              />
            </Secao>

            <Secao
              titulo="Imagens"
              descricao="PNG, JPEG, GIF, WebP, SVG ou ICO, até 5 MB cada. Fundo transparente fica melhor no logo."
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <CampoDeImagemUpload
                  campo="logoUrl"
                  rotulo="Logo"
                  dica="Aparece no topo do menu e na tela de entrar. Até 180 px de largura."
                  url={rascunho.logoUrl}
                  onUrl={(logoUrl) => atualizar({ logoUrl })}
                  formato="logo"
                />
                <CampoDeImagemUpload
                  campo="faviconUrl"
                  rotulo="Favicon"
                  dica="O ícone da aba do navegador. Quadrado, 196×196 px."
                  url={rascunho.faviconUrl}
                  onUrl={(faviconUrl) => atualizar({ faviconUrl })}
                  formato="quadrado"
                />
                <CampoDeImagemUpload
                  campo="fundoDoMenuUrl"
                  rotulo="Fundo do menu"
                  dica="Atrás do menu lateral, com um véu na cor do tema. 700×1050 px."
                  url={rascunho.fundoDoMenuUrl}
                  onUrl={(fundoDoMenuUrl) => atualizar({ fundoDoMenuUrl })}
                  formato="retrato"
                />
                <CampoDeImagemUpload
                  campo="fundoDoLoginUrl"
                  rotulo="Fundo da tela de entrar"
                  dica="Ocupa metade da tela de entrar em telas largas. 1600×900 px."
                  url={rascunho.fundoDoLoginUrl}
                  onUrl={(fundoDoLoginUrl) => atualizar({ fundoDoLoginUrl })}
                  formato="paisagem"
                />
              </div>
            </Secao>

            <div className="sticky bottom-0 -mx-4 flex flex-wrap items-center justify-between gap-3 border-t bg-background px-4 py-4 sm:-mx-6 sm:px-6">
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={restaurando}
                  onClick={() => void restaurar()}
                  className="toque:min-h-11"
                >
                  {restaurando ? 'Restaurando…' : 'Restaurar padrão'}
                </Button>
                {telaLarga ? null : (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setPreviaAberta(true)}
                    className="toque:min-h-11"
                  >
                    Ver prévia
                  </Button>
                )}
              </div>
              <AcoesDoFormulario
                salvar="Salvar aparência"
                ocupado={salvando}
                alterado={mudou}
                className="pt-0"
              />
            </div>
          </div>

          {telaLarga ? (
            <aside className="self-start lg:sticky lg:top-20">
              <PreviaDaAparencia
                rascunho={rascunho}
                modo={modo}
                onModo={setModo}
              />
            </aside>
          ) : null}
        </form>
        {/* No celular a prévia fica a um toque da barra de salvar, de qualquer ponto da tela. */}
        <Dialog
          open={previaAberta && !telaLarga}
          onOpenChange={setPreviaAberta}
        >
          <DialogContent className="max-h-[90dvh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Prévia da aparência</DialogTitle>
              <DialogDescription>
                O resultado do que você mudou, antes de salvar.
              </DialogDescription>
            </DialogHeader>
            <PreviaDaAparencia
              rascunho={rascunho}
              modo={modo}
              onModo={setModo}
            />
          </DialogContent>
        </Dialog>
      </PaginaDoPainel>
    </CascaPainel>
  )
}

// Do `lg` para cima a prévia fica ao lado dos controles; abaixo, abre numa janela pelo botão da barra.
function useTelaLarga() {
  const [larga, setLarga] = useState(true)
  useEffect(() => {
    const consulta = window.matchMedia('(min-width: 1024px)')
    const atualizar = () => setLarga(consulta.matches)
    atualizar()
    consulta.addEventListener('change', atualizar)
    return () => consulta.removeEventListener('change', atualizar)
  }, [])
  return larga
}

function Secao({
  titulo,
  descricao,
  children,
}: {
  titulo: string
  descricao: string
  children: React.ReactNode
}) {
  return (
    <section className="flex flex-col gap-4 rounded-[var(--radius-card)] border bg-card p-5 text-card-foreground shadow-[var(--shadow-card)]">
      <div className="flex flex-col gap-1">
        <h2 className="font-semibold">{titulo}</h2>
        <p className="text-sm text-muted-foreground">{descricao}</p>
      </div>
      {children}
    </section>
  )
}

function CartaoDeTema({
  tema,
  selecionado,
  onSelecionar,
}: {
  tema: ThemeDef
  selecionado: boolean
  onSelecionar: () => void
}) {
  const [fundo, marca, tinta] = tema.swatch
  return (
    <label
      className={`flex cursor-pointer items-center gap-3 rounded-[var(--radius)] border p-3 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring ${
        selecionado ? 'border-primary bg-accent' : 'hover:bg-accent/60'
      }`}
    >
      <input
        type="radio"
        name="tema"
        value={tema.id}
        checked={selecionado}
        onChange={onSelecionar}
        className="sr-only"
      />
      <span
        aria-hidden="true"
        className="flex size-10 shrink-0 overflow-hidden rounded-[var(--radius-btn)] border"
      >
        <span className="h-full w-1/3" style={{ background: fundo }} />
        <span className="h-full w-1/3" style={{ background: marca }} />
        <span className="h-full w-1/3" style={{ background: tinta }} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-sm font-medium">{tema.label}</span>
        <span className="text-xs text-muted-foreground">{tema.hint}</span>
      </span>
      {selecionado ? (
        <Check className="size-4 text-primary" aria-hidden="true" />
      ) : null}
    </label>
  )
}

const ESTILOS: { id: CascaDoAluno; nome: string; descricao: string }[] = [
  {
    id: 'classica',
    nome: 'Clássico',
    descricao: 'Barra de topo com a marca, cursos em cartões e listas.',
  },
  {
    id: 'lume',
    nome: 'Lume',
    descricao:
      'Topo transparente, destaque grande com a capa e fileiras de cursos.',
  },
]

function CartaoDeEstilo({
  estilo,
  selecionado,
  onSelecionar,
}: {
  estilo: (typeof ESTILOS)[number]
  selecionado: boolean
  onSelecionar: () => void
}) {
  return (
    <label
      className={`flex cursor-pointer items-center gap-3 rounded-[var(--radius)] border p-3 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring ${
        selecionado ? 'border-primary bg-accent' : 'hover:bg-accent/60'
      }`}
    >
      <input
        type="radio"
        name="casca"
        value={estilo.id}
        checked={selecionado}
        onChange={onSelecionar}
        className="sr-only"
      />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-sm font-medium">{estilo.nome}</span>
        <span className="text-xs text-muted-foreground">
          {estilo.descricao}
        </span>
      </span>
      {selecionado ? (
        <Check className="size-4 text-primary" aria-hidden="true" />
      ) : null}
    </label>
  )
}

const HEX = /^#[0-9a-f]{6}$/i

function CampoDeCor({
  tema,
  cor,
  onCor,
}: {
  tema: ThemeId
  cor: string | null
  onCor: (cor: string | null) => void
}) {
  const id = useId()
  const corDoTema = themeById(tema).marca
  const [texto, setTexto] = useState(cor ?? '')
  // Quando o rascunho muda por fora (restaurar, salvar), o campo acompanha.
  useEffect(() => setTexto(cor ?? ''), [cor])
  const avaliacao = cor ? avaliarCorDaMarca(cor, tema) : null

  function mudarTexto(valor: string) {
    setTexto(valor)
    if (valor === '') onCor(null)
    else if (HEX.test(valor)) onCor(valor.toLowerCase())
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <label
          htmlFor={`${id}-seletor`}
          className="flex h-9 items-center gap-2 rounded-[var(--radius-btn)] border bg-background pr-3 pl-1.5 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring toque:h-11"
        >
          <input
            id={`${id}-seletor`}
            type="color"
            value={cor ?? corDoTema}
            onChange={(e) => mudarTexto(e.target.value)}
            aria-label="Escolher a cor da marca"
            className="size-6 cursor-pointer rounded border-0 bg-transparent p-0"
          />
          <Input
            value={texto}
            onChange={(e) => mudarTexto(e.target.value)}
            placeholder={corDoTema}
            maxLength={7}
            spellCheck={false}
            aria-label="Código hex da cor da marca"
            className="h-7 w-24 border-0 bg-transparent px-1 font-mono text-sm uppercase shadow-none focus-visible:ring-0"
          />
        </label>
        {cor ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => mudarTexto('')}
          >
            <X aria-hidden="true" />
            Usar a cor do tema
          </Button>
        ) : (
          <span className="text-xs text-muted-foreground">
            Usando a cor do tema ({corDoTema}).
          </span>
        )}
      </div>
      {texto !== '' && !HEX.test(texto) ? (
        <p className="text-xs text-destructive">
          Use um hex de 6 dígitos, como {corDoTema}.
        </p>
      ) : null}
      {avaliacao ? (
        avaliacao.avisos.length > 0 ? (
          <div
            role="status"
            className="flex gap-2 rounded-[var(--radius)] border border-warning/40 bg-warning/10 p-3 text-sm"
          >
            <TriangleAlert
              className="mt-0.5 size-4 shrink-0 text-warning"
              aria-hidden="true"
            />
            <div className="flex flex-col gap-1">
              <span className="font-medium">Aviso de contraste</span>
              {avaliacao.avisos.map((aviso) => (
                <span key={aviso} className="text-muted-foreground">
                  {aviso}
                </span>
              ))}
            </div>
          </div>
        ) : (
          <p role="status" className="text-xs text-muted-foreground">
            Contraste bom: texto{' '}
            {avaliacao.textoSobreAMarca === '#ffffff' ? 'branco' : 'escuro'}{' '}
            sobre a marca com {avaliacao.razaoDoTexto.toFixed(1)}:1. No modo
            escuro usamos {avaliacao.corNoEscuro}.
          </p>
        )
      ) : null}
    </div>
  )
}

const PROPORCOES: Record<string, string> = {
  logo: 'aspect-[3/1]',
  quadrado: 'aspect-square',
  retrato: 'aspect-[2/3]',
  paisagem: 'aspect-video',
}

function CampoDeImagemUpload({
  campo,
  rotulo,
  dica,
  url,
  onUrl,
  formato,
}: {
  campo: CampoDeImagem
  rotulo: string
  dica: string
  url: string | null
  onUrl: (url: string | null) => void
  formato: keyof typeof PROPORCOES
}) {
  const id = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const [enviando, setEnviando] = useState(false)

  async function enviar(arquivo: File | undefined) {
    if (!arquivo) return
    const motivo = validarImagem({ tipo: arquivo.type, tamanho: arquivo.size })
    if (motivo) {
      toast.error(motivo)
      return
    }
    setEnviando(true)
    try {
      const dados = new FormData()
      dados.set('campo', campo)
      dados.set('arquivo', arquivo)
      const { url: nova } = await enviarImagemFn({ data: dados })
      onUrl(nova)
    } catch (erro) {
      toast.error(mensagemDe(erro))
    } finally {
      setEnviando(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col">
        <span className="text-sm font-medium">{rotulo}</span>
        <span className="text-xs text-muted-foreground">{dica}</span>
      </div>
      <div
        className={`flex ${formato === 'retrato' ? 'h-40 w-auto' : 'w-full'} ${PROPORCOES[formato]} max-h-40 items-center justify-center overflow-hidden rounded-[var(--radius)] border border-dashed bg-surface`}
      >
        {url ? (
          <img
            src={url}
            alt={rotulo}
            className="size-full object-contain p-2"
          />
        ) : (
          <ImageIcon
            className="size-6 text-muted-foreground"
            aria-hidden="true"
          />
        )}
      </div>
      <div className="flex gap-2">
        <input
          ref={inputRef}
          id={id}
          type="file"
          accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml,image/x-icon,image/vnd.microsoft.icon"
          className="sr-only"
          aria-label={`Enviar ${rotulo.toLowerCase()}`}
          onChange={(e) => void enviar(e.target.files?.[0])}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={enviando}
          onClick={() => inputRef.current?.click()}
        >
          {enviando ? 'Enviando…' : url ? 'Trocar' : 'Enviar imagem'}
        </Button>
        {url ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onUrl(null)}
          >
            <X aria-hidden="true" />
            Remover
          </Button>
        ) : null}
      </div>
    </div>
  )
}
