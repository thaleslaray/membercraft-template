// Tipos e constantes da busca rápida (⌘K), sem o banco: o navegador importa daqui.

/** Letras mínimas para a busca rápida procurar (menos que isso mostra as últimas aulas). */
export const MINIMO_DA_BUSCA_RAPIDA = 2
/** Quantos resultados cada grupo mostra na janela; o resto fica em "Ver todos os resultados". */
export const LIMITE_POR_GRUPO: Record<GrupoDaBuscaRapida, number> = {
  aulas: 3,
  falados: 3,
  cursos: 2,
  modulos: 2,
}
/** Ordem dos grupos na janela: aulas e falas primeiro; grupo vazio some. */
export const ORDEM_DOS_GRUPOS: GrupoDaBuscaRapida[] = [
  'aulas',
  'falados',
  'cursos',
  'modulos',
]
/** Quantas aulas abertas por último aparecem sem termo. */
export const LIMITE_DAS_ULTIMAS = 5

export type GrupoDaBuscaRapida = 'cursos' | 'modulos' | 'aulas' | 'falados'

export interface ItemDaBuscaRapida {
  grupo: GrupoDaBuscaRapida
  cursoId: string
  cursoNome: string
  moduloNome: string | null
  /** Nulo em curso e módulo (levam à página do curso). */
  aulaId: string | null
  titulo: string
  /** Segundos no vídeo; só no grupo "Falado no vídeo". */
  tempo: number | null
  /** Aula salva nos favoritos (só aulas e falas). */
  favorita: boolean
  /** Motivo do cadeado; o item aparece, mas não abre. */
  bloqueio: string | null
}

export interface RespostaDaBuscaRapida {
  termo: string
  /** Total de cada grupo, antes do limite. */
  contagem: Record<GrupoDaBuscaRapida, number>
  grupos: Record<GrupoDaBuscaRapida, ItemDaBuscaRapida[]>
}

export interface UltimaAulaAberta {
  aulaId: string
  titulo: string
  cursoId: string
  cursoNome: string
  moduloNome: string
  bloqueio: string | null
}

/** Segundos como `m:ss`. */
export function minutoDoVideo(segundos: number): string {
  const m = Math.floor(segundos / 60)
  return `${m}:${String(segundos % 60).padStart(2, '0')}`
}
