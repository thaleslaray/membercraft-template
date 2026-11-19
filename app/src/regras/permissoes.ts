// Verificação central de permissão: toda tela e server function pergunta aqui,
// nunca compara o perfil por conta própria.
export type Perfil = 'aluno' | 'equipe' | 'proprietario'

export type Acao =
  // Dia a dia da Equipe.
  | 'usar-estudio'
  | 'gerir-matriculas'
  | 'corrigir-quiz'
  | 'entrar-como'
  // Sensíveis: só o Proprietário (GLOSSARY).
  | 'gerir-equipe'
  | 'configurar-area'
  | 'ligar-produto-da-voomp'
  | 'ligar-produto-da-hotmart'
  | 'gerir-credenciais-da-hotmart'
  | 'exportar-dados'
  | 'excluir-aluno'
  | 'revogar-certificado'
  | 'ler-registro-de-acoes'

const DIA_A_DIA: Acao[] = [
  'usar-estudio',
  'gerir-matriculas',
  'corrigir-quiz',
  'entrar-como',
]
const SENSIVEIS: Acao[] = [
  'gerir-equipe',
  'configurar-area',
  'ligar-produto-da-voomp',
  'ligar-produto-da-hotmart',
  'gerir-credenciais-da-hotmart',
  'exportar-dados',
  'excluir-aluno',
  'revogar-certificado',
  'ler-registro-de-acoes',
]

const PERMISSOES: Record<Perfil, ReadonlySet<Acao>> = {
  aluno: new Set(),
  equipe: new Set(DIA_A_DIA),
  proprietario: new Set([...DIA_A_DIA, ...SENSIVEIS]),
}

export class PermissaoNegada extends Error {
  constructor(perfil: Perfil, acao: Acao) {
    super(`O perfil ${perfil} não pode: ${acao}`)
    this.name = 'PermissaoNegada'
  }
}

export function podeFazer(perfil: Perfil, acao: Acao): boolean {
  return PERMISSOES[perfil].has(acao)
}

export function exigirPermissao(perfil: Perfil, acao: Acao): void {
  if (!podeFazer(perfil, acao)) throw new PermissaoNegada(perfil, acao)
}

/** Quem faz a ação: o id e o perfil já tratado (um tipo só, para telas, regras e testes). */
export interface Pessoa {
  id: string
  perfil: Perfil
}

/** Equipe e Proprietário (quem usa o Estúdio): veem, moderam e respondem tudo. */
export const ehEquipe = (pessoa: { perfil: Perfil }): boolean =>
  podeFazer(pessoa.perfil, 'usar-estudio')

// Valor vindo de fora (banco, sessão): o que não for reconhecido vira o menor acesso.
export function tratarPerfil(valor: unknown): Perfil {
  return valor === 'equipe' || valor === 'proprietario' ? valor : 'aluno'
}

const ROTULOS: Record<Perfil, string> = {
  aluno: 'Aluno',
  equipe: 'Equipe',
  proprietario: 'Proprietário',
}
export function rotuloDoPerfil(perfil: Perfil): string {
  return ROTULOS[perfil]
}
