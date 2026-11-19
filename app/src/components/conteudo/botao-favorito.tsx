import { useRouter } from '@tanstack/react-router'
import { Star } from 'lucide-react'
import { useState } from 'react'
import { Button } from '#/components/ui/button'
import { alternarFavoritoFn } from '#/lib/favoritos-fns'
import { toast } from '#/lib/toast'

// Estrela de favoritar. Atualiza na hora e desfaz se a gravação falhar; a gravação é
// idempotente, então clique repetido não cria nada a mais.
export function BotaoFavorito({
  aulaId,
  titulo,
  favoritaInicial,
  compacto = false,
  naBarra = false,
  discreto = false,
  className,
  aoAlterar,
}: {
  aulaId: string
  titulo: string
  favoritaInicial: boolean
  compacto?: boolean
  /** Botão de ícone de 40 px com borda de 2 px, na barra de ações da aula (medida da área antiga). */
  naBarra?: boolean
  /** Botão fantasma com ícone e rótulo, na linha de ações abaixo do título da aula. */
  discreto?: boolean
  className?: string
  /** Chamado assim que o aluno alterna (antes da gravação), com o novo estado. */
  aoAlterar?: (favorita: boolean) => void
}) {
  const router = useRouter()
  const [favorita, setFavorita] = useState(favoritaInicial)
  const [gravando, setGravando] = useState(false)

  async function alternar() {
    if (gravando) return
    const nova = !favorita
    aoAlterar?.(nova)
    setFavorita(nova)
    setGravando(true)
    try {
      await alternarFavoritoFn({ data: { aulaId, favorita: nova } })
      await router.invalidate()
    } catch {
      setFavorita(!nova)
      toast.error('Não foi possível atualizar o favorito. Tente de novo.')
    } finally {
      setGravando(false)
    }
  }

  const comTexto = !compacto && !naBarra
  if (discreto) {
    return (
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className={className}
        aria-pressed={favorita}
        aria-disabled={gravando}
        onClick={alternar}
      >
        <Star className={favorita ? 'fill-current' : ''} />
        {favorita ? 'Favoritada' : 'Favoritar'}
        <span className="sr-only">: {titulo}</span>
      </Button>
    )
  }
  return (
    <Button
      type="button"
      variant={compacto && !naBarra ? 'ghost' : 'outline'}
      size={naBarra ? 'icon' : compacto ? 'icon-sm' : 'default'}
      className={
        naBarra
          ? 'size-10 border-2 bg-background shadow-xs aria-disabled:cursor-not-allowed aria-disabled:opacity-50'
          : `aria-disabled:cursor-not-allowed aria-disabled:opacity-50 ${className ?? ''}`
      }
      // Rótulo fixo: o estado é anunciado só por aria-pressed. Com texto visível, o nome é o texto.
      aria-label={comTexto ? undefined : `Favoritar: ${titulo}`}
      aria-pressed={favorita}
      aria-disabled={gravando}
      onClick={alternar}
    >
      <Star className={favorita ? 'fill-current text-primary' : ''} />
      {comTexto && (
        <>
          {favorita ? 'Favoritada' : 'Favoritar'}
          <span className="sr-only">: {titulo}</span>
        </>
      )}
    </Button>
  )
}
