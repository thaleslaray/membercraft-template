import { createFileRoute, Link } from '@tanstack/react-router'
import { useState } from 'react'
import { AbasDoPainel } from '#/components/painel/abas'
import { VazioDoPainel } from '#/components/painel/estados'
import { EtiquetaDeEstado } from '#/components/painel/etiqueta-de-estado'
import { CampoDoPainel } from '#/components/painel/formulario'
import { CabecalhoDaPagina, PaginaDoPainel } from '#/components/painel/pagina'
import { Paginacao } from '#/components/painel/paginacao'
import { useAcao } from '#/components/painel/use-acao'
import { Button } from '#/components/ui/button'
import { Card, CardContent } from '#/components/ui/card'
import { Input } from '#/components/ui/input'
import { Textarea } from '#/components/ui/textarea'
import { FUSO_DA_ESCOLA, formatarDataNoFuso } from '#/lib/datas'
import {
  liberarPedidoDoMecFn,
  pedidosDoMecFn,
  problemaNoPedidoDoMecFn,
  tentarDeNovoPedidoDoMecFn,
} from '#/lib/pedido-do-mec-fns'
import { estadoDoPedidoDoMec } from '#/regras/estados-do-aluno'
import {
  type EstadoDoPedido,
  LIMITE_DE_DIAS_UTEIS,
  LIMITE_DO_MOTIVO,
  type PedidoDaFila,
} from '#/regras/pedido-do-mec'

// Fila "Certificado do MEC": os Pedidos do MEC da Formação. A equipe libera o certificado na Voomp à
// mão e marca aqui; o que passou de 5 dias úteis na fila fica em destaque.
interface Busca {
  estado?: EstadoDoPedido
  pagina?: number
}

const ESTADOS_DA_ABA: EstadoDoPedido[] = ['na_fila', 'problema', 'liberado']

export const Route = createFileRoute('/painel/certificado-do-mec')({
  validateSearch: (search: Record<string, unknown>): Busca => {
    const pagina = Math.floor(Number(search.pagina))
    const estado = ESTADOS_DA_ABA.find((e) => e === search.estado)
    return {
      ...(estado && estado !== 'na_fila' ? { estado } : {}),
      ...(pagina > 1 ? { pagina } : {}),
    }
  },
  loaderDeps: ({ search }) => search,
  loader: ({ deps }) =>
    pedidosDoMecFn({
      data: { estado: deps.estado ?? 'na_fila', pagina: deps.pagina ?? 1 },
    }),
  head: () => ({ meta: [{ title: 'Certificado do MEC · Estúdio' }] }),
  component: CertificadoDoMec,
})

const ROTULO_DA_ABA: Record<EstadoDoPedido, string> = {
  na_fila: 'Na fila',
  problema: 'Problema',
  liberado: 'Liberado',
}

const LINK_DA_VOOMP = /^https?:\/\/\S+$/

function CertificadoDoMec() {
  const lista = Route.useLoaderData()
  const { estado = 'na_fila' } = Route.useSearch()
  const totalDePaginas = Math.max(1, Math.ceil(lista.total / lista.porPagina))

  return (
    <PaginaDoPainel>
      <CabecalhoDaPagina
        titulo="Certificado do MEC"
        contexto={`Os pedidos da Formação para liberar na Voomp. Passados ${LIMITE_DE_DIAS_UTEIS} dias úteis na fila, o pedido ganha destaque.`}
      />

      <AbasDoPainel
        rotulo="Situação dos pedidos"
        abas={ESTADOS_DA_ABA.map((e) => ({
          rotulo:
            e === 'na_fila' && lista.atrasados > 0
              ? `${ROTULO_DA_ABA[e]} (${lista.contagens[e]}, ${lista.atrasados} em atraso)`
              : `${ROTULO_DA_ABA[e]} (${lista.contagens[e]})`,
          para: '/painel/certificado-do-mec',
          search: { estado: e === 'na_fila' ? undefined : e },
        }))}
      />

      <h2 id="lista-de-pedidos" tabIndex={-1} className="sr-only">
        Pedidos: {ROTULO_DA_ABA[estado]}
      </h2>
      {lista.itens.length === 0 ? (
        <VazioDoPainel
          mensagem={
            estado === 'na_fila'
              ? 'Nenhum pedido na fila. Tudo em dia.'
              : estado === 'problema'
                ? 'Nenhum pedido com problema.'
                : 'Nenhum pedido liberado ainda.'
          }
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {lista.itens.map((p) => (
            <li key={p.id}>
              <Pedido pedido={p} />
            </li>
          ))}
        </ul>
      )}

      <Paginacao
        pagina={lista.pagina}
        totalDePaginas={totalDePaginas}
        inicio="lista-de-pedidos"
      />
    </PaginaDoPainel>
  )
}

const dia = (d: Date | null) => formatarDataNoFuso(d, FUSO_DA_ESCOLA)

