/**
 * Par de datas "De" e "Até" para filtros de período do painel. Combina com `BarraDeFiltros`: cada
 * data aplica na hora (no `onChange`), grava `de` e `ate` na busca da URL (aaaa-mm-dd, horário de
 * Brasília) e volta a lista para a página 1. Data incompleta enquanto se digita não faz nada.
 */
import { useNavigate } from '@tanstack/react-router'
import { useId } from 'react'
import { Input } from '#/components/ui/input'
import { Label } from '#/components/ui/label'

const DATA = /^\d{4}-\d{2}-\d{2}$/

export function FiltroDeDatas({ de, ate }: { de?: string; ate?: string }) {
  const navegar = useNavigate()
  const base = useId()

  function aplicar(chave: 'de' | 'ate', valor: string) {
    if (valor !== '' && !DATA.test(valor)) return
    navegar({
      to: '.',
      search: ((atual: Record<string, unknown>) => ({
        ...atual,
        [chave]: valor || undefined,
        pagina: undefined,
      })) as never,
      replace: true,
      resetScroll: false,
    })
  }

  return (
    <>
      {(
        [
          ['de', 'De', de],
          ['ate', 'Até', ate],
        ] as const
      ).map(([chave, rotulo, valor]) => (
        <div key={chave} className="flex min-w-0 flex-col gap-1.5 sm:w-44">
          <Label htmlFor={`${base}-${chave}`}>{rotulo}</Label>
          <Input
            id={`${base}-${chave}`}
            type="date"
            value={valor ?? ''}
            max={chave === 'de' ? ate : undefined}
            min={chave === 'ate' ? de : undefined}
            onChange={(e) => aplicar(chave, e.target.value)}
            className="toque:h-11"
          />
        </div>
      ))}
    </>
  )
}
