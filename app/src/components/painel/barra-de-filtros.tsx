/**
 * Barra de filtros do painel (P12): cada filtro aplica na hora (no `onChange`), grava na busca da
 * URL e volta a lista para a página 1. Com algum filtro ligado, aparece "Limpar filtros".
 *
 *   const busca = Route.useSearch()
 *   <BarraDeFiltros
 *     rotulo="Filtrar avisos"
 *     valores={busca}                                  // a busca atual da rota
 *     filtros={[
 *       { chave: 'situacao', rotulo: 'Situação', opcoes: [{ valor: 'com_erro', rotulo: 'Com erro' }, ...] },
 *       { chave: 'gateway', rotulo: 'Plataforma', opcoes: [...], todas: 'Todas as plataformas' },
 *     ]}
 *   />
 *
 * A rota valida a busca no `validateSearch` (valor desconhecido vira `undefined`) e usa as chaves
 * no `loaderDeps`. A opção vazia ("Todas", ou `todas`) tira a chave da URL. A página (`pagina`)
 * sai da URL a cada mudança.
 */
import { useNavigate } from '@tanstack/react-router'
import { useId } from 'react'
import { Button } from '#/components/ui/button'
import { Label } from '#/components/ui/label'
import { SelectNativo } from '#/components/ui/select-nativo'

export type FiltroDaBarra = {
  chave: string
  rotulo: string
  opcoes: { valor: string; rotulo: string }[]
  /** Texto da opção sem filtro; padrão "Todas". */
  todas?: string
}

export function BarraDeFiltros({
  rotulo,
  filtros,
  valores,
}: {
  rotulo: string
  filtros: FiltroDaBarra[]
  valores: Record<string, unknown>
}) {
  const navegar = useNavigate()
  const base = useId()
  const ligado = filtros.some((f) => valores[f.chave] !== undefined)

  function aplicar(mudanca: Record<string, string | undefined>) {
    navegar({
      to: '.',
      search: ((atual: Record<string, unknown>) => ({
        ...atual,
        ...mudanca,
        pagina: undefined,
      })) as never,
      replace: true,
      resetScroll: false,
    })
  }

  return (
    <search
      aria-label={rotulo}
      className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end"
    >
      {filtros.map((f) => {
        const id = `${base}-${f.chave}`
        return (
          <div key={f.chave} className="flex min-w-0 flex-col gap-1.5 sm:w-52">
            <Label htmlFor={id}>{f.rotulo}</Label>
            <SelectNativo
              id={id}
              value={String(valores[f.chave] ?? '')}
              onChange={(e) =>
                aplicar({ [f.chave]: e.target.value || undefined })
              }
            >
              <option value="">{f.todas ?? 'Todas'}</option>
              {f.opcoes.map((o) => (
                <option key={o.valor} value={o.valor}>
                  {o.rotulo}
                </option>
              ))}
            </SelectNativo>
          </div>
        )
      })}
      {ligado ? (
        <Button
          type="button"
          variant="ghost"
          className="self-start sm:self-end toque:min-h-11"
          onClick={() =>
            aplicar(
              Object.fromEntries(filtros.map((f) => [f.chave, undefined])),
            )
          }
        >
          Limpar filtros
        </Button>
      ) : null}
    </search>
  )
}
