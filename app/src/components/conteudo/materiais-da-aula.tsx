import { Download } from 'lucide-react'
import { Button } from '#/components/ui/button'

const NUMERO_BR = new Intl.NumberFormat('pt-BR', {
  maximumFractionDigits: 1,
  minimumFractionDigits: 1,
})

// Espaço inseparável antes da unidade: o número não fica numa linha e o "KB" na outra.
function tamanhoLegivel(bytes: number) {
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))}\u00A0KB`
  }
  return `${NUMERO_BR.format(bytes / 1024 / 1024)}\u00A0MB`
}

export function Materiais({
  materiais,
}: {
  materiais: { id: string; nome: string; tamanho: number }[]
}) {
  return (
    <section aria-label="Materiais da aula">
      {/* Moldura por token só na casca Lume (variante `in-data-[casca=lume]`): o Ateliê tira as laterais e o
          recuo e deixa só os fios entre as linhas. A casca clássica fica como era. */}
      <ul className="flex flex-col divide-y rounded-[calc(var(--radius)+4px)] border in-data-[casca=lume]:rounded-(--materiais-raio) in-data-[casca=lume]:border-x-(color:--materiais-lado)">
        {materiais.map((m) => (
          <li
            key={m.id}
            className="flex items-center gap-3 px-4 py-3 text-sm in-data-[casca=lume]:px-(--materiais-recuo)"
          >
            <span lang="pt-BR" className="min-w-0 flex-1 break-words">
              {m.nome}
            </span>
            <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
              {tamanhoLegivel(m.tamanho)}
            </span>
            <Button
              variant="outline"
              size="sm"
              asChild
              className="relative after:absolute after:inset-x-0 after:-inset-y-1.5 after:content-['']"
            >
              <a href={`/api/materiais/${m.id}`} download>
                <Download />
                Baixar
                <span className="sr-only"> {m.nome}</span>
              </a>
            </Button>
          </li>
        ))}
      </ul>
    </section>
  )
}
