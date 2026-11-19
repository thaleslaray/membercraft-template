import { Link } from '@tanstack/react-router'
import { Info, Play } from 'lucide-react'
import { BarraLume } from '#/components/casca-lume/barra'
import {
  ContinueCard,
  type CursoParaCartaoLume,
  formatoDaFileira,
  PosterCard,
} from '#/components/casca-lume/cartoes'
import {
  BOTAO_DO_DESTAQUE,
  BOTAO_SECUNDARIO_DO_DESTAQUE,
  Destaque,
} from '#/components/casca-lume/destaque'
import { Fileira } from '#/components/casca-lume/fileira'
import { BannerDaVitrine } from '#/components/meus-cursos/banner-da-vitrine'
import { formaDoDestaque } from '#/config/themes'
import { useAparencia } from '#/lib/aparencia-queries'
import { urlDaImagem } from '#/lib/imagens'
import { cn } from '#/lib/utils'
import type { BannerDoAluno } from '#/regras/banners'
import type { GruposPorSituacao } from '#/regras/meus-cursos'

type DadosDoDestaque = {
  curso: CursoParaCartaoLume
  aulaId: string
  aulaTitulo: string
  moduloNome: string
  faltam: number
}

/** O que o Início mostra no destaque: a aula do curso aberto por último ou o primeiro curso a começar. */
function escolherDestaque(
  destaque: DadosDoDestaque | null,
  grupos: GruposPorSituacao<CursoParaCartaoLume>,
): { destaque: DadosDoDestaque; retomando: boolean } | null {
  // Só "continua" quem já concluiu alguma aula; ter aberto a primeira não é retomar.
  if (destaque) return { destaque, retomando: destaque.curso.feitas > 0 }
  const doGrupo = (lista: CursoParaCartaoLume[], retomando: boolean) => {
    const curso = lista.find((c) => c.proxima)
    if (!curso?.proxima) return null
    return {
      destaque: {
        curso,
        aulaId: curso.proxima.aulaId,
        aulaTitulo: curso.proxima.titulo,
        moduloNome: '',
        faltam: 0,
      },
      retomando,
    }
  }
  return (
    doGrupo(
      grupos.emAndamento.filter((c) => c.feitas > 0),
      true,
    ) ??
    doGrupo(grupos.emAndamento, false) ??
    doGrupo(grupos.paraComecar, false)
  )
}

// Início (casca Lume): destaque com a capa ("Continue de onde parou" ou "Comece por aqui"), a fileira
// "Continue assistindo" e "Meus cursos" em cartões verticais. Usa os mesmos dados da casca clássica.
export function InicioLume({
  grupos,
  destaque,
  banner,
}: {
  grupos: GruposPorSituacao<CursoParaCartaoLume>
  destaque: DadosDoDestaque | null
  banner: BannerDoAluno | null
}) {
  const escolhido = escolherDestaque(destaque, grupos)
  const { tema } = useAparencia()
  // O destaque em cartão já traz respiro embaixo; o amplo (um bloco fechado) e o título pedem mais.
  const respiroNoCelular =
    escolhido && formaDoDestaque(tema) === 'cartao'
      ? 'lume-cel:pt-2'
      : 'lume-cel:pt-7'
  // A fileira serve para trocar de curso: não repete o curso que já está no destaque.
  const emAndamento = grupos.emAndamento.filter(
    (c) => c.proxima && c.id !== escolhido?.destaque.curso.id,
  )
  const meus = [
    ...grupos.emAndamento,
    ...grupos.paraComecar,
    ...grupos.concluidos,
  ]
  const formatoDeMeus = formatoDaFileira(meus)

  return (
    <main className="flex flex-1 flex-col">
      {escolhido ? (
        <HeroDoInicio {...escolhido} />
      ) : (
        <h1 className="px-(--pad) pt-10 font-display text-[clamp(28px,3.4vw,40px)] leading-[1.1] tracking-[-0.025em] text-balance lume-cel:pt-6">
          Meus cursos
        </h1>
      )}

      <div
        className={cn(
          'relative grid gap-11 pt-9 pb-20 lume-cel:gap-9',
          respiroNoCelular,
        )}
      >
        {emAndamento.length > 0 && (
          <Fileira titulo="Continue assistindo">
            {emAndamento.map((c) => (
              <ContinueCard key={c.id} curso={c} />
            ))}
          </Fileira>
        )}

        {meus.length > 0 && (
          <Fileira titulo="Meus cursos">
            {meus.map((c) => (
              <PosterCard key={c.id} curso={c} formato={formatoDeMeus} />
            ))}
          </Fileira>
        )}

        {banner && (
          // Teto de largura (alinhado à esquerda): em tela grande o banner não domina a página.
          <div className="px-(--pad) *:max-w-[1500px]">
            <BannerDaVitrine banner={banner} />
          </div>
        )}
      </div>
    </main>
  )
}

