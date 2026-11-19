import { Upload, X } from 'lucide-react'
import { useRef, useState } from 'react'
import { Button } from '#/components/ui/button'
import { urlDaImagem } from '#/lib/imagens'
import { toast } from '#/lib/toast'

export interface ArquivoEnviado {
  chave: string
  nome: string
  tipo: string
  tamanho: number
}

// Envia um arquivo ao R2 pela rota do painel e devolve o que ela respondeu.
export async function enviarArquivo(
  arquivo: File,
  finalidade: 'imagem' | 'material',
): Promise<ArquivoEnviado> {
  const corpo = new FormData()
  corpo.set('arquivo', arquivo)
  corpo.set('finalidade', finalidade)
  const resposta = await fetch('/api/painel/upload', {
    method: 'POST',
    body: corpo,
  })
  const json = (await resposta.json().catch(() => ({}))) as
    | ArquivoEnviado
    | { erro?: string }
  if (!resposta.ok || !('chave' in json)) {
    throw new Error(('erro' in json && json.erro) || 'Não deu para enviar.')
  }
  return json
}

// Campo de imagem (capa ou miniatura): mostra a atual, envia outra ou remove.
export function CampoDeImagem({
  rotulo,
  valor,
  onChange,
  aceitar = 'image/jpeg,image/png,image/webp,image/gif',
}: {
  rotulo: string
  valor: string | null
  onChange: (chave: string | null) => void
  /** Tipos do seletor de arquivo (o modelo de certificado só aceita PNG e JPEG). */
  aceitar?: string
}) {
  const entrada = useRef<HTMLInputElement>(null)
  const [enviando, setEnviando] = useState(false)
  const url = urlDaImagem(valor)

  async function escolher(arquivo: File | undefined) {
    if (!arquivo) return
    setEnviando(true)
    try {
      onChange((await enviarArquivo(arquivo, 'imagem')).chave)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Não deu para enviar.')
    } finally {
      setEnviando(false)
      if (entrada.current) entrada.current.value = ''
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-medium">{rotulo}</span>
      <div className="flex items-center gap-3">
        <div className="grid h-16 w-24 shrink-0 place-items-center overflow-hidden rounded-md border bg-muted text-xs text-muted-foreground">
          {url ? (
            <img src={url} alt="" className="size-full object-cover" />
          ) : (
            'Sem imagem'
          )}
        </div>
        <input
          ref={entrada}
          type="file"
          accept={aceitar}
          className="sr-only"
          aria-label={`Escolher arquivo: ${rotulo}`}
          onChange={(e) => escolher(e.target.files?.[0])}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={enviando}
          onClick={() => entrada.current?.click()}
        >
          <Upload />
          {enviando ? 'Enviando…' : valor ? 'Trocar' : 'Enviar'}
        </Button>
        {valor && (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={`Remover ${rotulo}`}
            onClick={() => onChange(null)}
          >
            <X />
          </Button>
        )}
      </div>
    </div>
  )
}
