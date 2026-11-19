import Player from '@vimeo/player'
import { useEffect, useRef } from 'react'
import { Button } from '#/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '#/components/ui/dialog'
import { appConfig } from '#/config/app'

// Vídeo de boas-vindas da Helena (#101). Janela modal: a página escurece de leve e o vídeo esmaece para
// dentro em 200 ms. "Pular" (ou Esc, ou tocar fora) fecha; o fim do vídeo também conta como visto.
// `primeiraVez` só muda o rótulo do botão: quem reabre pelo avatar vê "Fechar".
export function BoasVindas({
  url,
  aberto,
  primeiraVez,
  aoFechar,
  aoAssistir,
}: {
  url: string
  aberto: boolean
  primeiraVez: boolean
  aoFechar: () => void
  /** O vídeo chegou ao fim. */
  aoAssistir: () => void
}) {
  return (
    <Dialog open={aberto} onOpenChange={(v) => !v && aoFechar()}>
      <DialogContent
        showCloseButton={false}
        className="material-painel max-w-3xl gap-4 p-4 duration-base sm:max-w-3xl md:p-5"
      >
        <div className="grid gap-1 pr-2">
          <DialogTitle className="text-base tracking-[-0.01em]">
            Boas-vindas da {appConfig.marca.nomeCurto}
          </DialogTitle>
          <DialogDescription>
            Um recado de abertura antes de você começar.
          </DialogDescription>
        </div>
        {aberto ? (
          <VideoDasBoasVindas url={url} aoAssistir={aoAssistir} />
        ) : null}
        <div className="flex justify-end">
          <Button type="button" variant="ghost" onClick={aoFechar}>
            {primeiraVez ? 'Pular' : 'Fechar'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function VideoDasBoasVindas({
  url,
  aoAssistir,
}: {
  url: string
  aoAssistir: () => void
}) {
  const iframe = useRef<HTMLIFrameElement>(null)
  const aoAssistirRef = useRef(aoAssistir)
  aoAssistirRef.current = aoAssistir
  useEffect(() => {
    const el = iframe.current
    if (!el) return
    const player = new Player(el)
    const aoTerminar = () => aoAssistirRef.current()
    player.on('ended', aoTerminar)
    // Sem `destroy()`: ele tira o iframe do DOM, e o modo estrito do React roda o efeito duas vezes.
    return () => {
      player.off('ended', aoTerminar)
    }
  }, [])
  return (
    <div className="aspect-video w-full overflow-hidden rounded-md bg-black">
      <iframe
        ref={iframe}
        src={url}
        title={`Vídeo de boas-vindas da ${appConfig.marca.nomeCurto}`}
        className="size-full border-0"
        allow="autoplay; fullscreen; picture-in-picture"
        allowFullScreen
      />
    </div>
  )
}
