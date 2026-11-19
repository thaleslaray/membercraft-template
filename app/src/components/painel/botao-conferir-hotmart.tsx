import { useState } from 'react'
import { useAcao } from '#/components/painel/use-acao'
import { Button } from '#/components/ui/button'
import { conferirAgoraDaHotmartFn } from '#/lib/hotmart-conferencia-fns'

// Repete na hora a conferência diária das vendas da Hotmart (só o Proprietário).
export function BotaoConferirHotmart() {
  const { executar, ocupado } = useAcao()
  const [resultado, setResultado] = useState<{
    ok: boolean
    mensagem: string
  } | null>(null)

  async function conferirAgora() {
    const r = await executar(() => conferirAgoraDaHotmartFn())
    if (r) setResultado(r)
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button
        type="button"
        disabled={ocupado}
        onClick={() => void conferirAgora()}
        className="w-fit toque:min-h-11"
      >
        {ocupado ? 'Conferindo…' : 'Conferir com a Hotmart'}
      </Button>
      {resultado && (
        <p
          role="status"
          className={
            resultado.ok ? 'text-sm' : 'text-sm font-medium text-destructive'
          }
        >
          {resultado.mensagem}
        </p>
      )}
    </div>
  )
}
