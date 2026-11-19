import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import type { ComponentType, ReactNode, SVGProps } from 'react'
import { BOTAO_FORTE } from '#/components/casca-lume/pagina-lume'
import { Button } from '#/components/ui/button'
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '#/components/ui/empty'
import {
  IlustracaoCabide,
  IlustracaoCarretel,
  IlustracaoCartela,
  IlustracaoFitaMetrica,
  IlustracaoLinhaEAgulha,
  IlustracaoTecido,
} from '#/components/vazio/ilustracoes'
import { continuarEstudandoFn } from '#/lib/paginas-fns'
import { cn } from '#/lib/utils'

/** As seis ilustrações do mundo da moda; cada tela vazia escolhe uma. */
export const ILUSTRACOES = {
  cabide: IlustracaoCabide,
  tecido: IlustracaoTecido,
  cartela: IlustracaoCartela,
  fita: IlustracaoFitaMetrica,
  agulha: IlustracaoLinhaEAgulha,
  carretel: IlustracaoCarretel,
} as const satisfies Record<string, ComponentType<SVGProps<SVGSVGElement>>>

export type NomeDaIlustracao = keyof typeof ILUSTRACOES

const ALINHA_NA_CASCA =
  'in-data-[casca=lume]:[align-items:var(--vazio-alinha)] in-data-[casca=lume]:[text-align:var(--vazio-texto)]'

/**
 * O único jeito de dizer "ainda não tem nada aqui" na área do aluno (#107): ilustração de traço de uma
 * cor (96 px, `text-primary/70`), título curto, uma linha de apoio e o próximo passo como botão. A ação
 * é opcional (no atendimento, o campo de mensagem já é a ação). `compacta` só aperta o respiro, para
 * menus e janelas; a ilustração segue com 96 px.
 */
export function TelaVazia({
  ilustracao,
  titulo,
  texto,
  acao,
  compacta,
  className,
}: {
  ilustracao: NomeDaIlustracao
  titulo: string
  texto?: ReactNode
  acao?: ReactNode
  compacta?: boolean
  className?: string
}) {
  const Ilustracao = ILUSTRACOES[ilustracao]
  return (
    <Empty
      data-ilustracao={ilustracao}
      className={cn(
        compacta
          ? 'gap-4 p-4 md:p-6'
          : 'py-12 md:py-16 in-data-[casca=lume]:[padding-inline:calc(1.5rem*(1-var(--apoio-na-regua)))] in-data-[casca=lume]:md:[padding-inline:calc(3rem*(1-var(--apoio-na-regua)))]',
        // Na casca Lume o tema pode alinhar à esquerda, na régua (tokens `--vazio-*`).
        'in-data-[casca=lume]:[align-items:var(--vazio-alinha)] in-data-[casca=lume]:[text-align:var(--vazio-texto)]',
        className,
      )}
    >
      <EmptyHeader className={ALINHA_NA_CASCA}>
        <EmptyMedia>
          <Ilustracao className="size-24 text-primary/70" />
        </EmptyMedia>
        <EmptyTitle>{titulo}</EmptyTitle>
        {texto && <EmptyDescription>{texto}</EmptyDescription>}
      </EmptyHeader>
      {acao && <EmptyContent className={ALINHA_NA_CASCA}>{acao}</EmptyContent>}
    </Empty>
  )
}

/** "Continuar estudando": vai à próxima aula quando há uma; senão, a Meus cursos. */
export function AcaoContinuarEstudando() {
  const { data } = useQuery({
    queryKey: ['continuar-estudando'],
    queryFn: () => continuarEstudandoFn(),
    staleTime: 30_000,
  })
  const aulaId = data?.aulaId
  return (
    <Button asChild className={BOTAO_FORTE}>
      {aulaId ? (
        <Link to="/aulas/$aulaId" params={{ aulaId }}>
          Continuar estudando
        </Link>
      ) : (
        <Link to="/">Continuar estudando</Link>
      )}
    </Button>
  )
}