function Pedido({ pedido }: { pedido: PedidoDaFila }) {
  const { executar, ocupado, erros } = useAcao()
  const [link, setLink] = useState('')
  const [motivo, setMotivo] = useState('')
  const [comProblema, setComProblema] = useState(false)

  return (
    <Card className={pedido.atrasado ? 'border-destructive' : undefined}>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            to="/painel/alunos/$alunoId"
            params={{ alunoId: pedido.alunoId }}
            className="font-medium text-foreground underline"
          >
            {pedido.alunoNome}
          </Link>
          <span className="text-sm text-muted-foreground [overflow-wrap:anywhere]">
            {pedido.alunoEmail}
          </span>
          <EtiquetaDeEstado
            {...estadoDoPedidoDoMec(pedido.estado, pedido.atrasado)}
          />
          {pedido.atrasado && (
            <span className="text-sm font-medium text-destructive">
              {pedido.diasUteis} dias úteis na fila
            </span>
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          {pedido.cursoNome} · certificado {pedido.codigoDoCertificado} ·{' '}
          {pedido.estado === 'na_fila' &&
            `na fila desde ${dia(pedido.naFilaDesde)} (${pedido.diasUteis} ${pedido.diasUteis === 1 ? 'dia útil' : 'dias úteis'})`}
          {pedido.estado === 'problema' &&
            `problema em ${dia(pedido.problemaEm)}`}
          {pedido.estado === 'liberado' &&
            `liberado em ${dia(pedido.liberadoEm)}`}
        </p>

        {pedido.estado === 'liberado' && pedido.linkDaVoomp && (
          <a
            href={pedido.linkDaVoomp}
            target="_blank"
            rel="noreferrer"
            className="text-sm text-primary underline"
          >
            Link na Voomp
          </a>
        )}

        {pedido.estado === 'problema' && (
          <div className="flex flex-col gap-2">
            <p className="text-sm whitespace-pre-wrap [overflow-wrap:anywhere]">
              <span className="font-medium">Motivo:</span>{' '}
              {pedido.problemaMotivo}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              {pedido.conversaId && (
                <Button
                  asChild
                  variant="outline"
                  size="sm"
                  className="toque:min-h-11"
                >
                  <Link
                    to="/painel/atendimento/$conversaId"
                    params={{ conversaId: pedido.conversaId }}
                  >
                    Abrir o Atendimento
                  </Link>
                </Button>
              )}
              <Button
                type="button"
                size="sm"
                className="toque:min-h-11"
                disabled={ocupado}
                onClick={() =>
                  executar(
                    () =>
                      tentarDeNovoPedidoDoMecFn({
                        data: { pedidoId: pedido.id },
                      }),
                    'O pedido voltou para a fila.',
                  )
                }
              >
                Tentar de novo
              </Button>
            </div>
          </div>
        )}

        {pedido.estado !== 'liberado' && (
          <form
            noValidate
            className="flex flex-col gap-2 sm:flex-row sm:items-start"
            onSubmit={(e) => {
              e.preventDefault()
              void executar(
                () =>
                  liberarPedidoDoMecFn({
                    data: { pedidoId: pedido.id, link },
                  }),
                'Pedido liberado. A aluna foi avisada.',
                {
                  validar: () => ({
                    link: LINK_DA_VOOMP.test(link.trim())
                      ? undefined
                      : 'Cole o link completo da Voomp, começando com https://.',
                  }),
                },
              ).then((ok) => {
                if (ok) setLink('')
              })
            }}
          >
            <CampoDoPainel
              rotulo="Link da Voomp"
              erro={erros.link}
              className="flex-1"
            >
              <Input
                id={`link-${pedido.id}`}
                type="url"
                autoComplete="off"
                spellCheck={false}
                placeholder="https://"
                value={link}
                onChange={(e) => setLink(e.target.value)}
              />
            </CampoDoPainel>
            <div className="flex flex-wrap gap-2 sm:mt-[1.625rem]">
              <Button
                type="submit"
                size="sm"
                className="toque:min-h-11"
                disabled={ocupado}
              >
                Marcar liberado
              </Button>
              {pedido.estado === 'na_fila' && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="toque:min-h-11"
                  aria-expanded={comProblema}
                  onClick={() => setComProblema((v) => !v)}
                >
                  Marcar problema
                </Button>
              )}
            </div>
          </form>
        )}

        {pedido.estado === 'na_fila' && comProblema && (
          <form
            noValidate
            className="flex flex-col gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              void executar(
                () =>
                  problemaNoPedidoDoMecFn({
                    data: { pedidoId: pedido.id, motivo },
                  }),
                'Problema registrado. Abrimos um Atendimento com a aluna.',
                {
                  validar: () => ({
                    motivo:
                      motivo.trim().length >= 3
                        ? undefined
                        : 'Explique o problema em ao menos 3 letras.',
                  }),
                },
              ).then((r) => {
                if (r) {
                  setMotivo('')
                  setComProblema(false)
                }
              })
            }}
          >
            <CampoDoPainel
              rotulo="Motivo (vai para a aluna, no Atendimento)"
              erro={erros.motivo}
            >
              <Textarea
                id={`motivo-${pedido.id}`}
                value={motivo}
                maxLength={LIMITE_DO_MOTIVO}
                rows={3}
                onChange={(e) => setMotivo(e.target.value)}
              />
            </CampoDoPainel>
            <Button
              type="submit"
              size="sm"
              className="self-start toque:min-h-11"
              disabled={ocupado}
            >
              Registrar problema e abrir Atendimento
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  )
}
