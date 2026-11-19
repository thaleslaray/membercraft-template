import {
  Bold,
  Code,
  ImagePlus,
  Italic,
  Link2,
  List,
  ListOrdered,
  Quote,
  RectangleHorizontal,
} from 'lucide-react'
import { type ReactNode, useEffect, useRef, useState } from 'react'
import { enviarParaAComunidade } from '#/components/comunidade/envio'
import { ESTILO_DO_BOTAO } from '#/components/conteudo/texto-da-aula'
import { Button } from '#/components/ui/button'
import { Textarea } from '#/components/ui/textarea'
import { toast } from '#/lib/toast'
import {
  PREFIXO_DAS_IMAGENS_DA_COMUNIDADE,
  URL_DAS_IMAGENS_DA_COMUNIDADE,
} from '#/regras/anexos-da-comunidade'

// Editor de texto formatado: negrito, itálico, listas, citação, link e imagem. Guarda HTML, que o
// servidor limpa de novo ao gravar. O valor inicial entra uma vez; depois o editor é quem manda.
const escaparHtml = (t: string) =>
  t
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

export function EditorDeTexto({
  valorInicial,
  onChange,
  rotulo = 'Texto da publicação',
  comBotao = false,
  comImagem = true,
  comHtml = false,
  id,
  'aria-describedby': descrito,
  'aria-invalid': invalido,
}: {
  valorInicial: string
  onChange: (html: string) => void
  rotulo?: string
  /** Comando "Botão" na barra (texto da aula). */
  comBotao?: boolean
  /** Comando "Imagem" (envio para o armazenamento da comunidade). */
  comImagem?: boolean
  /** Alterna para o HTML cru (iframe, tabelas antigas). */
  comHtml?: boolean
  id?: string
  'aria-describedby'?: string
  'aria-invalid'?: boolean
}) {
  const [modoHtml, setModoHtml] = useState(false)
  const [html, setHtml] = useState(valorInicial)
  const area = useRef<HTMLDivElement>(null)
  const entrada = useRef<HTMLInputElement>(null)
  const [enviando, setEnviando] = useState(false)

  // biome-ignore lint/correctness/useExhaustiveDependencies: o valor inicial só entra na montagem
  useEffect(() => {
    if (!modoHtml && area.current) area.current.innerHTML = html
  }, [modoHtml])

  const avisar = () => {
    const atual = area.current?.innerHTML ?? ''
    setHtml(atual)
    onChange(atual)
  }

  function alternarHtml() {
    setModoHtml(!modoHtml)
  }

  function inserirBotao() {
    const texto = window.prompt('Texto do botão')?.trim()
    if (!texto) return
    const endereco = window.prompt('Endereço do botão (https://…)')?.trim()
    if (!endereco) return
    if (!/^https:\/\//i.test(endereco)) {
      toast.error('Use um endereço que comece com https://')
      return
    }
    comando(
      'insertHTML',
      `<p><a href="${escaparHtml(endereco)}" class="botao">${escaparHtml(texto)}</a></p>`,
    )
  }

  function comando(nome: string, valor?: string) {
    area.current?.focus()
    // execCommand é antigo, mas é o que dá negrito e listas sem trazer uma biblioteca de editor.
    document.execCommand(nome, false, valor)
    avisar()
  }

  function inserirLink() {
    const endereco = window.prompt('Endereço do link (https://…)')?.trim()
    if (endereco && /^(https?:\/\/|mailto:)/i.test(endereco)) {
      comando('createLink', endereco)
    } else if (endereco) {
      toast.error('Use um endereço que comece com https://')
    }
  }

  async function enviarImagem(arquivo: File | undefined) {
    if (!arquivo) return
    setEnviando(true)
    try {
      const { chave } = await enviarParaAComunidade(arquivo, 'imagem')
      comando(
        'insertImage',
        `${URL_DAS_IMAGENS_DA_COMUNIDADE}${chave.slice(PREFIXO_DAS_IMAGENS_DA_COMUNIDADE.length)}`,
      )
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Não deu para enviar.')
    } finally {
      setEnviando(false)
      if (entrada.current) entrada.current.value = ''
    }
  }

  const botao = (
    nome: string,
    icone: ReactNode,
    aoClicar: () => void,
    desligado = false,
  ) => (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      className="toque:size-11"
      aria-label={nome}
      title={nome}
      disabled={desligado}
      // Sem isto o clique tira o foco do texto e o comando perde a seleção.
      onMouseDown={(e) => e.preventDefault()}
      onClick={aoClicar}
    >
      {icone}
    </Button>
  )

  return (
    <div className="rounded-md border bg-background focus-within:ring-[3px] focus-within:ring-ring/50">
      <div className="flex flex-wrap gap-0.5 border-b px-1.5 py-1">
        {botao('Negrito', <Bold />, () => comando('bold'))}
        {botao('Itálico', <Italic />, () => comando('italic'))}
        {botao('Lista', <List />, () => comando('insertUnorderedList'))}
        {botao('Lista numerada', <ListOrdered />, () =>
          comando('insertOrderedList'),
        )}
        {botao('Citação', <Quote />, () =>
          comando('formatBlock', 'blockquote'),
        )}
        {botao('Link', <Link2 />, inserirLink)}
        {comBotao && botao('Botão', <RectangleHorizontal />, inserirBotao)}
        {comHtml &&
          botao(modoHtml ? 'Voltar ao editor' : 'HTML', <Code />, alternarHtml)}
        <input
          ref={entrada}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          className="sr-only"
          aria-label="Escolher imagem"
          onChange={(e) => enviarImagem(e.target.files?.[0])}
        />
        {comImagem &&
          botao(
            enviando ? 'Enviando imagem…' : 'Imagem',
            <ImagePlus />,
            () => entrada.current?.click(),
            enviando,
          )}
      </div>
      {modoHtml ? (
        <Textarea
          id={id}
          aria-label={`${rotulo} (HTML)`}
          aria-describedby={descrito}
          aria-invalid={invalido}
          value={html}
          onChange={(e) => {
            setHtml(e.target.value)
            onChange(e.target.value)
          }}
          rows={12}
          spellCheck={false}
          className="rounded-none border-0 font-mono text-sm shadow-none focus-visible:ring-0"
        />
      ) : (
        // biome-ignore lint/a11y/useSemanticElements: editor de texto formatado precisa de contentEditable
        <div
          id={id}
          aria-describedby={descrito}
          aria-invalid={invalido}
          ref={area}
          role="textbox"
          aria-multiline="true"
          aria-label={rotulo}
          tabIndex={0}
          contentEditable
          suppressContentEditableWarning
          data-placeholder="Escreva aqui…"
          onInput={avisar}
          onBlur={avisar}
          className={`min-h-40 px-3 py-2 text-[15px] leading-relaxed outline-none empty:before:text-muted-foreground empty:before:content-[attr(data-placeholder)] [&_a:not(.botao)]:text-primary [&_a:not(.botao)]:underline [&_blockquote]:border-l-2 [&_blockquote]:pl-4 [&_img]:my-2 [&_img]:max-h-64 [&_img]:rounded-md [&_ol]:list-decimal [&_ol]:pl-6 [&_ul]:list-disc [&_ul]:pl-6 ${ESTILO_DO_BOTAO}`}
        />
      )}
    </div>
  )
}
