// Equipe do Estúdio (#61): quem tem perfil Equipe ou Proprietário. Só o Proprietário mexe aqui
// (`gerir-equipe`, conferido pela server function). A regra de ouro: nunca ficar sem Proprietário.
// Quem sai da equipe volta a ser aluno, e as matrículas dele não são tocadas.

import { and, asc, count, eq, inArray, ne, or, sql } from 'drizzle-orm'
import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import type * as schema from '#/db/schema'
import { user } from '#/db/schema'
import { emailValido } from '#/regras/matricula'
import { type Perfil, tratarPerfil } from '#/regras/permissoes'
import { prepararRegistro } from '#/regras/registro-de-acoes'
import { type Banco, comoLibsql, type Relogio } from '#/regras/tipos'

export type PerfilDaEquipe = 'equipe' | 'proprietario'

export class ErroDeEquipe extends Error {
  constructor(mensagem: string) {
    super(mensagem)
    this.name = 'ErroDeEquipe'
  }
}

const SEM_PROPRIETARIO =
  'A área não pode ficar sem Proprietário. Passe o perfil a outra pessoa antes.'

function perfilDaEquipe(valor: string): PerfilDaEquipe {
  if (valor === 'equipe' || valor === 'proprietario') return valor
  throw new ErroDeEquipe('Escolha o perfil Equipe ou Proprietário.')
}

export async function listarEquipe(banco: Banco) {
  return comoLibsql(banco)
    .select({
      id: user.id,
      nome: user.name,
      email: user.email,
      perfil: user.perfil,
    })
    .from(user)
    .where(inArray(user.perfil, ['equipe', 'proprietario']))
    .orderBy(asc(user.perfil), asc(user.name))
}

async function pessoaPorId(db: LibSQLDatabase<typeof schema>, userId: string) {
  const [pessoa] = await db.select().from(user).where(eq(user.id, userId))
  if (!pessoa) throw new ErroDeEquipe('Pessoa não encontrada.')
  return pessoa
}

/**
 * Dá o perfil a quem tem esse e-mail; se ainda não há conta, cria a conta (sem senha: a pessoa
 * entra pelo código no e-mail). Quem já é Proprietário não perde o perfil por aqui.
 */
export async function adicionarNaEquipe(
  banco: Banco,
  agora: Relogio,
  entrada: { autorId: string; email: string; perfil: string },
): Promise<{ userId: string; criouConta: boolean }> {
  const db = comoLibsql(banco)
  const perfil = perfilDaEquipe(entrada.perfil)
  const email = entrada.email.trim().toLowerCase()
  if (!emailValido(email)) throw new ErroDeEquipe('Informe um e-mail válido.')
  const [conta] = await db.select().from(user).where(eq(user.email, email))
  if (conta && conta.perfil !== 'aluno') {
    throw new ErroDeEquipe(
      `${email} já está na equipe como ${conta.perfil === 'proprietario' ? 'Proprietário' : 'Equipe'}. Para mudar, troque o perfil.`,
    )
  }
  const userId = conta?.id ?? crypto.randomUUID()
  const registro = prepararRegistro(banco, agora, {
    autorId: entrada.autorId,
    acao: 'equipe-adicionada',
    detalhe: { pessoaId: userId, email, perfil, contaNova: !conta },
  })
  if (conta) {
    await db.batch([
      db.update(user).set({ perfil }).where(eq(user.id, userId)),
      registro,
    ])
  } else {
    await db.batch([
      db.insert(user).values({
        id: userId,
        name: email.split('@')[0],
        email,
        perfil,
      }),
      registro,
    ])
  }
  return { userId, criouConta: !conta }
}

// Muda o perfil só se, depois da mudança, ainda sobrar um Proprietário. A conta de Proprietários
// vai dentro do próprio UPDATE: duas trocas ao mesmo tempo não esvaziam a lista.
async function mudarPerfilSemDeixarSemProprietario(
  db: LibSQLDatabase<typeof schema>,
  userId: string,
  novo: 'aluno' | PerfilDaEquipe,
): Promise<boolean> {
  const outrosProprietarios = db
    .select({ n: count() })
    .from(user)
    .where(and(eq(user.perfil, 'proprietario'), ne(user.id, userId)))
  const mudou = await db
    .update(user)
    .set({ perfil: novo })
    .where(
      and(
        eq(user.id, userId),
        or(
          ne(user.perfil, 'proprietario'),
          sql`${novo === 'proprietario' ? 1 : 0} = 1`,
          sql`(${outrosProprietarios}) > 0`,
        ),
      ),
    )
    .returning({ id: user.id })
  return mudou.length > 0
}

export async function trocarPerfilDaEquipe(
  banco: Banco,
  agora: Relogio,
  entrada: { autorId: string; userId: string; perfil: string },
): Promise<void> {
  const db = comoLibsql(banco)
  const perfil = perfilDaEquipe(entrada.perfil)
  const pessoa = await pessoaPorId(db, entrada.userId)
  if (pessoa.perfil === 'aluno') {
    throw new ErroDeEquipe('Essa pessoa não está na equipe. Adicione-a antes.')
  }
  if (pessoa.perfil === perfil) return
  if (!(await mudarPerfilSemDeixarSemProprietario(db, pessoa.id, perfil))) {
    throw new ErroDeEquipe(SEM_PROPRIETARIO)
  }
  await prepararRegistro(banco, agora, {
    autorId: entrada.autorId,
    acao: 'equipe-perfil-trocado',
    detalhe: { pessoaId: pessoa.id, de: pessoa.perfil, para: perfil },
  })
}

/** Tira a pessoa da equipe: ela volta a ser aluna, com as matrículas que já tinha. */
export async function removerDaEquipe(
  banco: Banco,
  agora: Relogio,
  entrada: { autorId: string; userId: string },
): Promise<void> {
  const db = comoLibsql(banco)
  const pessoa = await pessoaPorId(db, entrada.userId)
  if (pessoa.perfil === 'aluno') {
    throw new ErroDeEquipe('Essa pessoa não está na equipe.')
  }
  if (!(await mudarPerfilSemDeixarSemProprietario(db, pessoa.id, 'aluno'))) {
    throw new ErroDeEquipe(SEM_PROPRIETARIO)
  }
  await prepararRegistro(banco, agora, {
    autorId: entrada.autorId,
    acao: 'equipe-removida',
    detalhe: { pessoaId: pessoa.id, email: pessoa.email, era: pessoa.perfil },
  })
}

/** O perfil de quem está logando, para dar a duração certa à sessão. Sem a pessoa, vale aluno. */
export async function perfilDoUsuario(
  banco: Banco,
  userId: string,
): Promise<Perfil> {
  const [achado] = await comoLibsql(banco)
    .select({ perfil: user.perfil })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1)
  return tratarPerfil(achado?.perfil)
}
