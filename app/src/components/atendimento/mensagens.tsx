import { ImagePlus, X } from 'lucide-react'
import { useId, useRef, useState } from 'react'
import { EtiquetaDeEstado } from '#/components/painel/etiqueta-de-estado'
import { Button } from '#/components/ui/button'
import { Textarea } from '#/components/ui/textarea'
import { useFusoDoAluno } from '#/lib/auth-queries'
import { formatarDataHoraNoFuso } from '#/lib/datas'
import { toast } from '#/lib/toast'
import type { EstadoDaConversa, MensagemLida } from '#/regras/atendimento'
import { ESTADO_DA_CONVERSA } from '#/regras/atendimento-estado'
import {
  LIMITE_DE_ANEXOS,
  LIMITE_DO_TEXTO,
  validarImagem,
} from '#/regras/atendimento-limites'

export const urlDoAnexo = (chave: string) => `/api/atendimento/anexo/${chave}`

// Estado da conversa na tela da equipe: etiqueta neutra com ponto colorido.
export function EstadoDaConversaBadge({
  estado,
}: {
  estado: EstadoDaConversa
}) {
  return <EtiquetaDeEstado {...ESTADO_DA_CONVERSA[estado]} />
}

export function Mensagens({ mensagens }: { mensagens: MensagemLida[] }) {
  const fuso = useFusoDoAluno()
  return (
    <ol className="flex flex-col gap-3">
      {mensagens.map((m) => {
        const daEquipe = m.autor === 'equipe'
        return (
          <li
            key={m.id}
            className={`flex max-w-[85%] flex-col gap-2 rounded-[var(--radius-card)] border p-3 ${
              daEquipe ? 'self-start bg-card' : 'self-end bg-surface'
            }`}
          >
            <div className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">
                {daEquipe ? `${m.autorNome} (equipe)` : m.autorNome}
              </span>
              <span>{formatarDataHoraNoFuso(m.criadoEm, fuso)}</span>
              {m.origem === 'email' && <span>por e-mail</span>}
            </div>
            {m.texto && (
              <p className="text-sm whitespace-pre-wrap [overflow-wrap:anywhere]">
                {m.texto}
              </p>
            )}
            {m.anexos.length > 0 && (
              <ul className="flex flex-wrap gap-2">
                {m.anexos.map((chave) => (
                  <li key={chave}>
                    <a
                      href={urlDoAnexo(chave)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <img
                        src={urlDoAnexo(chave)}
                        alt="Imagem anexada"
                        className="max-h-40 rounded-md border object-cover"
                      />
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </li>
        )
      })}
    </ol>
  )
}

// Envia uma imagem ao R2 pela rota do Atendimento e devolve a chave.
export async function enviarImagem(arquivo: File): Promise<string> {
  const corpo = new FormData()
  corpo.set('arquivo', arquivo)
  const resposta = await fetch('/api/atendimento/upload', {
    method: 'POST',
    body: corpo,
  })
  const json = (await resposta.json().catch(() => ({}))) as {
    chave?: string
    erro?: string
  }
  if (!resposta.ok || !json.chave) {
    throw new Error(json.erro || 'Não deu para enviar a imagem.')
  }
  return json.chave
}

// Campo de mensagem com anexos de imagem (até 5, de até 10 MB cada) e contador de caracteres.
export function FormularioDeMensagem({
  rotuloDoBotao,
  placeholder,
  aoEnviar,
  ocupado,
}: {
  rotuloDoBotao: string
  placeholder?: string
  aoEnviar: (mensagem: {
    texto: string
    anexos: string[]
    chaveDeEnvio: string
  }) => Promise<boolean>
  ocupado?: boolean
}) {
  const [texto, setTexto] = useState('')
  const [anexos, setAnexos] = useState<string[]>([])
  const [enviando, setEnviando] = useState(false)
  const [chaveDeEnvio, setChaveDeEnvio] = useState(() => crypto.randomUUID())
  const entrada = useRef<HTMLInputElement>(null)
  const idDoContador = useId()

  async function escolher(arquivos: FileList | null) {
    if (!arquivos) return
    setEnviando(true)
    try {
      for (const arquivo of Array.from(arquivos)) {
        if (anexos.length >= LIMITE_DE_ANEXOS) {
          toast.error(`Anexe no máximo ${LIMITE_DE_ANEXOS} imagens.`)
          break
        }
        const erro = validarImagem({
          tipo: arquivo.type,
          tamanho: arquivo.size,
        })
        if (erro) {
          toast.error(erro)
          continue
        }
        const chave = await enviarImagem(arquivo)
        setAnexos((atuais) => [...atuais, chave])
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Não deu para enviar.')
    } finally {
      setEnviando(false)
      if (entrada.current) entrada.current.value = ''
    }
  }

  async function enviar() {
    const enviou = await aoEnviar({ texto, anexos, chaveDeEnvio })
    if (enviou) {
      setTexto('')
      setAnexos([])
      // Um formulário novo, uma chave nova: só o clique duplo repete a mesma.
      setChaveDeEnvio(crypto.randomUUID())
    }
  }

  const excedeu = texto.length > LIMITE_DO_TEXTO
  const vazio = texto.trim() === '' && anexos.length === 0
  return (
    <div className="flex flex-col gap-2">
      <Textarea
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        placeholder={placeholder}
        rows={5}
        aria-label="Mensagem"
        aria-invalid={excedeu || undefined}
        aria-describedby={idDoContador}
        className="max-h-72 overflow-y-auto"
      />
      <p
        id={idDoContador}
        className={`text-right text-xs ${excedeu ? 'text-destructive' : 'text-muted-foreground'}`}
      >
        {texto.length.toLocaleString('pt-BR')} /{' '}
        {LIMITE_DO_TEXTO.toLocaleString('pt-BR')} caracteres
        {excedeu
          ? `. Passou do limite: apague ${(texto.length - LIMITE_DO_TEXTO).toLocaleString('pt-BR')} para enviar.`
          : ''}
      </p>
      {anexos.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {anexos.map((chave) => (
            <li key={chave} className="relative">
              <img
                src={urlDoAnexo(chave)}
                alt="Imagem para anexar"
                className="size-20 rounded-md border object-cover"
              />
              <Button
                type="button"
                variant="secondary"
                size="icon-sm"
                className="absolute -top-2 -right-2 size-6 rounded-full"
                aria-label="Remover imagem"
                onClick={() => setAnexos((a) => a.filter((c) => c !== chave))}
              >
                <X />
              </Button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <input
          ref={entrada}
          type="file"
          multiple
          accept="image/jpeg,image/png,image/webp,image/gif"
          className="sr-only"
          aria-label="Anexar imagens"
          onChange={(e) => escolher(e.target.files)}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="toque:h-11"
          disabled={enviando || anexos.length >= LIMITE_DE_ANEXOS}
          onClick={() => entrada.current?.click()}
        >
          <ImagePlus />
          {enviando ? 'Enviando…' : 'Anexar imagem'}
        </Button>
        <Button
          type="button"
          disabled={ocupado || enviando || vazio || excedeu}
          onClick={enviar}
        >
          {rotuloDoBotao}
        </Button>
      </div>
    </div>
  )
}