type Forma = 'cartao' | 'amplo'

function HeroDoInicio(props: {
  destaque: DadosDoDestaque
  retomando: boolean
}) {
  const { tema } = useAparencia()
  const forma: Forma = formaDoDestaque(tema)
  const imagem = urlDaImagem(
    props.destaque.curso.capaHorizontal ?? props.destaque.curso.capaVertical,
  )
  if (forma === 'amplo') return <DestaqueAmplo {...props} imagem={imagem} />
  return (
    <Destaque imagem={imagem}>
      <ConteudoDoDestaque {...props} sobreVeu={false} />
    </Destaque>
  )
}

/**
 * Forma "ampla" (Luz de janela): a capa aparece INTEIRA, à direita, sem máscara nem véu por cima. A
 * coluna de texto fica à esquerda, sobre a própria capa desfocada e um véu. A capa tem a altura
 * `--h-amplo` (16:9, então a largura é essa altura x 16/9) e o texto ocupa o resto; o cartão cresce
 * se o texto pedir. Largura da capa limitada a 58% do cartão para o texto não ficar apertado, e a
 * altura cede em tela baixa (celular deitado). No celular em pé: capa em cima, texto embaixo. Sem
 * capa: degradê da marca e a altura do conteúdo.
 */
function DestaqueAmplo(props: {
  destaque: DadosDoDestaque
  retomando: boolean
  imagem: string | null
}) {
  const { imagem } = props
  return (
    <section className="px-(--pad) pt-4 lume-cel:pt-2">
      <div
        className={cn(
          'relative isolate overflow-hidden rounded-[20px] shadow-(--destaque-moldura) lume-cel:rounded-[16px] lume-cel:bg-(--destaque-cel-fundo) lume-cel:shadow-(--destaque-cel-moldura)',
          imagem
            ? 'bg-destaque-veu [--h-amplo:min(clamp(380px,52dvh,600px),calc((100vw-2*var(--pad))*0.58*9/16))] lume-tela:grid lume-tela:min-h-(--h-amplo) [@media(max-height:520px)]:[--h-amplo:240px]'
            : 'bg-[linear-gradient(135deg,color-mix(in_srgb,var(--brand)_28%,var(--card)),var(--card))]',
        )}
      >
        {imagem && (
          <>
            <img
              aria-hidden="true"
              src={imagem}
              alt=""
              decoding="async"
              className="absolute inset-0 -z-10 size-full scale-125 object-cover opacity-(--destaque-desfoque) blur-3xl lume-cel:hidden"
            />
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-0 left-0 w-[calc(100%-var(--h-amplo)*16/9)] bg-[linear-gradient(90deg,color-mix(in_srgb,var(--destaque-veu)_92%,transparent),color-mix(in_srgb,var(--destaque-veu)_var(--destaque-veu-fim),transparent))] lume-cel:hidden"
            />
            <img
              src={imagem}
              alt=""
              fetchPriority="high"
              loading="eager"
              decoding="async"
              className="aspect-video w-full object-contain lume-tela:[mask-image:var(--destaque-capa-mascara)] lume-tela:absolute lume-tela:top-1/2 lume-tela:right-0 lume-tela:h-(--h-amplo) lume-tela:w-auto lume-tela:-translate-y-1/2"
            />
          </>
        )}
        <div
          className={cn(
            'relative min-w-0 p-5 lume-tela:self-center lume-tela:p-[clamp(28px,3.4vw,56px)] [@media(max-height:520px)]:lume-tela:p-5',
            imagem && 'lume-tela:w-[calc(100%-var(--h-amplo)*16/9)]',
          )}
        >
          <div className="grid max-w-[36rem] grid-cols-[minmax(0,1fr)] gap-3 [@media(max-height:520px)]:gap-2">
            <ConteudoDoDestaque {...props} sobreVeu={!!imagem} />
          </div>
        </div>
      </div>
    </section>
  )
}

