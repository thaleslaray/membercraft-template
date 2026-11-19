import { Link, useNavigate } from '@tanstack/react-router'
import {
  Check,
  ChevronLeft,
  FileText,
  Play,
  Search,
  SearchX,
} from 'lucide-react'
import { useState } from 'react'
import { BarraLume } from '#/components/casca-lume/barra'
import {
  BOTAO_DO_DESTAQUE,
  Destaque,
  Etiqueta,
  TITULO_DO_DESTAQUE,
} from '#/components/casca-lume/destaque'
import { LEITURA_NO_PAPEL } from '#/components/casca-lume/pagina-lume'
import { CaminhoDoCertificado } from '#/components/certificados/caminho-do-certificado'
import {
  CertificadoDoTopo,
  FolhaDoCertificado,
  previaDisponivel,
} from '#/components/certificados/certificado-do-curso'
import { BotaoFavorito } from '#/components/conteudo/botao-favorito'
import { Cadeado } from '#/components/conteudo/cadeado'
import { TelaVazia } from '#/components/vazio/tela-vazia'
import { botaoDoCurso } from '#/lib/curso-tela'
import { urlDaImagem } from '#/lib/imagens'
import type { paginaDoCursoFn } from '#/lib/paginas-fns'
import { cn } from '#/lib/utils'

type PaginaDoCurso = NonNullable<Awaited<ReturnType<typeof paginaDoCursoFn>>>
type Modulo = PaginaDoCurso['modulos'][number]
type Aula = Modulo['aulas'][number]

// Alvo de toque de 44 px no celular (e em telas de toque): o botão cresce só aí.
const ALVO_44 = 'mr-2 shrink-0 toque:size-11'

// Uma coluna só: a área inteira tem no máximo a largura do destaque (1500 px, alinhada à esquerda),
// e duas colunas ali deixariam cada linha estreita demais. Entre as linhas, só o respiro: o fundo
// arredondado do hover e da próxima aula já separa uma da outra.
const LISTA_DE_AULAS = 'grid gap-1'

// Tela vazia na régua da página: alinhada à esquerda, como o título do módulo logo acima, e não
// centralizada no meio da coluna.
const VAZIO_NA_REGUA =
  'items-start p-0 pt-2 text-left md:p-0 md:pt-2 [&>div]:items-start [&>div]:text-left [&_h2]:font-display'

// A pílula do módulo aberto entra na faixa rolável (no celular ela pode estar fora da tela, por
// exemplo ao abrir `?modulo=` do último módulo). Rola só a faixa, nunca a página: `scrollIntoView`
// puxaria a página de volta para cima quando o roteador restaura a rolagem.
const mostrarPilula = (el: HTMLButtonElement | null) => {
  const faixa = el?.parentElement
  if (!el || !faixa) return
  const fora =
    el.offsetLeft < faixa.scrollLeft ||
    el.offsetLeft + el.offsetWidth > faixa.scrollLeft + faixa.clientWidth
  if (fora)
    faixa.scrollLeft =
      el.offsetLeft - faixa.clientWidth / 2 + el.offsetWidth / 2
}

const sem = (texto: string) =>
  texto
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()

