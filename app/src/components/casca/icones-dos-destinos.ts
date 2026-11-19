import { BookOpen, CircleHelp, MessagesSquare } from 'lucide-react'
import type { IdDoDestino } from '#/lib/destinos-da-casca'

/** Ícone de cada destino nas abas do pé (celular), comum às duas cascas. */
export const ICONES_DOS_DESTINOS: Record<IdDoDestino, typeof BookOpen> = {
  cursos: BookOpen,
  comunidade: MessagesSquare,
  atendimento: CircleHelp,
}

/** Estando na própria página do destino, tocar na aba leva ao topo em vez de navegar. */
export function naPaginaDoDestino(caminho: string, para: string): boolean {
  return (caminho.replace(/\/+$/, '') || '/') === para
}
