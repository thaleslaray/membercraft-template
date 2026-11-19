// Os dois destinos da barra do topo (e das abas do celular) e a regra de qual está ativo para cada
// rota do aluno. Rotas antigas continuam vivas; aqui só se diz a qual destino cada uma pertence.

export type IdDoDestino = 'cursos' | 'comunidade' | 'atendimento'

export type Destino = {
  id: IdDoDestino
  rotulo: string
  para: '/' | '/comunidades' | '/atendimento'
}

export const DESTINOS_DO_TOPO: Destino[] = [
  { id: 'cursos', rotulo: 'Meus cursos', para: '/' },
  { id: 'comunidade', rotulo: 'Comunidade', para: '/comunidades' },
]

const ATENDIMENTO: Destino = {
  id: 'atendimento',
  rotulo: 'Falar com a equipe',
  para: '/atendimento',
}

/** Destinos do aluno. Com a Comunidade desligada na aparência, "Falar com a equipe" ocupa o lugar dela. */
export function destinosDoAluno({
  mostrarComunidade = true,
}: {
  mostrarComunidade?: boolean
} = {}): Destino[] {
  if (mostrarComunidade) return DESTINOS_DO_TOPO
  return DESTINOS_DO_TOPO.map((d) => (d.id === 'comunidade' ? ATENDIMENTO : d))
}

const DA_COMUNIDADE = ['/comunidades', '/ranking']
const DOS_CURSOS = [
  '/cursos',
  '/aulas',
  '/favoritos',
  '/certificados',
  '/busca',
]

function pertence(caminho: string, base: string): boolean {
  return caminho === base || caminho.startsWith(`${base}/`)
}

/** Destino marcado para a rota, ou `null` quando a rota mora no menu do avatar (pontos, atendimento, conta). */
export function destinoAtivo(
  pathname: string,
  { mostrarComunidade = true }: { mostrarComunidade?: boolean } = {},
): IdDoDestino | null {
  const caminho = pathname.replace(/\/+$/, '') || '/'
  if (caminho === '/') return 'cursos'
  if (!mostrarComunidade && pertence(caminho, '/atendimento')) {
    return 'atendimento'
  }
  if (DA_COMUNIDADE.some((b) => pertence(caminho, b))) return 'comunidade'
  if (DOS_CURSOS.some((b) => pertence(caminho, b))) return 'cursos'
  return null
}
