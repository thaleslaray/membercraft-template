import { Lock } from 'lucide-react'
import { useFusoDoAluno } from '#/lib/auth-queries'
import { type SituacaoDoConteudo, textoDoCadeado } from '#/regras/cadeado'

// O cadeado e o motivo de um conteúdo que ainda não abre. Não mostra nada se estiver liberado.
export function Cadeado({
  situacao,
  className = '',
}: {
  situacao: SituacaoDoConteudo | undefined
  className?: string
}) {
  const fuso = useFusoDoAluno()
  if (situacao?.tipo !== 'cadeado') return null
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-xs text-muted-foreground ${className}`}
    >
      <Lock className="size-3.5" aria-hidden="true" />
      <span>{textoDoCadeado(situacao, fuso)}</span>
    </span>
  )
}
