// Os filtros da busca, sem o banco: o navegador importa daqui (busca.ts puxa o schema do Drizzle).
export const FILTROS_DA_BUSCA = [
  'todos',
  'cursos',
  'modulos',
  'aulas',
  'favoritos',
] as const
export type FiltroDaBusca = (typeof FILTROS_DA_BUSCA)[number]
