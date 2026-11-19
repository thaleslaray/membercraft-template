import { Link } from '@tanstack/react-router'
import { Circle, CircleCheck, FileText, Pencil, Play } from 'lucide-react'
import { type CSSProperties, useLayoutEffect, useRef, useState } from 'react'
import { Cadeado } from '#/components/conteudo/cadeado'
import { BarraDaCartela } from '#/components/conteudo/cartela'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '#/components/ui/accordion'
import { TRILHOS_DA_BARRA } from '#/lib/cartela'
import { cn } from '#/lib/utils'
import { situacaoDoModulo, tituloNaLista } from '#/regras/aula-nova'
import type { SituacaoDoConteudo } from '#/regras/cadeado'

type AulaDaLista = { id: string; titulo: string; temVideo: boolean }
type ModuloDaLista = { id: string; nome: string; aulas: AulaDaLista[] }

// Lista do curso da aula: o mapa do curso. Os módulos vêm na ordem do curso; o da aula atual abre
// com o nome, a barra e "1 de 21", os outros ficam fechados com um anel de progresso. O ícone de cada
// aula é o estado dela (○ falta, ✓ feita, ▶ a atual), na cor da marca.
export function ListaDeAulas({
  cursoNome,
  modulos,
  moduloAtualId,
  aulaAtualId,
  concluidas,
  situacoes,
  busca,
  id,
}: {
  cursoNome: string
  modulos: ModuloDaLista[]
  moduloAtualId: string
  aulaAtualId: string
  concluidas: string[]
  situacoes: Record<string, SituacaoDoConteudo | undefined>
  busca: { como?: string }
  id?: string
}) {
  const [abertos, setAbertos] = useState<string[]>([moduloAtualId])
  const [moduloVisto, setModuloVisto] = useState(moduloAtualId)
  // Ao trocar de módulo (próxima aula), o novo abre sem fechar os que a aluna abriu.
  if (moduloVisto !== moduloAtualId) {
    setModuloVisto(moduloAtualId)
    if (!abertos.includes(moduloAtualId))
      setAbertos([...abertos, moduloAtualId])
  }
  // A cor é a da marca (Aparência): consistente com botões e menu e com contraste garantido.
  // A cor tirada da capa variava por curso e às vezes saía clara demais.
  const estiloDaCor = { '--cor-do-curso': 'var(--primary)' } as CSSProperties

  // A lista abre rolada até a aula atual, dentro do painel (sem mexer na página).
  const rolagem = useRef<HTMLDivElement>(null)
  // biome-ignore lint/correctness/useExhaustiveDependencies: rola de novo só quando a aula muda
  useLayoutEffect(() => {
    const caixa = rolagem.current
    if (!caixa) return
    let rolou = false
    const rolar = () => {
      const aqui = caixa.querySelector<HTMLElement>('[aria-current="page"]')
      // Painel fechado (sem altura própria): espera abrir para medir.
      if (!aqui || rolou || caixa.clientHeight === 0) return
      if (caixa.scrollHeight <= caixa.clientHeight) return
      caixa.scrollTop = Math.max(0, aqui.offsetTop - caixa.clientHeight / 3)
      rolou = true
    }
    rolar()
    const observador = new ResizeObserver(rolar)
    observador.observe(caixa)
    return () => observador.disconnect()
  }, [aulaAtualId])

  function linhas(m: ModuloDaLista) {
    return (
      <ol className="pb-1">
        {m.aulas.map((a) => {
          const aqui = a.id === aulaAtualId
          const feita = concluidas.includes(a.id)
          const { titulo, exercicio } = tituloNaLista(a.titulo)
          return (
            <li key={a.id}>
              <Link
                to="/aulas/$aulaId"
                params={{ aulaId: a.id }}
                search={busca}
                aria-current={aqui ? 'page' : undefined}
                title={titulo}
                className={cn(
                  // `relative`: o rótulo só para leitor de tela (absoluto) fica preso na linha e não estica
                  // a rolagem a partir dos módulos fechados.
                  'pressiona-linha relative flex min-h-9 items-center gap-2.5 px-4 py-2 text-sm no-underline transition-colors duration-base',
                  aqui
                    ? 'bg-[color-mix(in_srgb,var(--cor-do-curso)_12%,transparent)] font-medium text-[color-mix(in_srgb,var(--cor-do-curso)_55%,var(--foreground))]'
                    : feita
                      ? 'text-muted-foreground hover:bg-accent'
                      : 'text-foreground hover:bg-accent',
                )}
              >
                <span className="grid size-4 shrink-0 place-items-center">
                  {feita ? (
                    <CircleCheck
                      className="size-4 text-[var(--cor-do-curso)]"
                      role="img"
                      aria-label="Concluída"
                    />
                  ) : aqui ? (
                    <Play
                      className="size-3.5 fill-current text-[var(--cor-do-curso)]"
                      aria-hidden="true"
                    />
                  ) : exercicio ? (
                    <Pencil
                      className="size-4 text-muted-foreground/50"
                      aria-hidden="true"
                    />
                  ) : a.temVideo ? (
                    <Circle
                      className="size-4 text-muted-foreground/40"
                      aria-hidden="true"
                    />
                  ) : (
                    <FileText
                      className="size-4 text-muted-foreground/50"
                      aria-hidden="true"
                    />
                  )}
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="truncate">
                    {exercicio && <span className="sr-only">Exercício: </span>}
                    {titulo}
                  </span>
                  <Cadeado situacao={situacoes[a.id]} />
                </span>
              </Link>
            </li>
          )
        })}
      </ol>
    )
  }

  return (
    <nav
      id={id}
      aria-label="Aulas do curso"
      style={estiloDaCor}
      className="flex min-h-0 flex-1 flex-col overflow-hidden"
    >
      <div className="border-b px-4 pt-4 pb-3">
        <span className="text-xs text-muted-foreground">{cursoNome}</span>
      </div>
      <div
        ref={rolagem}
        className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain"
      >
        {modulos.length > 0 && (
          <Accordion type="multiple" value={abertos} onValueChange={setAbertos}>
            {modulos.map((m) => {
              const s = situacaoDoModulo(m.aulas, concluidas)
              const aberto = abertos.includes(m.id)
              const pct = s.total ? (s.feitas / s.total) * 100 : 0
              return (
                <AccordionItem key={m.id} value={m.id}>
                  <AccordionTrigger
                    className={cn(
                      'min-w-0 gap-3 rounded-none px-4 hover:bg-accent hover:no-underline',
                      aberto ? 'items-start pt-3.5 pb-2' : 'items-center py-3',
                    )}
                  >
                    {!aberto && <AnelDoModulo pct={pct} />}
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span
                        className={cn(
                          'text-sm leading-snug',
                          aberto
                            ? 'font-semibold text-foreground'
                            : 'truncate font-medium',
                          !aberto && s.faltam === 0 && 'text-muted-foreground',
                        )}
                      >
                        {m.nome}
                      </span>
                    </span>
                    {!aberto && (
                      <span className="shrink-0 text-xs font-normal whitespace-nowrap tabular-nums text-muted-foreground">
                        {s.feitas} de {s.total}
                      </span>
                    )}
                  </AccordionTrigger>
                  <AccordionContent className="pb-0">
                    {/* A barra fica fora do botão: dentro dele o leitor de tela não a anuncia. */}
                    <div className="flex items-center gap-3 px-4 pt-0.5 pb-2">
                      <BarraDaCartela
                        value={pct}
                        cor={undefined}
                        trilho={TRILHOS_DA_BARRA.modulo}
                        aria-label="Progresso do módulo"
                        className="h-1 flex-1 bg-muted"
                      />
                      <span className="text-xs tabular-nums text-muted-foreground">
                        {s.feitas} de {s.total}
                      </span>
                    </div>
                    {linhas(m)}
                  </AccordionContent>
                </AccordionItem>
              )
            })}
          </Accordion>
        )}
        {modulos.length === 0 && (
          <p className="p-4 text-sm text-muted-foreground">
            Este curso ainda não tem aulas.
          </p>
        )}
      </div>
    </nav>
  )
}

/** Anel de progresso do módulo fechado, na cor do curso; cheio, ganha um ✓. Decoração. */
function AnelDoModulo({ pct }: { pct: number }) {
  const r = 8
  const volta = 2 * Math.PI * r
  return (
    <svg
      viewBox="0 0 20 20"
      className="size-5 shrink-0"
      aria-hidden="true"
      data-testid="anel-do-modulo"
    >
      <circle
        cx="10"
        cy="10"
        r={r}
        fill="none"
        strokeWidth="2.25"
        className="stroke-muted"
      />
      {pct > 0 && (
        <circle
          cx="10"
          cy="10"
          r={r}
          fill="none"
          strokeWidth="2.25"
          strokeLinecap="round"
          stroke="var(--cor-do-curso)"
          strokeDasharray={`${(volta * pct) / 100} ${volta}`}
          transform="rotate(-90 10 10)"
        />
      )}
      {pct >= 100 && (
        <path
          d="m6.8 10.2 2.1 2.1 4.3-4.5"
          fill="none"
          stroke="var(--cor-do-curso)"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
    </svg>
  )
}
