import { createFileRoute, Link } from '@tanstack/react-router'
import { useEffect, useRef } from 'react'
import {
  APOIO_NA_REGUA,
  BOTAO_FORTE,
  CARD_DE_LEITURA,
  TITULO_DE_APOIO,
} from '#/components/casca-lume/pagina-lume'
import { BotaoFavorito } from '#/components/conteudo/botao-favorito'
import { MostrarMais, useMostrarMais } from '#/components/painel/mostrar-mais'
import { Button } from '#/components/ui/button'
import { Card } from '#/components/ui/card'
import { EsqueletoDeFavoritos } from '#/components/vazio/esqueletos'
import { TelaVazia } from '#/components/vazio/tela-vazia'
import { appConfig } from '#/config/app'
import { favoritosFn } from '#/lib/favoritos-fns'

// Favoritos: as aulas que o aluno marcou, das mais recentes às mais antigas. Só aparecem as de
// cursos a que ele ainda tem acesso.
export const Route = createFileRoute('/_aluno/favoritos')({
  head: () => ({ meta: [{ title: `Favoritos · ${appConfig.name}` }] }),
  loader: () => favoritosFn(),
  pendingComponent: EsqueletoDeFavoritos,
  component: PaginaDeFavoritos,
})

function PaginaDeFavoritos() {
  const favoritos = Route.useLoaderData()
  const { visiveis, aoMostrarMais } = useMostrarMais(favoritos.length)
  const mostrados = favoritos.slice(0, visiveis)
  const titulo = useRef<HTMLHeadingElement>(null)
  const lista = useRef<HTMLUListElement>(null)
  // Linha desfavoritada e quem recebe o foco quando ela sumir (a seguinte, a anterior, ou o título).
  const pendente = useRef<{ removida: string; foco: string | null } | null>(
    null,
  )

  function aoDesfavoritar(aulaId: string) {
    const i = mostrados.findIndex((f) => f.aulaId === aulaId)
    const vizinha = mostrados[i + 1] ?? mostrados[i - 1]
    pendente.current = { removida: aulaId, foco: vizinha?.aulaId ?? null }
  }

  // A linha some quando a lista recarrega; o botão que tinha o foco sai junto e o foco iria para o body.
  useEffect(() => {
    const p = pendente.current
    if (!p || favoritos.some((f) => f.aulaId === p.removida)) return
    pendente.current = null
    const botao = p.foco
      ? lista.current?.querySelector<HTMLElement>(
          `li[data-aula="${CSS.escape(p.foco)}"] button`,
        )
      : null
    ;(botao ?? titulo.current)?.focus()
  }, [favoritos])
  return (
    <main
      className={`flex flex-1 flex-col gap-6 mx-auto w-full max-w-[65rem] px-4 pt-6 pb-8 md:px-8 md:py-14 ${APOIO_NA_REGUA}`}
    >
      <div className="flex flex-col gap-1">
        <h1
          ref={titulo}
          tabIndex={-1}
          className={`text-2xl leading-8 font-semibold outline-none ${TITULO_DE_APOIO}`}
        >
          Favoritos
        </h1>
        <p className="text-muted-foreground">
          As aulas que você marcou com a estrela.
        </p>
      </div>

      {favoritos.length === 0 ? (
        <TelaVazia
          ilustracao="tecido"
          titulo="Nenhuma aula salva ainda"
          texto="Toque na estrela de uma aula para guardá-la aqui."
          acao={
            <Button asChild className={BOTAO_FORTE}>
              <Link to="/">Ver meus cursos</Link>
            </Button>
          }
        />
      ) : (
        <Card className={`gap-0 py-0 ${CARD_DE_LEITURA}`}>
          <ul ref={lista} className="divide-y">
            {mostrados.map((f) => (
              <li
                key={f.aulaId}
                data-aula={f.aulaId}
                className="flex items-center gap-2 pr-2"
              >
                <Link
                  to="/aulas/$aulaId"
                  params={{ aulaId: f.aulaId }}
                  className="flex flex-1 flex-col gap-0.5 px-4 py-3 text-foreground no-underline hover:underline in-data-[casca=lume]:px-[calc(1rem*var(--leitura-recuo))]"
                >
                  <span className="font-medium">{f.titulo}</span>
                  <span className="text-xs text-muted-foreground">
                    {f.cursoNome} · {f.moduloNome}
                  </span>
                </Link>
                <BotaoFavorito
                  compacto
                  aulaId={f.aulaId}
                  titulo={f.titulo}
                  favoritaInicial
                  aoAlterar={(fav) => {
                    if (!fav) aoDesfavoritar(f.aulaId)
                  }}
                />
              </li>
            ))}
          </ul>
        </Card>
      )}
      <MostrarMais
        visiveis={visiveis}
        total={favoritos.length}
        aoMostrarMais={aoMostrarMais}
      />
    </main>
  )
}