function Episodio({
  aula,
  numero,
  capa,
  pagina,
  comoBusca,
  titulo,
}: {
  aula: Aula
  numero: number
  capa: string | null
  pagina: PaginaDoCurso
  comoBusca: { como?: string }
  /** Linha pequena acima do título (o módulo, na busca). */
  titulo?: string
}) {
  const feita = (pagina.passo?.concluidas ?? []).includes(aula.id)
  const proxima = aula.id === (pagina.passo?.proximaAulaId ?? null)
  const situacao = pagina.situacoes.aulas[aula.id]
  const travada = situacao?.tipo === 'cadeado'
  const miniatura = urlDaImagem(aula.miniatura) ?? capa
  const Icone = aula.temVideo ? Play : FileText
  return (
    <li
      className={cn(
        'group/ep relative -mx-3.5 flex items-center gap-2 rounded-xl transition-colors lume-cel:-mx-2.5',
        !travada && 'hover:bg-card',
        // Próxima aula: bloco de fundo ou fio à esquerda, conforme o tema (`--curso-proxima-*`).
        proxima &&
          "bg-(--curso-proxima-fundo) hover:bg-(--curso-proxima-fundo) before:absolute before:inset-y-4 before:left-0 before:w-[3px] before:rounded-full before:bg-(--curso-proxima-marca) before:content-[''] lume-cel:before:inset-y-3",
      )}
    >
      <Link
        to="/aulas/$aulaId"
        params={{ aulaId: aula.id }}
        search={comoBusca}
        className={cn(
          'grid min-w-0 flex-1 grid-cols-[200px_minmax(0,1fr)_auto] items-center gap-5 p-3.5 no-underline lume-cel:grid-cols-[128px_minmax(0,1fr)_auto] lume-cel:gap-3 lume-cel:p-2.5 lume-cel:max-[359px]:grid-cols-[88px_minmax(0,1fr)_auto] lume-cel:max-[359px]:gap-2',
          travada && 'opacity-60',
        )}
      >
        <div className="relative aspect-video overflow-hidden rounded-md bg-muted">
          {miniatura && (
            <img
              src={miniatura}
              alt=""
              loading="lazy"
              className="size-full object-cover"
            />
          )}
          <span className="absolute top-1.5 left-1.5 grid h-6 min-w-6 place-items-center rounded-full bg-destaque-veu/80 px-1.5 text-xs font-semibold text-destaque-tinta tabular-nums backdrop-blur-sm">
            {numero}
          </span>
          <span
            aria-hidden="true"
            className={cn(
              'absolute inset-0 m-auto grid size-10 place-items-center rounded-full border-[1.5px] border-destaque-tinta/60 bg-destaque-veu/70 text-destaque-tinta opacity-0 transition-opacity duration-200 group-hover/ep:opacity-100',
              proxima && 'opacity-100',
            )}
          >
            <Icone
              className="size-[18px]"
              fill={aula.temVideo ? 'currentColor' : 'none'}
            />
          </span>
        </div>
        <div className="min-w-0">
          {titulo && (
            <p className="mb-0.5 truncate text-xs font-semibold text-muted-foreground">
              {titulo}
            </p>
          )}
          <p
            lang="pt-BR"
            className="flex flex-wrap items-center gap-x-2 font-semibold text-pretty [overflow-wrap:anywhere]"
          >
            <span className="min-w-0">{aula.titulo}</span>
            {proxima && (
              <span className="rounded-full bg-(--curso-proxima-etiqueta-fundo) px-2 py-0.5 text-[11px] font-semibold text-(--curso-proxima-etiqueta-tinta) ring-1 ring-(--curso-proxima-etiqueta-contorno) ring-inset">
                Próxima aula
              </span>
            )}
          </p>
          <Cadeado situacao={situacao} className="mt-1" />
        </div>
        <span
          className={cn(
            'grid size-6 place-items-center rounded-full border-[1.5px] border-(--aula-aro) lume-cel:size-6',
            feita && 'border-success bg-success text-(--aula-feita-tinta)',
          )}
        >
          {feita && (
            <>
              <Check className="size-3.5" strokeWidth={3} aria-hidden="true" />
              <span className="sr-only">Concluída</span>
            </>
          )}
        </span>
      </Link>
      <BotaoFavorito
        compacto
        className={ALVO_44}
        aulaId={aula.id}
        titulo={aula.titulo}
        favoritaInicial={pagina.favoritas.includes(aula.id)}
      />
    </li>
  )
}

