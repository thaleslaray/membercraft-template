import { useEffect, useRef, useState } from 'react'
import { BOTAO_FORTE } from '#/components/casca-lume/pagina-lume'
import {
  type AnexoDoCampo,
  CampoDeAnexos,
} from '#/components/comunidade/campo-de-anexos'
import { EditorDeTexto } from '#/components/comunidade/editor-de-texto'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { Label } from '#/components/ui/label'
import { toast } from '#/lib/toast'
import { LIMITE_DO_TITULO } from '#/regras/comunidade-constantes'

export interface DadosDaPublicacao {
  titulo: string
  textoHtml: string
  anexos: AnexoDoCampo[]
  /** Chave contra clique duplo: a mesma até o envio dar certo. */
  chaveDeEnvio: string
}

// Título, texto formatado e anexos. Serve para publicar e para editar (`inicial`).
export function FormularioDePublicacao({
  inicial,
  rotuloDoBotao,
  aoEnviar,
  aoCancelar,
  aoMudar,
  focarAoMontar = false,
}: {
  inicial?: { titulo: string; textoHtml: string; anexos: AnexoDoCampo[] }
  rotuloDoBotao: string
  aoEnviar: (dados: DadosDaPublicacao) => Promise<void>
  aoCancelar?: () => void
  /** Avisa a cada digitação (o mural guarda o rascunho com isso). */
  aoMudar?: (dados: { titulo: string; textoHtml: string }) => void
  /** Põe o cursor no título ao abrir. */
  focarAoMontar?: boolean
}) {
  const campoDoTitulo = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (focarAoMontar) campoDoTitulo.current?.focus()
  }, [focarAoMontar])
  const [titulo, setTitulo] = useState(inicial?.titulo ?? '')
  const [textoHtml, setTextoHtml] = useState(inicial?.textoHtml ?? '')
  const [anexos, setAnexos] = useState<AnexoDoCampo[]>(inicial?.anexos ?? [])
  const [chaveDeEnvio] = useState(() => crypto.randomUUID())
  const [enviando, setEnviando] = useState(false)

  const mudarTitulo = (novo: string) => {
    setTitulo(novo)
    aoMudar?.({ titulo: novo, textoHtml })
  }
  const mudarTexto = (novo: string) => {
    setTextoHtml(novo)
    aoMudar?.({ titulo, textoHtml: novo })
  }

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    if (enviando) return
    setEnviando(true)
    try {
      await aoEnviar({ titulo, textoHtml, anexos, chaveDeEnvio })
    } catch (erro) {
      toast.error(erro instanceof Error ? erro.message : 'Não deu certo.')
      setEnviando(false)
    }
  }

  return (
    <form onSubmit={enviar} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="titulo-da-publicacao">Título</Label>
        <Input
          id="titulo-da-publicacao"
          ref={campoDoTitulo}
          value={titulo}
          maxLength={LIMITE_DO_TITULO}
          onChange={(e) => mudarTitulo(e.target.value)}
          placeholder="Do que se trata?"
          required
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label>Texto</Label>
        <EditorDeTexto valorInicial={textoHtml} onChange={mudarTexto} />
      </div>
      <CampoDeAnexos anexos={anexos} onChange={setAnexos} />
      <div className="flex gap-2">
        <Button type="submit" className={BOTAO_FORTE} disabled={enviando}>
          {enviando ? 'Enviando…' : rotuloDoBotao}
        </Button>
        {aoCancelar && (
          <Button type="button" variant="ghost" onClick={aoCancelar}>
            Cancelar
          </Button>
        )}
      </div>
    </form>
  )
}
