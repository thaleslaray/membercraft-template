import { createFileRoute, Link } from '@tanstack/react-router'
import { InicioLume } from '#/components/casca-lume/inicio-lume'
import { InicioSemCurso } from '#/components/casca-lume/inicio-sem-curso'
import { PreviaDoCertificado } from '#/components/certificados/previa-do-certificado'
import { BannerDaVitrine } from '#/components/meus-cursos/banner-da-vitrine'
import {
  CartaoDoCurso,
  type CursoDeMeusCursos,
  DestaqueContinuar,
} from '#/components/meus-cursos/cartoes'
import { Fileira } from '#/components/meus-cursos/fileira'
import { Button } from '#/components/ui/button'
import { EsqueletoDoInicioDaCasca } from '#/components/vazio/esqueletos'
import { TelaVazia } from '#/components/vazio/tela-vazia'
import { appConfig } from '#/config/app'
import { useAparencia } from '#/lib/aparencia-queries'
import { nomeDaCapa } from '#/lib/capa'
import { paginaDoInicioFn } from '#/lib/paginas-fns'

// Meus cursos (o Início da aluna): a próxima aula grande no topo, os cursos por ordem de uso (em
// andamento, para começar, concluídos; as categorias ordenam dentro de cada grupo sem virar título), as
// aulas salvas e os certificados em fileiras, os cursos que ela não tem no fim e um banner só, abaixo.
export const Route = createFileRoute('/_aluno/')({
  head: () => ({ meta: [{ title: `Meus cursos · ${appConfig.name}` }] }),
  loader: () => paginaDoInicioFn(),
  pendingComponent: EsqueletoDoInicioDaCasca,
  component: MeusCursos,
})

/**
 * Nome do elemento compartilhado da capa do curso, o mesmo da página do curso (#97). Enquanto a #97
 * não está na integração, o nome é montado aqui com a mesma regra.
 */

/**
 * Cursos de um grupo: abaixo de 768 px, uma fileira com rolagem nativa e `scroll-snap` (cartões de 72% da
 * largura, o próximo aparece cortado); daí em diante, grade de 2 colunas, 3 a partir de 1024 px e 4 a
 * partir de 1536 px (no máximo 28 rem cada), com 20 px entre os cartões.
 */
const LISTA_DE_CURSOS =
  '-mx-4 flex snap-x snap-mandatory scroll-px-4 gap-4 overflow-x-auto px-4 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:mx-0 md:grid md:grid-cols-2 md:gap-5 md:overflow-visible md:px-0 md:pb-0 lg:grid-cols-3 2xl:grid-cols-[repeat(4,minmax(0,28rem))]'

function MeusCursos() {
  const { casca } = useAparencia()
  return casca === 'lume' ? <InicioDoLume /> : <MeusCursosClassico />
}

function InicioDoLume() {
  const { grupos, destaque, temCurso, banner, banners } = Route.useLoaderData()
  const { session } = Route.useRouteContext()
  if (!temCurso) {
    return (
      <InicioSemCurso
        nome={session.user.name}
        email={session.user.email}
        banners={banners}
      />
    )
  }
  return <InicioLume grupos={grupos} destaque={destaque} banner={banner} />
}

