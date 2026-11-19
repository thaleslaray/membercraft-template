import { type ReactNode, useEffect, useState } from 'react'
import { Avatar, AvatarFallback, AvatarImage } from '#/components/ui/avatar'
import { Badge } from '#/components/ui/badge'
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from '#/components/ui/drawer'
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '#/components/ui/hover-card'
import { useIsMobile } from '#/hooks/use-mobile'
import { cn } from '#/lib/utils'

/**
 * O que a tela sabe de uma pessoa que não é quem está olhando: nome, foto e "Sobre você". Nunca
 * e-mail, telefone nem pontos de outro curso: o dado nem chega aqui.
 */
export interface PessoaNaTela {
  nome: string
  imagem: string | null
  bio: string | null
  daEquipe?: boolean
}

export const iniciais = (nome: string) =>
  nome
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('')

// A foto é decoração: o nome vem escrito ao lado (ou no rótulo do botão que a envolve).
export function AvatarDaPessoa({
  pessoa,
  className,
}: {
  pessoa: Pick<PessoaNaTela, 'nome' | 'imagem'>
  className?: string
}) {
  return (
    <Avatar className={cn('size-8', className)} aria-hidden="true">
      {pessoa.imagem && <AvatarImage src={pessoa.imagem} alt="" />}
      {/* As iniciais saem do CSS (não são texto no DOM): o nome acessível do botão que envolve a foto é
          "Nome, ver perfil", e o axe (label-content-name-mismatch) exigiria as iniciais dentro dele. */}
      <AvatarFallback
        data-iniciais={iniciais(pessoa.nome)}
        className="bg-muted text-xs text-foreground after:content-[attr(data-iniciais)]"
      />
    </Avatar>
  )
}

export function NomeDaPessoa({ pessoa }: { pessoa: PessoaNaTela }) {
  return (
    <span className="inline-flex items-center gap-1.5 font-medium">
      {pessoa.nome}
      {pessoa.daEquipe && <Badge variant="secondary">Equipe</Badge>}
    </span>
  )
}

// Folha de baixo quando não há mouse (toque) ou a tela é estreita; cartão flutuante no resto.
function useFolhaDeBaixo() {
  const estreita = useIsMobile()
  const [semMouse, setSemMouse] = useState(false)
  useEffect(() => {
    const mql = window.matchMedia('(hover: none), (pointer: coarse)')
    const ler = () => setSemMouse(mql.matches)
    ler()
    mql.addEventListener('change', ler)
    return () => mql.removeEventListener('change', ler)
  }, [])
  return estreita || semMouse
}

function ConteudoDoCartao({ pessoa }: { pessoa: PessoaNaTela }) {
  return (
    <div className="flex flex-col items-center gap-3 text-center">
      <Avatar className="size-20" aria-hidden="true">
        {pessoa.imagem && <AvatarImage src={pessoa.imagem} alt="" />}
        <AvatarFallback className="bg-muted text-2xl text-foreground">
          {iniciais(pessoa.nome)}
        </AvatarFallback>
      </Avatar>
      <div className="flex flex-col items-center gap-1.5">
        <span className="font-semibold">{pessoa.nome}</span>
        {pessoa.daEquipe && <Badge variant="secondary">Equipe</Badge>}
      </div>
      {pessoa.bio && (
        <p className="text-sm break-words whitespace-pre-line text-muted-foreground">
          {pessoa.bio}
        </p>
      )}
    </div>
  )
}

/**
 * Envolve o que o leitor clica (foto, nome) num botão que abre o cartão de perfil: no desktop ao
 * passar o mouse ou focar com o teclado; no toque, numa folha de baixo. `rotulo` nomeia o botão
 * quando o conteúdo é só a foto.
 */
export function CartaoDePessoa({
  pessoa,
  children,
  rotulo,
  className,
}: {
  pessoa: PessoaNaTela
  children: ReactNode
  rotulo?: string
  className?: string
}) {
  const folha = useFolhaDeBaixo()
  const classes = cn(
    'inline-flex cursor-pointer items-center gap-2 rounded-md text-left outline-offset-2',
    className,
    // Só a foto: o botão é o alvo de toque inteiro (44px no celular).
    rotulo && 'toque:size-11 toque:justify-center',
  )
  if (folha) {
    return (
      <Drawer>
        <DrawerTrigger asChild>
          <button type="button" className={classes} aria-label={rotulo}>
            {children}
          </button>
        </DrawerTrigger>
        <DrawerContent>
          <DrawerHeader className="sr-only">
            <DrawerTitle>{pessoa.nome}</DrawerTitle>
            <DrawerDescription>Perfil de {pessoa.nome}</DrawerDescription>
          </DrawerHeader>
          <div className="px-6 pt-4 pb-10">
            <ConteudoDoCartao pessoa={pessoa} />
          </div>
        </DrawerContent>
      </Drawer>
    )
  }
  return (
    <HoverCard openDelay={200} closeDelay={100}>
      <HoverCardTrigger asChild>
        <button type="button" className={classes} aria-label={rotulo}>
          {children}
        </button>
      </HoverCardTrigger>
      <HoverCardContent
        className="w-72"
        role="region"
        aria-label={`Perfil de ${pessoa.nome}`}
      >
        <ConteudoDoCartao pessoa={pessoa} />
      </HoverCardContent>
    </HoverCard>
  )
}
