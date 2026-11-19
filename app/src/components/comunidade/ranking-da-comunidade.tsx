import { Link } from '@tanstack/react-router'
import { CARD_DE_LEITURA } from '#/components/casca-lume/pagina-lume'
import { DemaisPosicoes, Podio } from '#/components/comunidade/podio'
import { Card } from '#/components/ui/card'
import { NumeroQueCresce } from '#/components/ui/numero-que-cresce'
import {
  AcaoContinuarEstudando,
  TelaVazia,
} from '#/components/vazio/tela-vazia'
import { useFusoDoAluno } from '#/lib/auth-queries'
import { formatarDataNoFuso } from '#/lib/datas'
import type { LinhaDoExtrato, RankingDoCurso } from '#/regras/pontos'

export interface DadosDoRanking extends RankingDoCurso {
  cursos: { id: string; nome: string }[]
  cursoId: string | null
  ultimos: LinhaDoExtrato[]
}

const formatarPontos = (pontos: number) =>
  `${pontos > 0 ? '+' : ''}${pontos.toLocaleString('pt-BR')}`

// A aba Ranking da Comunidade: o curso se escolhe num seletor, depois vêm a posição de quem olha,
// o pódio, as demais posições e os 3 últimos lançamentos (o extrato inteiro fica em "Seus pontos").
export function RankingDaComunidade({
  dados,
  eu: pessoa,
  aoEscolherCurso,
}: {
  dados: DadosDoRanking
  eu: { id: string; nome: string; imagem: string | null }
  aoEscolherCurso: (cursoId: string | undefined) => void
}) {
  const { cursos, cursoId, primeiros, eu, ultimos } = dados
  const euNoTopo = primeiros.some((p) => p.userId === pessoa.id)
  const podio = primeiros.slice(0, 3)
  const resto = primeiros.slice(3)
  const fora =
    eu && !euNoTopo
      ? {
          userId: pessoa.id,
          nome: pessoa.nome,
          imagem: pessoa.imagem,
          bio: null,
          pontos: eu.pontos,
          posicao: eu.posicao,
        }
      : null
  return (
    <div className="troca-de-aba flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <h2 className="text-lg font-semibold tracking-[-0.01em]">
          Os 10 primeiros em pontos
        </h2>
        {cursos.length > 0 && (
          <select
            aria-label="Ranking de"
            value={cursoId ?? ''}
            onChange={(e) => aoEscolherCurso(e.target.value || undefined)}
            className="h-9 toque:h-11 max-w-full min-w-0 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            <option value="">Geral</option>
            {cursos.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>
        )}
      </div>

      {eu && (
        <Card
          className={`gap-1 px-5 py-4 ${CARD_DE_LEITURA} in-data-[casca=lume]:px-[calc(1.25rem*var(--leitura-recuo))]`}
          data-testid="minha-posicao"
        >
          <p className="text-sm text-muted-foreground">Sua posição</p>
          <p className="text-2xl font-semibold tabular-nums">
            {eu.posicao}º
            <span className="ml-2 text-base font-normal text-muted-foreground">
              com{' '}
              <NumeroQueCresce
                key={cursoId ?? 'geral'}
                valor={eu.pontos}
                onde={{
                  usuarioId: pessoa.id,
                  lugar: `ranking-pontos:${cursoId ?? 'geral'}`,
                }}
              />{' '}
              pontos
            </span>
          </p>
        </Card>
      )}

      {primeiros.length === 0 ? (
        <TelaVazia
          ilustracao="fita"
          titulo="Ninguém pontuou ainda"
          texto="Conclua aulas, comente e faça exercícios para entrar no ranking."
          acao={<AcaoContinuarEstudando />}
        />
      ) : (
        <>
          <Podio podio={podio} euId={pessoa.id} />
          {resto.length > 0 || fora ? (
            <DemaisPosicoes resto={resto} euId={pessoa.id} fora={fora} />
          ) : null}
        </>
      )}

      <UltimosPontos linhas={ultimos} />
    </div>
  )
}

function UltimosPontos({ linhas }: { linhas: LinhaDoExtrato[] }) {
  const fuso = useFusoDoAluno()
  return (
    <Card
      className={`gap-3 px-5 py-4 ${CARD_DE_LEITURA} in-data-[casca=lume]:px-[calc(1.25rem*var(--leitura-recuo))]`}
      data-testid="ultimos-pontos"
    >
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="font-semibold">Seus últimos pontos</h3>
        <Link to="/pontos" className="text-sm">
          Ver meus pontos
        </Link>
      </div>
      {linhas.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Você ainda não tem pontos. Conclua uma aula para começar.
        </p>
      ) : (
        <ul className="divide-y">
          {linhas.map((l) => (
            <li
              key={l.id}
              className="flex items-baseline justify-between gap-3 py-2 first:pt-0 last:pb-0"
            >
              <div className="min-w-0">
                <p className="text-sm break-words">{l.descricao}</p>
                <p className="text-xs text-muted-foreground">
                  {formatarDataNoFuso(l.criadoEm, fuso)}
                </p>
              </div>
              <span className="font-medium tabular-nums">
                {formatarPontos(l.pontos)}
                <span className="sr-only"> pontos</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