function MeusCursosClassico() {
  const { grupos, destaque, temCurso, favoritas, certificados, banner } =
    Route.useLoaderData()
  // O curso do destaque já está no topo: não se repete nas fileiras de baixo.
  const semODestaque = (cursos: CursoDeMeusCursos[]) =>
    destaque ? cursos.filter((c) => c.id !== destaque.curso.id) : cursos

  return (
    <main className="flex flex-1 flex-col gap-10 px-4 py-6 md:px-8 md:py-8 xl:px-16">
      <h1 className="text-3xl leading-9 font-semibold tracking-[-0.02em] [overflow-wrap:anywhere]">
        Meus cursos
      </h1>

      {destaque && (
        <DestaqueContinuar
          d={destaque}
          nomeDaCapa={`capa-aula-${destaque.aulaId}`}
        />
      )}

      {!temCurso && (
        <TelaVazia
          ilustracao="cabide"
          titulo="Seus cursos aparecem aqui"
          texto="Se você acha que já deveria ter um curso, fale com a equipe."
          acao={
            <Button asChild>
              <Link to="/atendimento">Falar com a equipe</Link>
            </Button>
          }
        />
      )}

      <GrupoDeCursos
        titulo="Em andamento"
        cursos={semODestaque(grupos.emAndamento)}
      />
      <GrupoDeCursos
        titulo="Para começar"
        cursos={semODestaque(grupos.paraComecar)}
      />
      <GrupoDeCursos titulo="Concluídos" cursos={grupos.concluidos} />

      {favoritas.length > 0 && (
        <Fileira
          titulo="Aulas salvas"
          acao={
            <Link
              to="/favoritos"
              className="text-sm font-medium text-primary underline underline-offset-4"
            >
              Ver todas
            </Link>
          }
        >
          {favoritas.map((f) => (
            <li key={f.aulaId} className="w-64 shrink-0 snap-start">
              <Link
                to="/aulas/$aulaId"
                params={{ aulaId: f.aulaId }}
                className="flex h-full flex-col gap-1 rounded-lg border bg-card px-4 py-3 no-underline pressiona-cartao"
              >
                <span className="line-clamp-2 text-sm leading-5 font-medium text-foreground [overflow-wrap:anywhere]">
                  {f.titulo}
                </span>
                <span className="line-clamp-2 text-xs leading-4 tracking-[0.01em] text-muted-foreground [overflow-wrap:anywhere]">
                  {f.cursoNome} · {f.moduloNome}
                </span>
              </Link>
            </li>
          ))}
        </Fileira>
      )}

      {certificados.length > 0 && (
        <Fileira titulo="Certificados">
          {certificados.map((c) =>
            c.modelo ? (
              <li key={c.id} className="w-72 shrink-0 snap-start md:w-80">
                <Link
                  to="/certificados"
                  className="flex flex-col gap-2 no-underline pressiona-cartao"
                >
                  <PreviaDoCertificado
                    frente={c.modelo.frente}
                    campos={c.modelo.campos}
                    nome={c.nome}
                    cursoNome={c.cursoNome}
                    concluidoEm={c.concluidoEm}
                    codigo={c.codigo}
                  />
                  <span className="line-clamp-2 text-sm leading-5 font-medium text-foreground [overflow-wrap:anywhere]">
                    {c.cursoNome}
                  </span>
                </Link>
              </li>
            ) : null,
          )}
        </Fileira>
      )}

      <GrupoDeCursos titulo="Para conhecer" cursos={grupos.semAcesso} />

      {banner && <BannerDaVitrine banner={banner} />}
    </main>
  )
}

function GrupoDeCursos({
  titulo,
  cursos,
}: {
  titulo: string
  cursos: CursoDeMeusCursos[]
}) {
  if (cursos.length === 0) return null
  return (
    <section aria-label={titulo} className="flex flex-col gap-5">
      <h2 className="text-xl leading-7 font-semibold tracking-[-0.01em]">
        {titulo}
      </h2>
      {/* Sem nenhum link dentro (cursos de cadeado sem página de vendas), a fileira que rola precisa ser
          alcançável pelo teclado. */}
      <ul
        className={LISTA_DE_CURSOS}
        tabIndex={
          cursos.some((c) => !c.bloqueado || c.urlDeVendas) ? undefined : 0
        }
        aria-label={titulo}
      >
        {cursos.map((c) => (
          <li key={c.id} className="w-[72%] shrink-0 snap-start md:w-auto">
            <CartaoDoCurso
              c={c}
              nomeDaCapa={c.bloqueado ? undefined : nomeDaCapa(c.id)}
            />
          </li>
        ))}
      </ul>
    </section>
  )
}
