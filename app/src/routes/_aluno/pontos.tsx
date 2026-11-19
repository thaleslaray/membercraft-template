import { createFileRoute, Link } from '@tanstack/react-router'
import { Coins } from 'lucide-react'
import {
  APOIO_NA_REGUA,
  CARD_DE_LEITURA,
  TITULO_DE_APOIO,
} from '#/components/casca-lume/pagina-lume'
import { Paginacao } from '#/components/painel/paginacao'
import { Card } from '#/components/ui/card'
import { NumeroQueCresce } from '#/components/ui/numero-que-cresce'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '#/components/ui/table'
import { EsqueletoDePontos } from '#/components/vazio/esqueletos'
import {
  AcaoContinuarEstudando,
  TelaVazia,
} from '#/components/vazio/tela-vazia'
import { appConfig } from '#/config/app'
import { useFusoDoAluno } from '#/lib/auth-queries'
import { pendingMsDaRota, useCarregandoRota } from '#/lib/carregamento-da-rota'
import { formatarDataNoFuso } from '#/lib/datas'
import { paginaDaBusca } from '#/lib/pagina-da-busca'
import { meusPontosFn } from '#/lib/pontos-fns'

// "Meus pontos": o extrato do aluno, do lançamento mais recente ao mais antigo.
export const Route = createFileRoute('/_aluno/pontos')({
  head: () => ({ meta: [{ title: `Meus pontos · ${appConfig.name}` }] }),
  validateSearch: (s: Record<string, unknown>): { pagina?: number } => ({
    pagina: paginaDaBusca(s.pagina),
  }),
  loaderDeps: ({ search }) => ({ pagina: search.pagina }),
  loader: ({ deps }) => meusPontosFn({ data: { pagina: deps.pagina } }),
  pendingComponent: EsqueletoDePontos,
  // Só o primeiro carregamento mostra o esqueleto; trocar filtro ou página apaga o conteúdo antigo.
  get pendingMs() {
    return pendingMsDaRota('/_aluno/pontos')
  },
  component: MeusPontos,
})

// No celular (até 760 px) cada lançamento vira um bloco: o motivo em cima, os pontos à direita e, embaixo,
// a data e o curso. No computador é a tabela, com o recuo das pontas pelo token `--leitura-recuo`.
const PONTA_ESQUERDA =
  'in-data-[casca=lume]:lume-tela:pl-[calc(0.5rem*var(--leitura-recuo))]'
const PONTA_DIREITA =
  'in-data-[casca=lume]:lume-tela:pr-[calc(0.5rem*var(--leitura-recuo))]'
const LINHA_EMPILHADA =
  'lume-cel:grid lume-cel:grid-cols-[minmax(0,1fr)_auto] lume-cel:gap-x-4 lume-cel:px-4 lume-cel:py-3 in-data-[casca=lume]:lume-cel:px-[calc(1rem*var(--leitura-recuo))]'

const formatarPontos = (pontos: number) =>
  `${pontos > 0 ? '+' : ''}${pontos.toLocaleString('pt-BR')}`

function MeusPontos() {
  const carregando = useCarregandoRota()
  const { total, linhas, pagina, totalDePaginas } = Route.useLoaderData()
  const navegar = Route.useNavigate()
  const fuso = useFusoDoAluno()
  const { session } = Route.useRouteContext()
  return (
    <main
      aria-busy={carregando}
      data-pendente={carregando}
      className={`transition-opacity duration-base ease-saida data-[pendente=true]:opacity-50 flex flex-1 flex-col gap-6 mx-auto w-full max-w-[65rem] px-4 pt-6 pb-8 md:px-8 md:py-14 ${APOIO_NA_REGUA}`}
    >
      <div className="flex flex-col gap-1">
        <h1 className={`text-2xl leading-8 font-semibold ${TITULO_DE_APOIO}`}>
          Meus pontos
        </h1>
        <p className="text-muted-foreground">
          Tudo o que você ganhou ou perdeu.{' '}
          <Link
            to="/comunidades"
            search={{ aba: 'ranking' }}
            className="underline underline-offset-[3px]"
          >
            Ver o ranking
          </Link>
        </p>
      </div>

      <Card
        className={`flex-row items-center gap-3 px-6 py-5 ${CARD_DE_LEITURA} in-data-[casca=lume]:px-[calc(1.5rem*var(--leitura-recuo))]`}
      >
        <span className="grid size-11 place-items-center rounded-full bg-background text-primary">
          <Coins className="size-5" aria-hidden="true" />
        </span>
        <div>
          <p className="text-sm text-muted-foreground">Total</p>
          <p className="text-2xl font-semibold">
            <NumeroQueCresce
              valor={total}
              onde={{ usuarioId: session.user.id, lugar: 'pontos-total' }}
            />
          </p>
        </div>
      </Card>

      {linhas.length === 0 ? (
        <TelaVazia
          ilustracao="fita"
          titulo="Você ainda não tem pontos"
          texto="Conclua uma aula para começar."
          acao={<AcaoContinuarEstudando />}
        />
      ) : (
        <Card className={`py-0 ${CARD_DE_LEITURA}`}>
          <Table className="lume-cel:block">
            <TableHeader className="lume-cel:sr-only">
              <TableRow>
                <TableHead className={PONTA_ESQUERDA}>Data</TableHead>
                <TableHead>Origem ou motivo</TableHead>
                <TableHead>Curso</TableHead>
                <TableHead className={`text-right ${PONTA_DIREITA}`}>
                  Pontos
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="lume-cel:block">
              {linhas.map((l) => (
                <TableRow key={l.id} className={LINHA_EMPILHADA}>
                  <TableCell
                    className={`whitespace-nowrap ${PONTA_ESQUERDA} lume-cel:col-start-1 lume-cel:row-start-2 lume-cel:p-0 lume-cel:text-xs lume-cel:text-muted-foreground`}
                  >
                    {formatarDataNoFuso(l.criadoEm, fuso)}
                  </TableCell>
                  <TableCell className="break-words whitespace-normal lume-cel:col-start-1 lume-cel:row-start-1 lume-cel:p-0">
                    {l.descricao}
                  </TableCell>
                  <TableCell className="lume-cel:col-start-1 lume-cel:row-start-3 lume-cel:p-0 lume-cel:text-xs lume-cel:text-muted-foreground">
                    {l.cursoNome ?? 'Geral'}
                  </TableCell>
                  <TableCell
                    className={`text-right font-medium ${PONTA_DIREITA} lume-cel:col-start-2 lume-cel:row-span-3 lume-cel:row-start-1 lume-cel:p-0 ${l.pontos < 0 ? 'text-destructive' : ''}`}
                  >
                    {formatarPontos(l.pontos)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
      <Paginacao
        pagina={pagina}
        totalDePaginas={totalDePaginas}
        aoMudar={(p) => navegar({ search: { pagina: p > 1 ? p : undefined } })}
      />
    </main>
  )
}
