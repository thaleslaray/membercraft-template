import { Lock } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { AvaliacaoDaAula } from '#/components/conteudo/avaliacao-da-aula'
import { Button } from '#/components/ui/button'
import {
  avancarContagem,
  CONTAGEM_MS,
  type ModoDoFimDoVideo,
  segundosRestantes,
} from '#/regras/fim-do-video'

const PASSO_MS = 100

interface Props {
  aulaId: string
  aulaTitulo: string
  modo: ModoDoFimDoVideo
  /** A próxima aula: título e capa (a miniatura dela ou a do curso). */
  proxima: { titulo: string; capa: string | null } | null
  /** Por que a próxima está trancada (só no modo `bloqueada`). */
  motivoDoCadeado: string | null
  aoAssistir: () => void
  aoFicar: () => void
}

// Fim do vídeo (#104): o próprio vídeo vira o cartão da próxima aula. Mostra a aula concluída, a próxima,
// a contagem (barra que esvazia só com `transform`; com menos movimento, só o texto), "Assistir agora",
// "Ficar aqui" e a avaliação. A contagem pausa com o mouse em cima ou foco em outro controle; aba oculta
// ou mexer na avaliação a cancelam; Esc é "Ficar aqui".
export function CartaoDoFimDoVideo({
  aulaId,
  aulaTitulo,
  modo,
  proxima,
  motivoDoCadeado,
  aoAssistir,
  aoFicar,
}: Props) {
  const ficar = useRef<HTMLButtonElement>(null)
  const [contando, setContando] = useState(modo === 'contagem')
  const [restanteMs, setRestanteMs] = useState(CONTAGEM_MS)
  const [mouse, setMouse] = useState(false)
  const [foco, setFoco] = useState(false)
  const pausada = mouse || foco

  const aoAssistirRef = useRef(aoAssistir)
  aoAssistirRef.current = aoAssistir
  const aoFicarRef = useRef(aoFicar)
  aoFicarRef.current = aoFicar

  // O foco vai para "Ficar aqui" ao aparecer: Enter cancela, Tab chega ao resto.
  useEffect(() => {
    ficar.current?.focus()
  }, [])

  // Esc = "Ficar aqui" (a menos que um diálogo ou menu por cima já tenha usado a tecla).
  useEffect(() => {
    function aoTeclar(e: KeyboardEvent) {
      if (e.key !== 'Escape' || e.defaultPrevented) return
      e.preventDefault()
      aoFicarRef.current()
    }
    window.addEventListener('keydown', aoTeclar)
    return () => window.removeEventListener('keydown', aoTeclar)
  }, [])

  // Aba em segundo plano: a contagem é cancelada (a escolha vira manual) e, ao voltar, a próxima aula
  // não começa sozinha, para ninguém achar a aula já trocada.
  useEffect(() => {
    const atualizar = () => {
      if (document.hidden) setContando(false)
    }
    atualizar()
    document.addEventListener('visibilitychange', atualizar)
    return () => document.removeEventListener('visibilitychange', atualizar)
  }, [])

  // A contagem anda em passos de 100 ms, sem pular o tempo parado; ao zerar, a próxima aula começa.
  const pausadaRef = useRef(pausada)
  pausadaRef.current = pausada
  useEffect(() => {
    if (!contando) return
    let restante = CONTAGEM_MS
    const relogio = setInterval(() => {
      const passo = avancarContagem(restante, PASSO_MS, pausadaRef.current)
      restante = passo.restanteMs
      setRestanteMs(restante)
      if (passo.terminou) {
        clearInterval(relogio)
        aoAssistirRef.current()
      }
    }, PASSO_MS)
    return () => clearInterval(relogio)
  }, [contando])

  const seguir = modo !== 'sem-proxima' && modo !== 'bloqueada'
  const segundos = segundosRestantes(restanteMs)

  return (
    <section
      aria-label="Fim da aula"
      onMouseEnter={() => setMouse(true)}
      onMouseLeave={() => setMouse(false)}
      onFocus={(e) => setFoco(e.target !== ficar.current)}
      onBlur={() => setFoco(false)}
      // Mexer na avaliação é escolher: a contagem para (Tab sozinho não conta). No clique, não no toque: a
      // contagem some e o que está embaixo sobe, e isso não pode acontecer entre o toque e o clique.
      onClickCapture={(e) => {
        if ((e.target as HTMLElement).closest('[data-avaliacao]'))
          setContando(false)
      }}
      onKeyDownCapture={(e) => {
        if (
          e.key !== 'Tab' &&
          e.key !== 'Escape' &&
          (e.target as HTMLElement).closest('[data-avaliacao]')
        )
          setContando(false)
      }}
      className="cartao-do-fim absolute inset-0 z-10 flex animate-[esmaece-entrada_var(--mov-base)_var(--mov-saida)_both] flex-col overflow-y-auto bg-neutral-950/85 p-3 text-neutral-50 backdrop-blur-xl sm:p-8 [@media(prefers-contrast:more)]:border [@media(prefers-contrast:more)]:border-white [@media(prefers-contrast:more)]:bg-neutral-950 [@media(prefers-reduced-transparency:reduce)]:bg-neutral-950 [@media(prefers-reduced-transparency:reduce)]:backdrop-blur-none"
    >
      <div className="my-auto flex flex-col gap-2 sm:gap-4">
        <p className="truncate text-xs text-neutral-300 sm:text-base">
          <span className="font-medium text-neutral-50">{aulaTitulo}</span>{' '}
          concluída
        </p>

        {proxima && (
          <div className="flex items-center gap-3 sm:gap-4">
            {proxima.capa && (
              <img
                src={proxima.capa}
                alt=""
                className="hidden aspect-video w-32 shrink-0 rounded-lg object-cover sm:block lg:w-44"
              />
            )}
            <div className="min-w-0">
              <p className="hidden text-xs text-neutral-300 sm:block sm:text-sm">
                {modo === 'bloqueada' ? (
                  <span className="inline-flex items-center gap-1">
                    <Lock className="size-3.5" aria-hidden="true" />A próxima
                    aula está trancada
                  </span>
                ) : (
                  'A seguir'
                )}
              </p>
              <p className="line-clamp-1 text-sm leading-snug sm:line-clamp-2 font-semibold sm:text-xl">
                {proxima.titulo}
              </p>
              {modo === 'bloqueada' && motivoDoCadeado && (
                <p className="mt-1 text-xs text-neutral-300 sm:text-sm">
                  {motivoDoCadeado}
                </p>
              )}
            </div>
          </div>
        )}

        {contando && (
          <div>
            {/* O leitor de tela ouve uma vez; o número visível muda a cada segundo, sem aviso. */}
            <p className="sr-only" role="status">
              A próxima aula começa em 5 segundos. Escolha Ficar aqui para
              cancelar.
            </p>
            <p aria-hidden="true" className="text-sm tabular-nums">
              Próxima aula em {segundos} s
            </p>
            <div
              aria-hidden="true"
              className="mt-2 h-1 overflow-hidden rounded-full bg-white/20 motion-reduce:hidden"
            >
              <div
                className="h-full origin-left rounded-full bg-white"
                style={{
                  transform: `scaleX(${restanteMs / CONTAGEM_MS})`,
                  transition: `transform ${PASSO_MS}ms linear`,
                }}
              />
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          {seguir && (
            <Button
              type="button"
              variant="secondary"
              onClick={() => aoAssistir()}
              className="h-9 px-4 sm:h-10 sm:px-5"
            >
              Assistir agora
            </Button>
          )}
          <Button
            ref={ficar}
            type="button"
            variant="ghost"
            onClick={() => aoFicar()}
            className="h-9 px-4 text-neutral-50 sm:h-10 sm:px-5  hover:bg-white/10 hover:text-white"
          >
            Ficar aqui
          </Button>
        </div>

        <div
          data-avaliacao
          className="w-full max-w-sm max-sm:[&_h2]:sr-only max-sm:[&_p]:hidden max-sm:[&_[role=radiogroup]]:justify-start max-sm:[&_[role=radiogroup]]:border-0 max-sm:[&_[role=radiogroup]]:p-0 max-sm:[&_section]:gap-1 [&_h2]:text-left [&_h2]:text-neutral-200 [&_[role=radiogroup]]:border-white/30 [&_button]:text-neutral-200 [&_p]:text-neutral-300"
        >
          <AvaliacaoDaAula aulaId={aulaId} />
        </div>
      </div>
    </section>
  )
}
