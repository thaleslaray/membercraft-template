import { ArrowDown, ArrowUp } from 'lucide-react'
import { Button } from '#/components/ui/button'

export function BotoesDeOrdem({
  aoMover,
  naPrimeira,
  naUltima,
  rotulo,
}: {
  aoMover: (deslocamento: -1 | 1) => void
  naPrimeira: boolean
  naUltima: boolean
  rotulo: string
}) {
  return (
    <span className="flex">
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className="toque:size-11"
        disabled={naPrimeira}
        aria-label={`Subir ${rotulo}`}
        onClick={() => aoMover(-1)}
      >
        <ArrowUp />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className="toque:size-11"
        disabled={naUltima}
        aria-label={`Descer ${rotulo}`}
        onClick={() => aoMover(1)}
      >
        <ArrowDown />
      </Button>
    </span>
  )
}
