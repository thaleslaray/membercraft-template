// "Entrar como esta aluna": a Equipe vê a escola como a aluna vê. Esta regra decide quem pode entrar em
// quem, por quanto tempo, e o que fica gravado no registro de ações. Criar a sessão e os cookies é do
// plugin do Better Auth (`lib/auth-entrar-como.ts`); aqui não há HTTP.

import { eq } from 'drizzle-orm'
import { user } from '#/db/schema'
import { exigirPermissao, type Pessoa } from '#/regras/permissoes'
import { registrarAcao } from '#/regras/registro-de-acoes'
import { type Banco, comoLibsql, type Relogio } from '#/regras/tipos'

/** A sessão de "entrar como" vale 4 horas e não renova com o uso. */
export const DURACAO_DE_ENTRAR_COMO_MS = 4 * 60 * 60 * 1000

export class ErroDeEntrarComo extends Error {
  constructor(mensagem: string) {
    super(mensagem)
    this.name = 'ErroDeEntrarComo'
  }
}

export function expiracaoDeEntrarComo(agora: Date): Date {
  return new Date(agora.getTime() + DURACAO_DE_ENTRAR_COMO_MS)
}

export interface AlunaDeEntrarComo {
  id: string
  nome: string
  email: string
}

/**
 * Confere se `autor` pode entrar como `alunoId`: só Proprietário e Equipe, e só em quem tem perfil
 * 'aluno' (nunca em outra pessoa da Equipe nem no Proprietário).
 */
export async function validarEntradaComo(
  banco: Banco,
  entrada: { autor: Pessoa; alunoId: string },
): Promise<AlunaDeEntrarComo> {
  exigirPermissao(entrada.autor.perfil, 'entrar-como')
  const [alvo] = await comoLibsql(banco)
    .select({
      id: user.id,
      nome: user.name,
      email: user.email,
      perfil: user.perfil,
    })
    .from(user)
    .where(eq(user.id, entrada.alunoId))
  if (!alvo) throw new ErroDeEntrarComo('Aluna não encontrada.')
  if (alvo.perfil !== 'aluno') {
    throw new ErroDeEntrarComo('Só é possível entrar como uma aluna.')
  }
  return { id: alvo.id, nome: alvo.nome, email: alvo.email }
}

/** Enquanto a sessão é de "entrar como" (`impersonatedBy` preenchido), a aluna não troca de e-mail. */
export function trocaDeEmailBloqueada(
  impersonatedBy: string | null | undefined,
): boolean {
  return Boolean(impersonatedBy)
}

export const MENSAGEM_EMAIL_BLOQUEADO =
  'Você está vendo como a aluna: não dá para trocar o e-mail dela por aqui.'

export function registrarEntradaComo(
  banco: Banco,
  agora: Relogio,
  entrada: { autorId: string; aluna: AlunaDeEntrarComo; expiraEm: Date },
) {
  return registrarAcao(banco, agora, {
    autorId: entrada.autorId,
    acao: 'entrou-como',
    detalhe: {
      alunoId: entrada.aluna.id,
      alunoNome: entrada.aluna.nome,
      expiraEm: entrada.expiraEm.toISOString(),
    },
  })
}

export function registrarSaidaDeEntrarComo(
  banco: Banco,
  agora: Relogio,
  entrada: { autorId: string; alunoId: string },
) {
  return registrarAcao(banco, agora, {
    autorId: entrada.autorId,
    acao: 'saiu-de-entrar-como',
    detalhe: { alunoId: entrada.alunoId },
  })
}
