import { Check, Copy } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Button } from '#/components/ui/button'
import { toast } from '#/lib/toast'
import { cn } from '#/lib/utils'
import { enderecoDeValidacao } from '#/regras/certificado-qr'

/** "Copiado ✓" por 1,5 s e volta (#88). */
const TEMPO_DO_COPIADO = 1500

function useCopiarLink(codigo: string) {
  const [copiado, setCopiado] = useState(false)
  const relogio = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(
    () => () => {
      if (relogio.current) clearTimeout(relogio.current)
    },
    [],
  )
  async function copiar() {
    try {
      await navigator.clipboard.writeText(
        enderecoDeValidacao(window.location.origin, codigo),
      )
    } catch {
      toast.error('Não deu para copiar. Tente de novo.')
      return
    }
    setCopiado(true)
    if (relogio.current) clearTimeout(relogio.current)
    relogio.current = setTimeout(() => setCopiado(false), TEMPO_DO_COPIADO)
  }
  return { copiado, copiar }
}

/** "Copiar link de validação" do certificado, que vira "Copiado ✓" por um instante. */
export function BotaoCopiarLinkDeValidacao({
  codigo,
  cursoNome,
  size = 'sm',
  className,
}: {
  codigo: string
  cursoNome: string
  size?: 'sm' | 'lg'
  className?: string
}) {
  const { copiado, copiar } = useCopiarLink(codigo)
  return (
    <Button
      size={size}
      variant="outline"
      className={cn('toque:h-11', className)}
      onClick={() => void copiar()}
      aria-label={
        copiado ? 'Copiado' : `Copiar link de validação de ${cursoNome}`
      }
    >
      {copiado ? <Check /> : <Copy />}
      {copiado ? 'Copiado' : 'Copiar link de validação'}
    </Button>
  )
}