// Página do curso (casca Lume): destaque com a capa, progresso e o botão principal; embaixo, os módulos
// (um por vez) com as aulas, a busca de aula no curso e "Sobre o curso". Mesmos dados da casca clássica.
export function CursoLume({
  pagina,
  como,
  moduloId,
  termoDaBusca,
}: {
  pagina: PaginaDoCurso
  como: string | undefined
  /** Módulo escolhido, vindo de `?modulo=` na URL (o roteador guarda na volta e no recarregar). */
  moduloId: string | undefined
  /** Termo da busca de aula, vindo de `?q=` na URL. */
  termoDaBusca?: string
}) {
  const navegar = useNavigate({ from: '/cursos/$cursoId' })
  const { curso, modulos, passo, certificado } = pagina
  const comoBusca = como ? { como } : {}
  const capa = urlDaImagem(curso.capaHorizontal ?? curso.capaVertical)
  const totalDeAulas = modulos.reduce((n, m) => n + m.aulas.length, 0)
  const feitas = new Set(passo?.concluidas ?? [])
  const totalFeitas = modulos.reduce(
    (n, m) => n + m.aulas.filter((a) => feitas.has(a.id)).length,
    0,
  )
  const percentual = passo?.percentual ?? 0
  const concluido = totalDeAulas > 0 && totalFeitas >= totalDeAulas
  const botao = botaoDoCurso({
    modulos,
    passo,
    certificadoPronto: previaDisponivel(certificado),
  })
  const [certificadoAberto, setCertificadoAberto] = useState(false)
  // Começa no módulo da próxima aula; curso terminado, no primeiro.
  const inicial = Math.max(
    0,
    modulos.findIndex((m) =>
      m.aulas.some((a) => a.id === passo?.proximaAulaId),
    ),
  )
  // O módulo escolhido vive na URL: voltar do navegador e recarregar caem no mesmo módulo.
  const doUrl = modulos.findIndex((m) => m.id === moduloId)
  const aba = doUrl >= 0 ? doUrl : inicial
  const escolherModulo = (id: string) =>
    void navegar({
      search: (atual) => ({ ...atual, modulo: id, q: undefined }),
      replace: true,
      resetScroll: false,
    })
  // O termo vive na URL (voltar e recarregar mantêm a busca); o campo guarda o texto local para não
  // perder o cursor a cada tecla.
  const [busca, setBuscaLocal] = useState(termoDaBusca ?? '')
  const setBusca = (texto: string) => {
    setBuscaLocal(texto)
    void navegar({
      search: (atual) => ({ ...atual, q: texto.trim() ? texto : undefined }),
      replace: true,
      resetScroll: false,
    })
  }

  const modulo = modulos[aba] as Modulo | undefined
  const deslocamento = modulos
    .slice(0, aba)
    .reduce((n, m) => n + m.aulas.length, 0)
  const termo = busca.trim()
  const achadas = termo
    ? modulos.flatMap((m, mi) => {
        const base = modulos
          .slice(0, mi)
          .reduce((n, x) => n + x.aulas.length, 0)
        return m.aulas.flatMap((a, ai) =>
          sem(a.titulo).includes(sem(termo))
            ? [{ m, mi, a, n: base + ai + 1 }]
            : [],
        )
      })
    : []

  return (
    <main className="flex flex-1 flex-col">
      <Destaque imagem={capa} compacto>
        <Link
          to="/"
          className="mb-1.5 inline-flex w-max items-center gap-1 text-sm text-muted-foreground no-underline hover:text-foreground"
        >
          <ChevronLeft className="size-4" aria-hidden="true" />
          Meus cursos
        </Link>
        {como && <Etiqueta>Você está vendo este curso como aluno</Etiqueta>}
        <h1 className={cn(TITULO_DO_DESTAQUE, 'font-display')}>{curso.nome}</h1>
        {/* Sem aulas, nada de "0 módulos · 0 aulas": a mensagem fica na área das aulas. */}
        {totalDeAulas > 0 && (
          <p className="text-sm text-muted-foreground tabular-nums">
            {modulos.length} {modulos.length === 1 ? 'módulo' : 'módulos'} ·{' '}
            {totalDeAulas} {totalDeAulas === 1 ? 'aula' : 'aulas'}
            {curso.cargaHoraria !== null && ` · ${curso.cargaHoraria}h`}
          </p>
        )}
        {totalDeAulas > 0 && (
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <BarraLume
              pct={percentual}
              feitas={totalFeitas}
              label="Progresso do curso"
              className="w-[min(260px,50vw)]"
            />
            <span
              className={cn(
                'whitespace-nowrap tabular-nums',
                concluido && 'font-semibold text-success-texto',
              )}
            >
              {concluido
                ? 'Curso concluído'
                : `${totalFeitas} de ${totalDeAulas} ${totalDeAulas === 1 ? 'aula' : 'aulas'}`}
            </span>
          </div>
        )}
        {botao && (
          <div className="mt-2 flex flex-wrap gap-3 lume-cel:*:flex-1">
            {botao.tipo === 'aula' ? (
              <Link
                to="/aulas/$aulaId"
                params={{ aulaId: botao.aulaId }}
                search={comoBusca}
                className={BOTAO_DO_DESTAQUE}
                // O botão mostra só o verbo; a aula inteira vai no nome acessível e na dica.
                aria-label={botao.rotulo}
                title={botao.rotulo}
              >
                <Play
                  className="size-4 shrink-0"
                  fill="currentColor"
                  aria-hidden="true"
                />
                <span className="min-w-0 truncate">
                  {botao.rotulo.split(': ')[0]}
                </span>
              </Link>
            ) : (
              <button
                type="button"
                className={BOTAO_DO_DESTAQUE}
                onClick={() => setCertificadoAberto(true)}
              >
                {botao.rotulo}
              </button>
            )}
          </div>
        )}
        <div className="empty:hidden">
          <CertificadoDoTopo
            situacao={certificado}
            aoAbrir={() => setCertificadoAberto(true)}
          />
        </div>
      </Destaque>

      {/* Mesma largura máxima do conteúdo do destaque: em tela larga a lista e "Sobre o curso" terminam
          onde termina a capa, em vez de esticar até a borda. */}
      <div className="grid grid-cols-[minmax(0,1fr)_340px] gap-12 px-(--pad) pt-2 pb-20 max-lg:grid-cols-1 max-lg:gap-2 lume-tela:max-w-[calc(1500px+2*var(--pad))] 2xl:grid-cols-[minmax(0,1fr)_380px]">
        <section aria-label="Módulos" className="min-w-0">
          {modulos.length === 0 ? (
            <TelaVazia
              ilustracao="tecido"
              titulo="Este curso ainda não tem aulas"
              texto="Assim que a equipe publicar, elas aparecem aqui."
              className={VAZIO_NA_REGUA}
            />
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <nav
                  aria-label="Escolher o módulo"
                  className="-mx-1 flex max-w-full gap-2 overflow-x-auto px-1 py-1 [scrollbar-width:none] lume-cel:w-full [&::-webkit-scrollbar]:hidden"
                >
                  {modulos.map((m, i) => (
                    <button
                      key={m.id}
                      ref={!termo && i === aba ? mostrarPilula : undefined}
                      type="button"
                      aria-current={!termo && i === aba ? 'true' : undefined}
                      onClick={() => {
                        setBusca('')
                        escolherModulo(m.id)
                      }}
                      className={cn(
                        'h-10 max-w-[240px] shrink-0 truncate rounded-full border px-4 text-sm font-semibold transition-colors toque:h-11',
                        !termo && i === aba
                          ? 'border-(--modulo-ativo-contorno) bg-(--modulo-ativo-fundo) text-(--modulo-ativo-tinta)'
                          : 'bg-(--modulo-fundo) text-muted-foreground hover:text-foreground',
                      )}
                    >
                      {m.nome}
                    </button>
                  ))}
                </nav>
                {totalDeAulas > 0 && (
                  <label className="flex h-10 w-[240px] items-center gap-2 rounded-full border bg-card px-3.5 toque:h-11 text-muted-foreground focus-within:ring-2 focus-within:ring-ring lume-cel:w-full">
                    <Search className="size-4 shrink-0" aria-hidden="true" />
                    <input
                      type="search"
                      value={busca}
                      onChange={(e) => setBusca(e.target.value)}
                      name="busca-aula"
                      autoComplete="off"
                      spellCheck={false}
                      placeholder="Buscar aula…"
                      aria-label="Buscar aula neste curso"
                      className="h-full min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
                    />
                  </label>
                )}
              </div>

              {termo ? (
                achadas.length > 0 ? (
                  <>
                    <p
                      role="status"
                      className="mt-6 mb-3 text-sm text-muted-foreground"
                    >
                      {achadas.length === 1
                        ? '1 aula encontrada'
                        : `${achadas.length} aulas encontradas`}
                    </p>
                    <ol className={LISTA_DE_AULAS}>
                      {achadas.map((x) => (
                        <Episodio
                          key={x.a.id}
                          aula={x.a}
                          numero={x.n}
                          capa={capa}
                          pagina={pagina}
                          comoBusca={comoBusca}
                          titulo={`Módulo ${x.mi + 1} · ${x.m.nome}`}
                        />
                      ))}
                    </ol>
                  </>
                ) : (
                  <div
                    role="status"
                    className={cn(
                      'mt-6 flex flex-col items-start gap-2 rounded-[calc(0.75rem*var(--leitura-quina))] border p-[calc(1.5rem*var(--leitura-recuo))] shadow-(--busca-vazia-sombra)',
                      LEITURA_NO_PAPEL,
                    )}
                  >
                    <SearchX
                      className="size-6 text-muted-foreground"
                      aria-hidden="true"
                    />
                    <p className="font-display text-lg tracking-[-0.01em]">
                      Nenhuma aula encontrada
                    </p>
                    <p className="text-sm text-muted-foreground [overflow-wrap:anywhere]">
                      Nenhuma aula com “{termo}” neste curso.
                    </p>
                    <button
                      type="button"
                      onClick={() => setBusca('')}
                      className="mt-1 text-sm font-semibold underline underline-offset-4 hover:text-brand"
                    >
                      Limpar busca
                    </button>
                  </div>
                )
              ) : (
                modulo && (
                  <div>
                    <div className="mt-6 mb-3 flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
                      <div className="min-w-0">
                        <h2 className="font-display text-2xl tracking-[-0.01em] break-words">
                          {modulo.nome}
                        </h2>
                        {modulo.aulas.length > 0 && (
                          <p className="text-sm text-muted-foreground tabular-nums">
                            {`${modulo.aulas.length} ${modulo.aulas.length === 1 ? 'aula' : 'aulas'} · ${modulo.aulas.filter((a) => feitas.has(a.id)).length} de ${modulo.aulas.length} ${modulo.aulas.length === 1 ? 'concluída' : 'concluídas'}`}
                          </p>
                        )}
                      </div>
                      <Cadeado situacao={pagina.situacoes.modulos[modulo.id]} />
                    </div>
                    {modulo.aulas.length === 0 ? (
                      <TelaVazia
                        ilustracao="carretel"
                        titulo="Este módulo ainda não tem aulas"
                        texto="Assim que a equipe publicar, elas aparecem aqui."
                        className={VAZIO_NA_REGUA}
                      />
                    ) : (
                      <ol className={LISTA_DE_AULAS}>
                        {modulo.aulas.map((a, i) => (
                          <Episodio
                            key={a.id}
                            aula={a}
                            numero={deslocamento + i + 1}
                            capa={capa}
                            pagina={pagina}
                            comoBusca={comoBusca}
                          />
                        ))}
                      </ol>
                    )}
                  </div>
                )
              )}
            </>
          )}
        </section>

        <aside className="grid content-start gap-8 pt-16 empty:hidden max-lg:row-start-2 max-lg:pt-8">
          {certificado.tipo !== 'emitido' && (
            <CaminhoDoCertificado cursoId={curso.id} />
          )}
          {curso.descricao?.trim() && (
            <div className="grid gap-3.5">
              <h2 className="font-display text-xl tracking-[-0.01em]">
                Sobre o curso
              </h2>
              <p className="whitespace-pre-line text-[15px] text-muted-foreground [overflow-wrap:anywhere]">
                {curso.descricao}
              </p>
            </div>
          )}
        </aside>
      </div>

      {previaDisponivel(certificado) && (
        <FolhaDoCertificado
          emitido={certificado}
          aberta={certificadoAberto}
          aoMudar={setCertificadoAberto}
        />
      )}
    </main>
  )
}