/**
 * Conteúdo do destaque, o mesmo nas duas formas: etiqueta, curso (h1), aula e módulo, progresso,
 * contagem e botões. `sobreVeu` troca as cores (só no computador) para o texto claro do véu da forma
 * ampla.
 */
function ConteudoDoDestaque({
  destaque,
  retomando,
  sobreVeu,
}: {
  destaque: DadosDoDestaque
  retomando: boolean
  sobreVeu: boolean
}) {
  const { curso } = destaque
  const tinta = sobreVeu && 'lume-tela:text-destaque-tinta'
  const mudo =
    'text-muted-foreground ' +
    (sobreVeu
      ? 'lume-tela:text-[color-mix(in_srgb,var(--destaque-tinta)_78%,transparent)]'
      : '')
  return (
    <>
      <span
        className={cn(
          'font-manuscrito text-[clamp(22px,1.9vw,28px)] leading-none text-muted-foreground',
          sobreVeu && 'lume-tela:text-destaque-acento',
        )}
      >
        {retomando ? 'Continue de onde parou' : 'Comece por aqui'}
      </span>
      {/* O corte em linhas é só visual: o leitor de tela lê o nome inteiro. */}
      <h1
        className={cn(
          'line-clamp-3 font-display text-[clamp(24px,3vw,46px)] leading-[1.08] tracking-[-0.025em] text-balance [overflow-wrap:anywhere] [@media(max-height:520px)]:line-clamp-2 [@media(max-height:520px)]:text-[clamp(20px,2.4vw,26px)]',
          tinta,
        )}
      >
        {curso.nome}
      </h1>
      <p
        className={cn(
          'line-clamp-2 text-[15px] font-semibold [overflow-wrap:anywhere] [@media(max-height:520px)]:line-clamp-1',
          tinta,
        )}
      >
        {destaque.aulaTitulo}
        {destaque.moduloNome && (
          <span className={cn('font-normal', mudo)}>
            {' '}
            · {destaque.moduloNome}
          </span>
        )}
      </p>
      {curso.total > 0 && (
        <div className={cn('flex items-center gap-3 text-sm', mudo)}>
          <BarraLume
            pct={curso.percentual}
            feitas={curso.feitas}
            label="Progresso do curso"
            className={cn(
              'min-w-0 max-w-[260px] flex-1',
              sobreVeu &&
                'lume-tela:bg-[color-mix(in_srgb,var(--destaque-tinta)_25%,transparent)]',
            )}
          />
          <span className="shrink-0 whitespace-nowrap tabular-nums">
            {curso.feitas} de {curso.total}{' '}
            {curso.total === 1 ? 'aula' : 'aulas'}
          </span>
        </div>
      )}
      <div className="mt-2 flex items-center gap-3 [@media(max-height:520px)]:mt-0">
        <Link
          to="/aulas/$aulaId"
          params={{ aulaId: destaque.aulaId }}
          className={cn(
            BOTAO_DO_DESTAQUE,
            sobreVeu &&
              'lume-tela:bg-(--destaque-botao) lume-tela:text-(--destaque-botao-tinta) lume-tela:hover:bg-(--destaque-botao-hover) lume-tela:focus-visible:outline-destaque-tinta',
          )}
        >
          <Play className="size-4" fill="currentColor" aria-hidden="true" />
          {retomando ? 'Continuar' : 'Começar'}
        </Link>
        <Link
          to="/cursos/$cursoId"
          params={{ cursoId: curso.id }}
          aria-label="Ver curso"
          title="Ver curso"
          className={cn(
            BOTAO_SECUNDARIO_DO_DESTAQUE,
            '!w-11 !px-0',
            sobreVeu &&
              'lume-tela:bg-[color-mix(in_srgb,var(--destaque-tinta)_12%,transparent)] lume-tela:text-destaque-tinta lume-tela:ring-1 lume-tela:ring-[color-mix(in_srgb,var(--destaque-tinta)_20%,transparent)] lume-tela:focus-visible:outline-destaque-tinta',
          )}
        >
          <Info className="size-5" aria-hidden="true" />
        </Link>
      </div>
    </>
  )
}
