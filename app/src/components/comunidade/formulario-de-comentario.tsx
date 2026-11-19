import { useId, useRef, useState } from 'react'
import { BOTAO_FORTE } from '#/components/casca-lume/pagina-lume'
import { Button } from '#/components/ui/button'
import { Textarea } from '#/components/ui/textarea'
import { comentarFn, editarComentarioFn } from '#/lib/comunidade-fns'
import { toast } from '#/lib/toast'

// Comentário novo, resposta (`paiId`) ou edição (`editarId`). A chave de envio vale até dar certo:
// um clique duplo é o mesmo comentário.
export function FormularioDeComentario({
  publicacaoId,
  paiId = null,
  editarId = null,
  textoInicial = '',
  rotulo,
  rotuloDoBotao = 'Comentar',
  aoConcluir,
  aoCancelar,
}: {
  publicacaoId: string
  paiId?: string | null
  editarId?: string | null
  textoInicial?: string
  rotulo: string
  rotuloDoBotao?: string
  aoConcluir: () => Promise<void> | void
  aoCancelar?: () => void
}) {
  const [texto, setTexto] = useState(textoInicial)
  const [chaveDeEnvio, setChaveDeEnvio] = useState(() => crypto.randomUUID())
  const [enviando, setEnviando] = useState(false)
  const [aviso, setAviso] = useState<string | null>(null)
  const campo = useRef<HTMLTextAreaElement>(null)
  const idDoAviso = useId()

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    if (enviando) return
    // Botão sempre ligado: o desligado em vinho pálido não se lê. Vazio não vai ao servidor.
    if (!texto.trim()) {
      setAviso('Escreva algo antes de enviar.')
      campo.current?.focus()
      return
    }
    setAviso(null)
    setEnviando(true)
    try {
      if (editarId) {
        await editarComentarioFn({ data: { id: editarId, texto } })
      } else {
        await comentarFn({
          data: { publicacaoId, paiId, texto, chaveDeEnvio },
        })
        setTexto('')
        setChaveDeEnvio(crypto.randomUUID())
      }
      await aoConcluir()
    } catch (erro) {
      toast.error(erro instanceof Error ? erro.message : 'Não deu certo.')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <form onSubmit={enviar} className="flex flex-col gap-2">
      <Textarea
        ref={campo}
        aria-label={rotulo}
        aria-invalid={aviso ? true : undefined}
        aria-describedby={aviso ? idDoAviso : undefined}
        placeholder={rotulo}
        value={texto}
        maxLength={5000}
        onChange={(e) => {
          setTexto(e.target.value)
          setAviso(null)
        }}
      />
      {aviso && (
        <p id={idDoAviso} className="text-sm text-destructive">
          {aviso}
        </p>
      )}
      <div className="flex gap-2">
        <Button
          type="submit"
          size="sm"
          className={`${BOTAO_FORTE} toque:h-11`}
          disabled={enviando}
        >
          {enviando ? 'Enviando…' : rotuloDoBotao}
        </Button>
        {aoCancelar && (
          <Button
            type="button"
            size="sm"
            className="toque:h-11"
            variant="ghost"
            onClick={aoCancelar}
          >
            Cancelar
          </Button>
        )}
      </div>
    </form>
  )
}
