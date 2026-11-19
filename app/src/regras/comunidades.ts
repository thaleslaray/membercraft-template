// Comunidades (#59): o fórum criado pela Equipe. Pública (todo aluno com matrícula ativa) ou
// restrita a turmas, com ícone, cor e a opção "só a equipe publica". Este módulo cuida do cadastro
// e de quem enxerga o quê; as publicações ficam em `publicacoes.ts`.

import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm'
import {
  comunidade,
  comunidadeTurma,
  matricula,
  publicacao,
  turma,
  user,
} from '#/db/schema'
import {
  CORES_DA_COMUNIDADE,
  ICONES_DA_COMUNIDADE,
  type IconeDaComunidade,
} from '#/regras/comunidade-constantes'
import { emLotes } from '#/regras/lotes'
import { situacaoDaMatricula } from '#/regras/matricula'
import { ehEquipe, type Pessoa } from '#/regras/permissoes'
import { type Banco, comoLibsql, type Relogio } from '#/regras/tipos'

export class ErroDeComunidade extends Error {
  constructor(mensagem: string) {
    super(mensagem)
    this.name = 'ErroDeComunidade'
  }
}

export { CORES_DA_COMUNIDADE, ICONES_DA_COMUNIDADE, type IconeDaComunidade }

export interface EntradaDaComunidade {
  nome: string
  descricao?: string | null
  icone: string
  cor: string
  soEquipePublica: boolean
  /** Vazio = pública. */
  turmaIds: string[]
}

export interface ComunidadeDaLista {
  id: string
  nome: string
  descricao: string | null
  icone: string
  cor: string
  soEquipePublica: boolean
  /** Vazio = pública. */
  turmaIds: string[]
}

async function validar(db: Banco, entrada: EntradaDaComunidade) {
  const nome = entrada.nome.trim()
  if (!nome) throw new ErroDeComunidade('Informe o nome da comunidade.')
  if (nome.length > 80) {
    throw new ErroDeComunidade('O nome pode ter no máximo 80 caracteres.')
  }
  const descricao = (entrada.descricao ?? '').trim()
  if (descricao.length > 300) {
    throw new ErroDeComunidade('A descrição pode ter no máximo 300 caracteres.')
  }
  if (!(ICONES_DA_COMUNIDADE as readonly string[]).includes(entrada.icone)) {
    throw new ErroDeComunidade('Escolha um ícone da lista.')
  }
  if (!(CORES_DA_COMUNIDADE as readonly string[]).includes(entrada.cor)) {
    throw new ErroDeComunidade('Escolha uma cor da lista.')
  }
  const turmaIds = [...new Set(entrada.turmaIds)]
  if (turmaIds.length > 0) {
    const achadas = await emLotes(turmaIds, (ids) =>
      comoLibsql(db)
        .select({ id: turma.id })
        .from(turma)
        .where(inArray(turma.id, ids)),
    )
    if (achadas.length !== turmaIds.length) {
      throw new ErroDeComunidade('Turma não encontrada.')
    }
  }
  return {
    nome,
    descricao: descricao || null,
    icone: entrada.icone,
    cor: entrada.cor,
    soEquipePublica: entrada.soEquipePublica,
    turmaIds,
  }
}

export async function criarComunidade(
  db: Banco,
  entrada: EntradaDaComunidade,
): Promise<string> {
  const { turmaIds, ...dados } = await validar(db, entrada)
  const conexao = comoLibsql(db)
  const id = crypto.randomUUID()
  await conexao.insert(comunidade).values({ id, ...dados })
  if (turmaIds.length > 0) {
    await conexao
      .insert(comunidadeTurma)
      .values(turmaIds.map((turmaId) => ({ comunidadeId: id, turmaId })))
  }
  return id
}

export async function editarComunidade(
  db: Banco,
  id: string,
  entrada: EntradaDaComunidade,
): Promise<void> {
  const conexao = comoLibsql(db)
  const [existente] = await conexao
    .select({ id: comunidade.id })
    .from(comunidade)
    .where(and(eq(comunidade.id, id), isNull(comunidade.excluidoEm)))
  if (!existente) throw new ErroDeComunidade('Comunidade não encontrada.')
  const { turmaIds, ...dados } = await validar(db, entrada)
  // Os dados e as turmas trocam juntos: ou tudo, ou nada.
  await conexao.batch([
    conexao.update(comunidade).set(dados).where(eq(comunidade.id, id)),
    conexao.delete(comunidadeTurma).where(eq(comunidadeTurma.comunidadeId, id)),
    ...(turmaIds.length > 0
      ? [
          conexao
            .insert(comunidadeTurma)
            .values(turmaIds.map((turmaId) => ({ comunidadeId: id, turmaId }))),
        ]
      : []),
  ] as unknown as Parameters<typeof conexao.batch>[0])
}

/** Exclusão protegida: a comunidade e as publicações dela somem das telas e voltam por 30 dias. */
export async function excluirComunidade(
  db: Banco,
  agora: Relogio,
  id: string,
): Promise<void> {
  const excluidas = await comoLibsql(db)
    .update(comunidade)
    .set({ excluidoEm: agora() })
    .where(and(eq(comunidade.id, id), isNull(comunidade.excluidoEm)))
    .returning({ id: comunidade.id })
  if (excluidas.length === 0) {
    throw new ErroDeComunidade('Comunidade não encontrada.')
  }
}

