import {
  CARD_DE_LEITURA,
  LEITURA_NO_PAPEL,
} from '#/components/casca-lume/pagina-lume'
import { AvatarDaPessoa, CartaoDePessoa } from '#/components/pessoa/pessoa'
import { Badge } from '#/components/ui/badge'
import { Card } from '#/components/ui/card'
import type { PosicaoNoRanking } from '#/regras/pontos'

// Pódio e lista de posições do Ranking (vieram da rota antiga /ranking, #94).

// Foto, nome (com o cartão de perfil), selo "Você" e pontos de uma posição.
function LinhaDaPessoa({
  p,
  voce,
  semCartao,
}: {
  p: PosicaoNoRanking
  voce: boolean
  semCartao?: boolean
}) {
  const quem = (
    <>
      <AvatarDaPessoa pessoa={p} />
      <span className="min-w-0 font-medium [overflow-wrap:anywhere] in-data-[voce]:text-(color:--item-ativo-nome)">
        {p.nome}
      </span>
    </>
  )
  return (
    <div className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-x-3 gap-y-1">
      <div className="flex min-w-0 flex-[1_1_10rem] flex-wrap items-center gap-2">
        {semCartao ? (
          <span className="inline-flex min-w-0 items-center gap-2">{quem}</span>
        ) : (
          <CartaoDePessoa
            pessoa={{ ...p, daEquipe: false }}
            className="min-w-0"
          >
            {quem}
          </CartaoDePessoa>
        )}
        {voce && <Badge variant="outline">Você</Badge>}
      </div>
      <span className="font-medium tabular-nums">
        {p.pontos.toLocaleString('pt-BR')}
        <span className="sr-only"> pontos</span>
      </span>
    </div>
  )
}

// No celular o pódio é uma lista empilhada (1º, 2º, 3º). No desktop o DOM segue 1º, 2º, 3º, mas o
// `order` do CSS põe o 1º no centro, mais alto, com os três alinhados pela base. O fundo cresce uma
// vez ao aparecer (o conteúdo fica parado).
function ItemDoPodio({
  p,
  indice,
  voce,
}: {
  p: PosicaoNoRanking
  indice: number
  voce: boolean
}) {
  const primeiro = p.posicao === 1
  // A ordem visual vem do lugar na lista, não da posição: num empate (dois "2º") a posição repete.
  const ordem =
    indice === 0 ? 'md:order-2' : indice === 1 ? 'md:order-1' : 'md:order-3'
  return (
    <li
      className={`relative flex min-w-0 items-center gap-3 p-4 md:flex-col md:justify-end md:text-center ${ordem} ${
        primeiro ? 'md:pt-14 md:pb-6' : 'md:pt-6 md:pb-5'
      }`}
      data-voce={voce ? '' : undefined}
    >
      <span
        aria-hidden="true"
        className={`podio-fundo absolute inset-0 rounded-[var(--radius-card)] border bg-card shadow-xs ${LEITURA_NO_PAPEL} in-data-[casca=lume]:shadow-(--leitura-sombra) in-data-[casca=lume]:rounded-[calc(var(--radius-card)*var(--leitura-quina))]`}
      />
      <span className="relative text-2xl font-semibold tabular-nums">
        {p.posicao}º
      </span>
      <div className="relative flex min-w-0 flex-1 flex-wrap items-center justify-between gap-x-3 gap-y-1 md:w-full md:flex-none md:flex-nowrap md:flex-col md:justify-start">
        <div className="flex min-w-0 flex-[1_1_8rem] items-center gap-3 md:flex-none md:flex-col md:gap-2">
          <CartaoDePessoa
            pessoa={{ ...p, daEquipe: false }}
            className="min-w-0 md:flex-col md:items-center md:gap-2"
          >
            <AvatarDaPessoa
              pessoa={p}
              className={primeiro ? 'size-14 md:size-16' : 'size-14'}
            />
            <span
              title={p.nome}
              className="line-clamp-2 min-w-0 font-medium [overflow-wrap:anywhere] in-data-[voce]:text-(color:--item-ativo-nome) md:text-center"
            >
              {p.nome}
            </span>
          </CartaoDePessoa>
          {voce && <Badge variant="outline">Você</Badge>}
        </div>
        <span className="font-medium tabular-nums">
          {p.pontos.toLocaleString('pt-BR')}
          <span className="sr-only"> pontos</span>
        </span>
      </div>
    </li>
  )
}

/** Os três primeiros. */
export function Podio({
  podio,
  euId,
}: {
  podio: PosicaoNoRanking[]
  euId: string
}) {
  return (
    <ol
      aria-label="Pódio"
      className="grid grid-cols-1 gap-3 md:grid-cols-[repeat(3,minmax(0,1fr))] md:items-end"
    >
      {podio.map((p, indice) => (
        <ItemDoPodio
          key={p.userId}
          p={p}
          indice={indice}
          voce={p.userId === euId}
        />
      ))}
    </ol>
  )
}

/** Da 4ª posição em diante, e a linha extra de quem olha quando está fora do top 10. */
export function DemaisPosicoes({
  resto,
  euId,
  fora,
}: {
  resto: PosicaoNoRanking[]
  euId: string
  /** Quem olha, quando não aparece entre os primeiros. */
  fora: PosicaoNoRanking | null
}) {
  return (
    <Card className={`py-0 ${CARD_DE_LEITURA}`}>
      <ol aria-label="Demais posições" start={4} className="divide-y">
        {resto.map((p) => (
          <li
            key={p.userId}
            className="flex items-center gap-3 p-3 data-[voce]:bg-(color:--item-ativo-fundo) in-data-[casca=lume]:px-[calc(0.75rem*var(--leitura-recuo))]"
            data-voce={p.userId === euId ? '' : undefined}
          >
            <span className="w-10 text-sm text-muted-foreground tabular-nums">
              {p.posicao}º
            </span>
            <LinhaDaPessoa p={p} voce={p.userId === euId} />
          </li>
        ))}
        {fora && (
          <li
            className="flex items-center gap-3 p-3 data-[voce]:bg-(color:--item-ativo-fundo) in-data-[casca=lume]:px-[calc(0.75rem*var(--leitura-recuo))]"
            data-voce=""
            data-fora-do-topo=""
          >
            <span className="w-10 text-sm text-muted-foreground tabular-nums">
              {fora.posicao}º
            </span>
            <LinhaDaPessoa p={fora} voce semCartao />
          </li>
        )}
      </ol>
    </Card>
  )
}
