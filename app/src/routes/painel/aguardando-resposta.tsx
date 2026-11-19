import { createFileRoute, Link } from '@tanstack/react-router'
import { tempoRelativo } from '#/components/comunidade/tempo'
import { AbasDoPainel } from '#/components/painel/abas'
import { VazioDoPainel } from '#/components/painel/estados'
import { CabecalhoDaPagina, PaginaDoPainel } from '#/components/painel/pagina'
import { Paginacao } from '#/components/painel/paginacao'
import { Badge } from '#/components/ui/badge'
import { Card, CardContent } from '#/components/ui/card'
import {
  aguardandoRespostaFn,
  comentariosRecentesFn,
} from '#/lib/comunidade-fns'
import { FUSO_DA_ESCOLA } from '#/lib/datas'
import { paginaDaBusca } from '#/lib/pagina-da-busca'

// Fila "Aguardando resposta": publicações em aberto que nenhuma pessoa da Equipe comentou, mais os
// comentários recentes de todas as comunidades.
interface Busca {
  aba?: 'recentes'
  pagina?: number
}

export const Route = createFileRoute('/painel/aguardando-resposta')({
  validateSearch: (search: Record<string, unknown>): Busca => {
    const pagina = paginaDaBusca(search.pagina)
    return {
      ...(search.aba === 'recentes' ? { aba: 'recentes' as const } : {}),
      ...(pagina ? { pagina } : {}),
    }
  },
  loaderDeps: ({ search }) => search,
  loader: async ({ deps }) => {
    const pagina = deps.pagina ?? 1
    return deps.aba === 'recentes'
      ? {
          aba: 'recentes' as const,
          dados: await comentariosRecentesFn({ data: { pagina } }),
        }
      : {
          aba: 'aguardando' as const,
          dados: await aguardandoRespostaFn({ data: { pagina } }),
        }
  },
  head: () => ({ meta: [{ title: 'Aguardando resposta · Estúdio' }] }),
  component: AguardandoResposta,
})

function AguardandoResposta() {
  const fuso = FUSO_DA_ESCOLA
  const carga = Route.useLoaderData()
  const { total, pagina, porPagina } = carga.dados
  const totalDePaginas = Math.max(1, Math.ceil(total / porPagina))

  return (
    <PaginaDoPainel>
      <CabecalhoDaPagina
        titulo="Aguardando resposta"
        contexto="Publicações em aberto que ninguém da equipe comentou, das que esperam há mais tempo para as mais novas."
      />

      <AbasDoPainel
        rotulo="Seções de Aguardando resposta"
        abas={[
          {
            rotulo: 'Aguardando resposta',
            para: '/painel/aguardando-resposta',
            search: { aba: undefined },
          },
          {
            rotulo: 'Comentários recentes',
            para: '/painel/aguardando-resposta',
            search: { aba: 'recentes' },
          },
        ]}
      />

      {total === 0 ? (
        <VazioDoPainel
          titulo={
            carga.aba === 'recentes'
              ? 'Nenhum comentário ainda'
              : 'Nada esperando resposta'
          }
          mensagem={
            carga.aba === 'recentes'
              ? 'Quando alguém comentar numa publicação, o comentário aparece aqui.'
              : 'A fila está em dia. Veja os comentários recentes para acompanhar as conversas.'
          }
        />
      ) : carga.aba === 'recentes' ? (
        <ul
          id="lista"
          tabIndex={-1}
          className="flex flex-col gap-3 outline-none"
        >
          {carga.dados.itens.map((c) => (
            <li key={c.id}>
              <Card>
                <CardContent className="flex flex-col gap-1">
                  <p className="text-sm whitespace-pre-wrap break-words">
                    {c.texto}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {c.autorNome}
                    {c.daEquipe && ' (equipe)'} em{' '}
                    <Link
                      to="/comunidades/publicacoes/$publicacaoId"
                      params={{ publicacaoId: c.publicacaoId }}
                      className="text-primary underline"
                    >
                      {c.publicacaoTitulo}
                    </Link>{' '}
                    · {c.comunidadeNome} · {tempoRelativo(c.criadoEm, fuso)}
                  </p>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      ) : (
        <ul
          id="lista"
          tabIndex={-1}
          className="flex flex-col gap-3 outline-none"
        >
          {carga.dados.itens.map((p) => (
            <li key={p.id}>
              <Card>
                <CardContent className="flex flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      to="/comunidades/publicacoes/$publicacaoId"
                      params={{ publicacaoId: p.id }}
                      className="font-medium text-foreground underline"
                    >
                      {p.titulo}
                    </Link>
                    <Badge variant="outline">{p.comunidadeNome}</Badge>
                  </div>
                  {p.resumo && (
                    <p className="line-clamp-2 text-sm text-muted-foreground">
                      {p.resumo}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    {p.autorNome} · {tempoRelativo(p.criadoEm, fuso)} ·{' '}
                    {p.comentarios}{' '}
                    {p.comentarios === 1 ? 'comentário' : 'comentários'} de
                    alunos
                  </p>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <Paginacao
        pagina={pagina}
        totalDePaginas={totalDePaginas}
        inicio="lista"
      />
    </PaginaDoPainel>
  )
}