async function turmasPorComunidade(db: Banco) {
  const linhas = await comoLibsql(db).select().from(comunidadeTurma)
  const mapa = new Map<string, string[]>()
  for (const l of linhas) {
    mapa.set(l.comunidadeId, [...(mapa.get(l.comunidadeId) ?? []), l.turmaId])
  }
  return mapa
}

/** Todas as comunidades (para a Equipe), em ordem alfabética. */
export async function listarComunidades(
  db: Banco,
): Promise<ComunidadeDaLista[]> {
  const [linhas, turmas] = await Promise.all([
    comoLibsql(db)
      .select()
      .from(comunidade)
      .where(isNull(comunidade.excluidoEm))
      .orderBy(asc(sql`lower(${comunidade.nome})`), asc(comunidade.id)),
    turmasPorComunidade(db),
  ])
  return linhas.map((c) => ({
    id: c.id,
    nome: c.nome,
    descricao: c.descricao,
    icone: c.icone,
    cor: c.cor,
    soEquipePublica: c.soEquipePublica,
    turmaIds: turmas.get(c.id) ?? [],
  }))
}

/** Quantas publicações (não excluídas) cada comunidade tem, para o painel. */
export async function contarPublicacoesPorComunidade(
  db: Banco,
): Promise<Record<string, number>> {
  const linhas = await comoLibsql(db)
    .select({ id: publicacao.comunidadeId, total: sql<number>`count(*)` })
    .from(publicacao)
    .where(isNull(publicacao.excluidoEm))
    .groupBy(publicacao.comunidadeId)
  return Object.fromEntries(linhas.map((l) => [l.id, Number(l.total)]))
}

/** Turmas em que a pessoa tem matrícula ativa agora. */
export async function turmasAtivasDaPessoa(
  db: Banco,
  agora: Relogio,
  userId: string,
): Promise<Set<string>> {
  const hoje = agora()
  const linhas = await comoLibsql(db)
    .select({
      turmaId: matricula.turmaId,
      situacao: matricula.situacao,
      expiraEm: matricula.expiraEm,
    })
    .from(matricula)
    .where(eq(matricula.userId, userId))
  return new Set(
    linhas
      .filter((l) => situacaoDaMatricula(l, hoje) === 'ativa')
      .map((l) => l.turmaId),
  )
}

/**
 * As comunidades que a pessoa enxerga. A Equipe vê todas; o aluno precisa de matrícula ativa, e as
 * restritas pedem matrícula ativa numa das turmas escolhidas.
 */
export async function comunidadesVisiveis(
  db: Banco,
  agora: Relogio,
  pessoa: Pessoa,
): Promise<ComunidadeDaLista[]> {
  const todas = await listarComunidades(db)
  if (ehEquipe(pessoa)) return todas
  const turmas = await turmasAtivasDaPessoa(db, agora, pessoa.id)
  if (turmas.size === 0) return []
  return todas.filter(
    (c) => c.turmaIds.length === 0 || c.turmaIds.some((t) => turmas.has(t)),
  )
}

/** A comunidade, se a pessoa a enxerga; senão nulo (quem não tem acesso não descobre que existe). */
export async function comunidadeVisivel(
  db: Banco,
  agora: Relogio,
  pessoa: Pessoa,
  comunidadeId: string,
): Promise<ComunidadeDaLista | null> {
  const visiveis = await comunidadesVisiveis(db, agora, pessoa)
  return visiveis.find((c) => c.id === comunidadeId) ?? null
}

/** Quem publica: a Equipe sempre; o aluno, se a comunidade não é "só a equipe publica". */
export function podePublicar(
  pessoa: Pessoa,
  comunidade: Pick<ComunidadeDaLista, 'soEquipePublica'>,
): boolean {
  return ehEquipe(pessoa) || !comunidade.soEquipePublica
}

/**
 * Entre os ids dados, quem enxerga a comunidade agora (para avisar só quem ainda tem acesso).
 */
export async function quemEnxerga(
  db: Banco,
  agora: Relogio,
  comunidadeId: string,
  userIds: string[],
): Promise<string[]> {
  if (userIds.length === 0) return []
  const conexao = comoLibsql(db)
  const [alvo] = await conexao
    .select()
    .from(comunidade)
    .where(and(eq(comunidade.id, comunidadeId), isNull(comunidade.excluidoEm)))
  if (!alvo) return []
  const turmasDaComunidade =
    (await turmasPorComunidade(db)).get(comunidadeId) ?? []
  const pessoas = await emLotes(userIds, (ids) =>
    conexao
      .select({ id: user.id, perfil: user.perfil })
      .from(user)
      .where(inArray(user.id, ids)),
  )
  const hoje = agora()
  const matriculas = await emLotes(userIds, (ids) =>
    conexao
      .select({
        userId: matricula.userId,
        turmaId: matricula.turmaId,
        situacao: matricula.situacao,
        expiraEm: matricula.expiraEm,
      })
      .from(matricula)
      .where(inArray(matricula.userId, ids)),
  )
  const ativas = new Map<string, Set<string>>()
  for (const m of matriculas) {
    if (situacaoDaMatricula(m, hoje) !== 'ativa') continue
    ativas.set(m.userId, (ativas.get(m.userId) ?? new Set()).add(m.turmaId))
  }
  return pessoas
    .filter((p) => {
      if (p.perfil !== 'aluno') return true
      const turmas = ativas.get(p.id)
      if (!turmas || turmas.size === 0) return false
      return (
        turmasDaComunidade.length === 0 ||
        turmasDaComunidade.some((t) => turmas.has(t))
      )
    })
    .map((p) => p.id)
}
