import Player from '@vimeo/player'
import { type ReactNode, useEffect, useRef } from 'react'
import { gravarProgressoFn } from '#/lib/progresso-fns'
import { consumirTocar } from '#/lib/tocar-a-seguir'
import { urlDoPlayer } from '#/regras/vimeo'

/** Intervalo mínimo entre gravações no cliente (o servidor ainda impõe o dele). */
const INTERVALO_MINIMO_MS = 10_000
/** Saltos maiores que isso entre dois `timeupdate` são pulos do aluno, não vídeo tocando. */
const SALTO_MAXIMO_S = 2

interface Props {
  aulaId: string
  titulo: string
  vimeoId: string
  vimeoHash: string | null
  /** Segundo em que o aluno parou; o vídeo volta para ele. */
  posicaoInicial: number
  /** Segundo vindo da busca nas transcrições: tem preferência sobre onde o aluno parou, e já toca. */
  tempoInicial?: number
  /** A gravação concluiu a aula (90% ou fim do vídeo). */
  aoConcluir: () => void
  /** O vídeo chegou ao fim (depois de a gravação do fim ter voltado). */
  aoTerminar?: () => void
  /** Por cima do vídeo (o cartão do fim). */
  children?: ReactNode
  /** Ocupa a largura toda da coluna (a casca Lume dimensiona o vídeo por fora). */
  larguraLivre?: boolean
}

/** Só em desenvolvimento: o Vimeo não toca no e2e, então o teste dispara o fim do vídeo por aqui. */
/**
 * Largura do vídeo: 16:9 sem passar da dobra, a largura cede quando a altura (janela menos título e linha
 * do módulo) não comporta o vídeo inteiro. A barra da aula, o título e a linha do módulo usam a mesma
 * largura, para ficarem alinhados à borda do vídeo e não à do contêiner.
 */
export const LARGURA_DO_VIDEO =
  'mx-auto w-[min(100%,calc((100svh-14rem)*16/9))]'

export interface GanchoDeTeste {
  __simularFimDoVideo?: (opcoes?: { concluir?: boolean }) => void
}

// Vídeo do Vimeo com o Player SDK: abre no minuto da busca (`tempoInicial`) ou volta ao segundo em
// que o aluno parou, e grava a posição, o maior
// ponto e o tempo tocando de tempos em tempos, e quando pausa, termina ou o aluno sai da aula.
export function PlayerDaAula({
  aulaId,
  titulo,
  vimeoId,
  vimeoHash,
  posicaoInicial,
  tempoInicial,
  aoConcluir,
  aoTerminar,
  children,
  larguraLivre = false,
}: Props) {
  const iframe = useRef<HTMLIFrameElement>(null)
  const aoConcluirRef = useRef(aoConcluir)
  aoConcluirRef.current = aoConcluir
  const aoTerminarRef = useRef(aoTerminar)
  aoTerminarRef.current = aoTerminar

  // biome-ignore lint/correctness/useExhaustiveDependencies: o player nasce uma vez por aula; a posição inicial só vale na abertura
  useEffect(() => {
    const el = iframe.current
    if (!el) return
    const player = new Player(el)
    let duracao = 0
    let posicao = 0
    let ultimoInstante: number | null = null
    let ultimaGravacao = 0
    let pendente = 0
    let gravando = false

    async function gravar(terminou = false) {
      if (gravando || duracao <= 0) return
      gravando = true
      const enviado = pendente
      try {
        const r = await gravarProgressoFn({
          data: { aulaId, posicao, duracao, tempoTocando: enviado, terminou },
        })
        if (r.gravou) {
          pendente = Math.max(0, pendente - enviado)
          ultimaGravacao = Date.now()
          if (r.concluiuAgora) aoConcluirRef.current()
        }
      } catch {
        // Sem rede ou sessão vencida: o tempo fica pendente e vai na próxima gravação.
      } finally {
        gravando = false
      }
    }

    async function aoCarregar() {
      duracao = await player.getDuration()
      // Aberta pelo fim do vídeo anterior (contagem ou "Assistir agora"): começa a tocar.
      const tocarAoAbrir = consumirTocar(aulaId)
      if (tempoInicial) {
        await player.setCurrentTime(tempoInicial).catch(() => {})
        // O navegador pode recusar tocar sozinho: o vídeo fica no minuto, parado.
        await player.play().catch(() => {})
        return
      }
      if (posicaoInicial > 0 && posicaoInicial < duracao - 2) {
        await player.setCurrentTime(posicaoInicial).catch(() => {})
      }
      if (tocarAoAbrir) await player.play().catch(() => {})
    }
    function aoAtualizar(d: { duration: number; seconds: number }) {
      duracao = d.duration
      posicao = d.seconds
      const instante = d.seconds
      if (ultimoInstante !== null) {
        const delta = instante - ultimoInstante
        if (delta > 0 && delta <= SALTO_MAXIMO_S) pendente += delta
      }
      ultimoInstante = instante
      if (Date.now() - ultimaGravacao >= INTERVALO_MINIMO_MS) void gravar()
    }
    function aoPular(d: { seconds: number }) {
      ultimoInstante = d.seconds
    }
    function aoPausar() {
      ultimoInstante = null
      void gravar()
    }
    async function aoFim() {
      ultimoInstante = null
      // Uma gravação em curso termina antes: é ela que pode ter concluído a aula (aos 90%).
      while (gravando) await new Promise((r) => setTimeout(r, 100))
      await gravar(true)
      aoTerminarRef.current?.()
    }
    player.on('loaded', aoCarregar)
    player.on('timeupdate', aoAtualizar)
    player.on('seeked', aoPular)
    player.on('pause', aoPausar)
    player.on('ended', aoFim)
    const gancho = window as unknown as GanchoDeTeste
    if (import.meta.env.DEV) {
      gancho.__simularFimDoVideo = (opcoes) => {
        if (opcoes?.concluir) aoConcluirRef.current()
        aoTerminarRef.current?.()
      }
    }

    // Sem `player.destroy()`: ele remove o <iframe> do DOM, e o React (StrictMode monta o efeito duas
    // vezes em desenvolvimento) não o recria. A limpeza só tira os ouvintes; o iframe é do React.
    return () => {
      void gravar()
      player.off('loaded', aoCarregar)
      player.off('timeupdate', aoAtualizar)
      player.off('seeked', aoPular)
      player.off('pause', aoPausar)
      player.off('ended', aoFim)
      if (import.meta.env.DEV) delete gancho.__simularFimDoVideo
    }
  }, [aulaId])

  return (
    // Nada de `max-height` solto, que deformaria o quadro: o que cede é a largura.
    <div
      className={`relative aspect-video overflow-hidden rounded-xl bg-black ${larguraLivre ? '' : LARGURA_DO_VIDEO}`}
    >
      <iframe
        ref={iframe}
        title={titulo}
        src={urlDoPlayer(vimeoId, vimeoHash)}
        className="size-full"
        allow="autoplay; fullscreen; picture-in-picture"
        allowFullScreen
        referrerPolicy="strict-origin-when-cross-origin"
      />
      {children}
    </div>
  )
}
