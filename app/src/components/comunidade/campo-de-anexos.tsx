import { Paperclip, X } from 'lucide-react'
import { useRef, useState } from 'react'
import { enviarParaAComunidade } from '#/components/comunidade/envio'
import { tamanhoLegivel } from '#/components/comunidade/tempo'
import { Button } from '#/components/ui/button'
import { toast } from '#/lib/toast'
import { LIMITE_DE_ANEXOS } from '#/regras/anexos-da-comunidade'

export interface AnexoDoCampo {
  chave: string
  nome: string
  tipo: string
  tamanho: number
}

// Até 3 anexos de 10 MB, de qualquer tipo. O arquivo sobe ao escolher; a chave volta ao publicar.
export function CampoDeAnexos({
  anexos,
  onChange,
}: {
  anexos: AnexoDoCampo[]
  onChange: (anexos: AnexoDoCampo[]) => void
}) {
  const entrada = useRef<HTMLInputElement>(null)
  const [enviando, setEnviando] = useState(false)
  const cheio = anexos.length >= LIMITE_DE_ANEXOS

  async function escolher(arquivo: File | undefined) {
    if (!arquivo) return
    setEnviando(true)
    try {
      onChange([...anexos, await enviarParaAComunidade(arquivo, 'anexo')])
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Não deu para enviar.')
    } finally {
      setEnviando(false)
      if (entrada.current) entrada.current.value = ''
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-3">
        <input
          ref={entrada}
          type="file"
          className="sr-only"
          aria-label="Escolher anexo"
          onChange={(e) => escolher(e.target.files?.[0])}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="toque:h-11"
          disabled={enviando || cheio}
          onClick={() => entrada.current?.click()}
        >
          <Paperclip />
          {enviando ? 'Enviando…' : 'Anexar arquivo'}
        </Button>
        <span className="text-xs text-muted-foreground">
          Até {LIMITE_DE_ANEXOS} anexos de 10 MB cada.
        </span>
      </div>
      {anexos.length > 0 && (
        <ul className="flex flex-col gap-1">
          {anexos.map((a) => (
            <li
              key={a.chave}
              className="flex items-center justify-between gap-2 rounded-md border bg-surface px-3 py-1.5 text-sm"
            >
              <span className="truncate">
                {a.nome}{' '}
                <span className="text-xs text-muted-foreground">
                  ({tamanhoLegivel(a.tamanho)})
                </span>
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                className="toque:size-11"
                aria-label={`Remover ${a.nome}`}
                onClick={() => onChange(anexos.filter((x) => x !== a))}
              >
                <X />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
