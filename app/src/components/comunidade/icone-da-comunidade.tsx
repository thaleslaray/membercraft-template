import {
  Bell,
  BookOpen,
  Camera,
  CircleHelp,
  Heart,
  Lightbulb,
  type LucideIcon,
  MessagesSquare,
  Palette,
  Scissors,
  Star,
} from 'lucide-react'
import type { CSSProperties } from 'react'
import { cn } from '#/lib/utils'
import { corSobre } from '#/regras/aparencia-cor'
import type { IconeDaComunidade as Chave } from '#/regras/comunidades'

export const ICONES: Record<Chave, { icone: LucideIcon; rotulo: string }> = {
  mensagens: { icone: MessagesSquare, rotulo: 'Conversas' },
  duvidas: { icone: CircleHelp, rotulo: 'Dúvidas' },
  avisos: { icone: Bell, rotulo: 'Avisos' },
  dicas: { icone: Lightbulb, rotulo: 'Dicas' },
  estrela: { icone: Star, rotulo: 'Estrela' },
  coracao: { icone: Heart, rotulo: 'Coração' },
  livro: { icone: BookOpen, rotulo: 'Livro' },
  camera: { icone: Camera, rotulo: 'Câmera' },
  tesoura: { icone: Scissors, rotulo: 'Tesoura' },
  paleta: { icone: Palette, rotulo: 'Paleta' },
}

// O ícone da comunidade sobre a cor que a Equipe escolheu (a cor é dado da comunidade, não do tema).
export function IconeDaComunidade({
  icone,
  cor,
  className,
}: {
  icone: string
  cor: string
  className?: string
}) {
  const Icone = ICONES[icone as Chave]?.icone ?? MessagesSquare
  return (
    <span
      aria-hidden="true"
      className={cn(
        'grid size-7 shrink-0 place-items-center rounded-md bg-(--cor-da-comunidade) text-(--tinta-da-comunidade)',
        // Na casca Lume o tema decide: sem token, a cor da comunidade; o Ateliê usa papel e café.
        'in-data-[casca=lume]:bg-[color:var(--comunidade-icone-fundo,var(--cor-da-comunidade))] in-data-[casca=lume]:text-[color:var(--comunidade-icone-tinta,var(--tinta-da-comunidade))]',
        className,
      )}
      // A cor é dado da comunidade, não do tema: vai como variável e o token decide se vale.
      // O ícone vai na cor que mais contrasta com a da comunidade (branco só não serve em cor clara).
      style={
        {
          '--cor-da-comunidade': cor,
          '--tinta-da-comunidade': corSobre(cor),
        } as CSSProperties
      }
    >
      <Icone className="size-4" />
    </span>
  )
}
