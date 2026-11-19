// Constantes da comunidade que a tela também usa (sem banco nem servidor, para não entrar no
// pacote do navegador mais do que o necessário).

export { POR_PAGINA } from '#/regras/paginacao'
export const LIMITE_DO_TITULO = 150
export const LIMITE_DO_COMENTARIO = 5000

/** Ícones que a Equipe escolhe (a tela traduz cada chave para um ícone). */
export const ICONES_DA_COMUNIDADE = [
  'mensagens',
  'duvidas',
  'avisos',
  'dicas',
  'estrela',
  'coracao',
  'livro',
  'camera',
  'tesoura',
  'paleta',
] as const
export type IconeDaComunidade = (typeof ICONES_DA_COMUNIDADE)[number]

/** Cores que a Equipe escolhe. */
export const CORES_DA_COMUNIDADE = [
  '#1f4d3a',
  '#2563eb',
  '#7c3aed',
  '#db2777',
  '#dc2626',
  '#ea580c',
  '#ca8a04',
  '#475569',
] as const

/** Nome legível de cada cor (rótulo do seletor: o leitor de tela não lê `#1f4d3a`). */
export const NOMES_DAS_CORES_DA_COMUNIDADE: Record<
  (typeof CORES_DA_COMUNIDADE)[number],
  string
> = {
  '#1f4d3a': 'Verde-floresta',
  '#2563eb': 'Azul',
  '#7c3aed': 'Violeta',
  '#db2777': 'Rosa',
  '#dc2626': 'Vermelho',
  '#ea580c': 'Laranja',
  '#ca8a04': 'Mostarda',
  '#475569': 'Cinza-ardósia',
}
