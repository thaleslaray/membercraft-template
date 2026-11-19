// Sininho: avisos por pessoa (tipo, texto, link, lida em). Módulo reutilizável: as outras fatias
// chamam `notificar` quando algo acontece com o aluno (resposta a comentário, Atendimento, quiz
// corrigido, pontos, certificado, publicação...). Quem chama pelo runtime usa
// `avisarNoSininho` (src/lib/notificacoes-cola.ts), que nunca lança.
//
// Para um tipo novo, acrescente-o em `TIPOS_DE_NOTIFICACAO` (ele só serve de rótulo e filtro).

import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm'
import { notificacao, user } from '#/db/schema'
import { type Banco, comoLibsql, type Relogio } from '#/regras/tipos'

export const TIPOS_DE_NOTIFICACAO = [
  'curso-liberado',
  'conteudo-liberado',
  'acesso-expirando',
  'sentimos-sua-falta',
  'resposta-ao-comentario',
  'resposta-do-atendimento',
  'quiz-corrigido',
  'pontos',
  'certificado',
  'publicacao',
  'fila-da-equipe',
] as const
export type TipoDeNotificacao = (typeof TIPOS_DE_NOTIFICACAO)[number]

export const LIMITE_DA_LISTA = 30
const TEXTO_MAXIMO = 300

export class ErroDeNotificacao extends Error {
  constructor(mensagem: string) {
    super(mensagem)
    this.name = 'ErroDeNotificacao'
  }
}

export interface EntradaDeNotificacao {
  userId: string
  tipo: TipoDeNotificacao
  texto: string
  /** Caminho dentro da área (começa com `/`); sem link, o aviso só informa. */
  link?: string | null
}

export interface NotificacaoDaLista {
  id: string
  tipo: string
  texto: string
  link: string | null
  lida: boolean
  criadoEm: Date
}

function validar(entrada: EntradaDeNotificacao) {
  const texto = entrada.texto.trim()
  if (!texto) throw new ErroDeNotificacao('O aviso precisa de um texto.')
  const link = entrada.link?.trim() || null
  if (link && (!link.startsWith('/') || link.startsWith('//'))) {
    throw new ErroDeNotificacao(
      'O link do aviso precisa ser um caminho da área.',
    )
  }
  return { texto: texto.slice(0, TEXTO_MAXIMO), link }
}

/** Cria um aviso no sininho da pessoa. Devolve o id. */
export async function notificar(
  banco: Banco,
  agora: Relogio,
  entrada: EntradaDeNotificacao,
): Promise<string> {
  const db = comoLibsql(banco)
  const { texto, link } = validar(entrada)
  const id = crypto.randomUUID()
  await db.insert(notificacao).values({
    id,
    userId: entrada.userId,
    tipo: entrada.tipo,
    texto,
    link,
    criadoEm: agora(),
  })
  return id
}

/**
 * Os comandos que criam o mesmo aviso para várias pessoas (de 20 em 20), para entrar num `db.batch`
 * junto de outra escrita. Lista vazia se não há ninguém.
 */
export function prepararNotificacoes(
  banco: Banco,
  agora: Relogio,
  userIds: string[],
  entrada: Omit<EntradaDeNotificacao, 'userId'>,
) {
  const db = comoLibsql(banco)
  const pessoas = [...new Set(userIds)]
  if (pessoas.length === 0) return []
  const { texto, link } = validar({ ...entrada, userId: '-' })
  const quando = agora()
  const comandos = []
  for (let i = 0; i < pessoas.length; i += 20) {
    comandos.push(
      db.insert(notificacao).values(
        pessoas.slice(i, i + 20).map((userId) => ({
          id: crypto.randomUUID(),
          userId,
          tipo: entrada.tipo,
          texto,
          link,
          criadoEm: quando,
        })),
      ),
    )
  }
  return comandos
}

/** O mesmo aviso para várias pessoas de uma vez (equipe, por exemplo). */
export async function notificarVarios(
  banco: Banco,
  agora: Relogio,
  userIds: string[],
  entrada: Omit<EntradaDeNotificacao, 'userId'>,
): Promise<number> {
  const comandos = prepararNotificacoes(banco, agora, userIds, entrada)
  if (comandos.length === 0) return 0
  await comoLibsql(banco).batch(
    comandos as [(typeof comandos)[0], ...typeof comandos],
  )
  return new Set(userIds).size
}

/** Os avisos mais recentes da pessoa (lidos e não lidos) e o total de não lidos. */
export async function avisosDaPessoa(
  banco: Banco,
  userId: string,
  limite = LIMITE_DA_LISTA,
): Promise<{ naoLidas: number; avisos: NotificacaoDaLista[] }> {
  const db = comoLibsql(banco)
  const [linhas, [contagem]] = await Promise.all([
    db
      .select()
      .from(notificacao)
      .where(eq(notificacao.userId, userId))
      .orderBy(desc(notificacao.criadoEm), desc(notificacao.id))
      .limit(limite),
    db
      .select({ total: sql<number>`count(*)` })
      .from(notificacao)
      .where(and(eq(notificacao.userId, userId), isNull(notificacao.lidaEm))),
  ])
  return {
    naoLidas: Number(contagem?.total ?? 0),
    avisos: linhas.map((l) => ({
      id: l.id,
      tipo: l.tipo,
      texto: l.texto,
      link: l.link,
      lida: l.lidaEm !== null,
      criadoEm: l.criadoEm,
    })),
  }
}

/** Marca um aviso como lido. Só o dono consegue; devolve se algo mudou. */
export async function marcarComoLida(
  banco: Banco,
  agora: Relogio,
  userId: string,
  id: string,
): Promise<boolean> {
  const db = comoLibsql(banco)
  const marcadas = await db
    .update(notificacao)
    .set({ lidaEm: agora() })
    .where(
      and(
        eq(notificacao.id, id),
        eq(notificacao.userId, userId),
        isNull(notificacao.lidaEm),
      ),
    )
    .returning({ id: notificacao.id })
  return marcadas.length > 0
}

/** "Marcar todas como lidas". Devolve quantas eram não lidas. */
export async function marcarTodasComoLidas(
  banco: Banco,
  agora: Relogio,
  userId: string,
): Promise<number> {
  const db = comoLibsql(banco)
  const marcadas = await db
    .update(notificacao)
    .set({ lidaEm: agora() })
    .where(and(eq(notificacao.userId, userId), isNull(notificacao.lidaEm)))
    .returning({ id: notificacao.id })
  return marcadas.length
}

/** Quem recebe os avisos da equipe: Equipe e Proprietário. */
export async function idsDaEquipe(banco: Banco): Promise<string[]> {
  const db = comoLibsql(banco)
  const linhas = await db
    .select({ id: user.id })
    .from(user)
    .where(inArray(user.perfil, ['equipe', 'proprietario']))
  return linhas.map((l) => l.id)
}
