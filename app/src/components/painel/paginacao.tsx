/**
 * Navegação de listas paginadas de 20 em 20 (P11): "Anterior", "Página X de Y" e "Próxima". Some
 * quando a lista cabe em uma página só.
 *
 * Padrão do painel: links com a página na busca da URL (dá para voltar, recarregar e mandar o
 * endereço). Ao trocar de página, o foco vai ao início da lista (`inicio`: id de um elemento com
 * `tabIndex={-1}`, em geral o título da lista):
 *
 *   <h2 id="avisos" tabIndex={-1}>Avisos recebidos</h2>
 *   ...
 *   <Paginacao pagina={avisos.pagina} totalDePaginas={avisos.totalDePaginas} inicio="avisos" />
 *
 * A rota lê a página com `paginaDaBusca(search.pagina)`; a primeira página não vai para a URL.
 * `aoMudar` (botões em vez de links) fica só para quem ainda não guarda a página na URL.
 */
import { Link } from '@tanstack/react-router'
import { useEffect, useRef } from 'react'
import { Button } from '#/components/ui/button'
import { paginaNaBusca } from '#/regras/painel'

export function Paginacao({
  pagina,
  totalDePaginas,
  aoMudar,
  inicio,
}: {
  pagina: number
  totalDePaginas: number
  aoMudar?: (pagina: number) => void
  inicio?: string
}) {
  const anterior = useRef(pagina)
  useEffect(() => {
    if (anterior.current === pagina) return
    anterior.current = pagina
    if (inicio) document.getElementById(inicio)?.focus()
  }, [pagina, inicio])

  if (totalDePaginas <= 1) return null
  const texto = (
    <span className="text-sm text-muted-foreground tabular-nums">
      Página {pagina} de {totalDePaginas}
    </span>
  )
  if (aoMudar) {
    return (
      <nav
        aria-label="Páginas"
        className="flex items-center justify-between gap-3"
      >
        <Button
          variant="outline"
          size="sm"
          disabled={pagina <= 1}
          onClick={() => aoMudar(pagina - 1)}
        >
          Anterior
        </Button>
        <span className="text-sm text-muted-foreground">
          Página {pagina} de {totalDePaginas}
        </span>
        <Button
          variant="outline"
          size="sm"
          disabled={pagina >= totalDePaginas}
          onClick={() => aoMudar(pagina + 1)}
        >
          Próxima
        </Button>
      </nav>
    )
  }
  const ir = (para: number, rotulo: string, desligado: boolean) =>
    desligado ? (
      <Button variant="outline" size="sm" disabled className="toque:min-h-11">
        {rotulo}
      </Button>
    ) : (
      <Button asChild variant="outline" size="sm" className="toque:min-h-11">
        <Link
          to="."
          search={
            ((atual: Record<string, unknown>) => ({
              ...atual,
              pagina: paginaNaBusca(para),
            })) as never
          }
          resetScroll={false}
        >
          {rotulo}
        </Link>
      </Button>
    )
  return (
    <nav
      aria-label="Páginas"
      className="flex items-center justify-between gap-3"
    >
      {ir(pagina - 1, 'Anterior', pagina <= 1)}
      {texto}
      {ir(pagina + 1, 'Próxima', pagina >= totalDePaginas)}
    </nav>
  )
}
