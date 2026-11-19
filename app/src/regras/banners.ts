// Banners do carrossel no topo da vitrine. A equipe cadastra a imagem (computador e celular), o
// link opcional, o público (todos, quem tem ou quem não tem matrícula ativa em cursos escolhidos),
// as datas e a ordem. Este módulo decide quais banners um aluno vê numa data e conta exibições e
// cliques. Excluir é "excluir protegido" (ver `exclusao-protegida.ts`).

import { and, asc, eq, inArray, isNull, max, sql } from 'drizzle-orm'
import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import type * as schema from '#/db/schema'
import { banner, bannerCurso, curso } from '#/db/schema'
import { LIMITE_DO_TITULO_DO_BANNER } from '#/regras/formulario-do-banner'
import { emLotes } from '#/regras/lotes'
import { cursosDoAluno } from '#/regras/matricula'
import { type Banco, comoLibsql, type Relogio } from '#/regras/tipos'

export class ErroDeBanner extends Error {
  constructor(mensagem: string) {
    super(mensagem)
    this.name = 'ErroDeBanner'
  }
}

// D1 e libsql têm a mesma API de consulta; ver o comentário igual em `conteudo.ts`.
const novoId = () => crypto.randomUUID()

export type PublicoDoBanner = 'todos' | 'com_matricula' | 'sem_matricula'
export const PUBLICOS_DO_BANNER: readonly PublicoDoBanner[] = [
  'todos',
  'com_matricula',
  'sem_matricula',
]

export interface DadosDoBanner {
  titulo: string
  imagemComputador: string
  imagemCelular?: string | null
  link?: string | null
  publico?: PublicoDoBanner
  /** Cursos do público; só vale quando o público é por matrícula. */
  cursoIds?: string[]
  ativo?: boolean
  inicio?: Date | null
  fim?: Date | null
}

// ---------- Quem vê o quê (regra pura) ----------

export interface RegraDeExibicao {
  ativo: boolean
  inicio: Date | null
  fim: Date | null
  publico: PublicoDoBanner
  cursoIds: string[]
}

// Um banner aparece se está ativo, dentro das datas (início inclusive, fim inclusive) e o aluno
// pertence ao público. `cursosAtivos` são os cursos em que o aluno tem matrícula ativa.
export function bannerVisivel(
  regra: RegraDeExibicao,
  cursosAtivos: string[],
  agora: Date,
): boolean {
  if (!regra.ativo) return false
  const t = agora.getTime()
  if (regra.inicio && t < regra.inicio.getTime()) return false
  if (regra.fim && t > regra.fim.getTime()) return false
  if (regra.publico === 'todos') return true
  const tem = regra.cursoIds.some((id) => cursosAtivos.includes(id))
  return regra.publico === 'com_matricula' ? tem : !tem
}

export type SituacaoDoBanner = 'ativo' | 'pausado' | 'agendado' | 'encerrado'

function situacaoDoBanner(
  b: { ativo: boolean; inicio: Date | null; fim: Date | null },
  agora: Date,
): SituacaoDoBanner {
  if (!b.ativo) return 'pausado'
  if (b.inicio && agora.getTime() < b.inicio.getTime()) return 'agendado'
  if (b.fim && agora.getTime() > b.fim.getTime()) return 'encerrado'
  return 'ativo'
}

// ---------- Validação ----------

function linkValido(valor: string | null | undefined): string | null {
  const texto = (valor ?? '').trim()
  if (!texto) return null
  // Caminho do próprio site ("/cursos/...") ou endereço http(s) completo.
  if (texto.startsWith('/') && !texto.startsWith('//')) return texto
  try {
    const url = new URL(texto)
    if (url.protocol === 'https:' || url.protocol === 'http:') return texto
  } catch {
    // cai no erro abaixo
  }
  throw new ErroDeBanner(
    'O link precisa começar com https:// (ou com / para uma página do site).',
  )
}

async function dadosConferidos(
  db: LibSQLDatabase<typeof schema>,
  d: DadosDoBanner,
) {
  const titulo = d.titulo.trim()
  if (!titulo) throw new ErroDeBanner('Informe o título do banner.')
  if (titulo.length > LIMITE_DO_TITULO_DO_BANNER) {
    throw new ErroDeBanner(
      `O título pode ter no máximo ${LIMITE_DO_TITULO_DO_BANNER} caracteres.`,
    )
  }
  if (!d.imagemComputador?.trim()) {
    throw new ErroDeBanner('Envie a imagem para computador.')
  }
  const inicio = d.inicio ?? null
  const fim = d.fim ?? null
  if (inicio && fim && fim.getTime() < inicio.getTime()) {
    throw new ErroDeBanner('A data de fim não pode ser antes da de início.')
  }
  const publico = d.publico ?? 'todos'
  if (!PUBLICOS_DO_BANNER.includes(publico)) {
    throw new ErroDeBanner('Público inválido.')
  }
  const cursoIds = publico === 'todos' ? [] : [...new Set(d.cursoIds ?? [])]
  if (publico !== 'todos') {
    if (cursoIds.length === 0) {
      throw new ErroDeBanner('Escolha pelo menos um curso para o público.')
    }
    const existentes = await emLotes(cursoIds, (ids) =>
      db
        .select({ id: curso.id })
        .from(curso)
        .where(and(inArray(curso.id, ids), isNull(curso.excluidoEm))),
    )
    if (existentes.length !== cursoIds.length) {
      throw new ErroDeBanner('Há curso escolhido que não existe mais.')
    }
  }
  return {
    cursoIds,
    valores: {
      titulo,
      imagemComputador: d.imagemComputador.trim(),
      imagemCelular: d.imagemCelular?.trim() || null,
      link: linkValido(d.link),
      publico,
      ativo: d.ativo ?? true,
      inicio,
      fim,
    },
  }
}

// ---------- Cadastro (Equipe) ----------

export async function criarBanner(
  banco: Banco,
  entrada: DadosDoBanner,
): Promise<string> {
  const db = comoLibsql(banco)
  const { valores, cursoIds } = await dadosConferidos(db, entrada)
  const [{ ultima }] = await db
    .select({ ultima: max(banner.ordem) })
    .from(banner)
    .where(isNull(banner.excluidoEm))
  const id = novoId()
  await db.batch([
    db.insert(banner).values({ id, ...valores, ordem: (ultima ?? 0) + 1 }),
    ...(cursoIds.length
      ? [
          db
            .insert(bannerCurso)
            .values(cursoIds.map((cursoId) => ({ bannerId: id, cursoId }))),
        ]
      : []),
  ])
  return id
}

export async function editarBanner(
  banco: Banco,
  id: string,
  entrada: DadosDoBanner,
): Promise<void> {
  const db = comoLibsql(banco)
  const { valores, cursoIds } = await dadosConferidos(db, entrada)
  const [achado] = await db
    .select({ id: banner.id })
    .from(banner)
    .where(and(eq(banner.id, id), isNull(banner.excluidoEm)))
  if (!achado) throw new ErroDeBanner('Banner não encontrado.')
  await db.batch([
    db.update(banner).set(valores).where(eq(banner.id, id)),
    db.delete(bannerCurso).where(eq(bannerCurso.bannerId, id)),
    ...(cursoIds.length
      ? [
          db
            .insert(bannerCurso)
            .values(cursoIds.map((cursoId) => ({ bannerId: id, cursoId }))),
        ]
      : []),
  ])
}

export async function pausarOuAtivar(
  banco: Banco,
  id: string,
  ativo: boolean,
): Promise<void> {
  const db = comoLibsql(banco)
  await db
    .update(banner)
    .set({ ativo })
    .where(and(eq(banner.id, id), isNull(banner.excluidoEm)))
}

export async function excluirBanner(
  banco: Banco,
  agora: Relogio,
  id: string,
): Promise<void> {
  const db = comoLibsql(banco)
  await db
    .update(banner)
    .set({ excluidoEm: agora() })
    .where(and(eq(banner.id, id), isNull(banner.excluidoEm)))
}

// `ids` é a nova ordem completa dos banners (não excluídos).
export async function reordenarBanners(
  banco: Banco,
  ids: string[],
): Promise<void> {
  const db = comoLibsql(banco)
  if (new Set(ids).size !== ids.length) {
    throw new ErroDeBanner('A ordem tem itens repetidos.')
  }
  const existentes = await db
    .select({ id: banner.id })
    .from(banner)
    .where(isNull(banner.excluidoEm))
  const conhecidos = new Set(existentes.map((e) => e.id))
  if (ids.length !== conhecidos.size || ids.some((id) => !conhecidos.has(id))) {
    throw new ErroDeBanner(
      'A ordem enviada não bate com os banners existentes.',
    )
  }
  if (ids.length === 0) return
  const comandos = ids.map((id, i) =>
    db
      .update(banner)
      .set({ ordem: i + 1 })
      .where(eq(banner.id, id)),
  )
  await db.batch(comandos as [(typeof comandos)[number], ...typeof comandos])
}

export async function listarBannersDoPainel(banco: Banco, agora: Relogio) {
  const db = comoLibsql(banco)
  const hoje = agora()
  // Banners e ligações com os cursos não dependem um do outro: uma ida só.
  const [linhas, ligacoes] = await db.batch([
    db
      .select()
      .from(banner)
      .where(isNull(banner.excluidoEm))
      .orderBy(asc(banner.ordem)),
    db.select().from(bannerCurso),
  ])
  return linhas.map((b) => ({
    ...b,
    cursoIds: ligacoes.filter((l) => l.bannerId === b.id).map((l) => l.cursoId),
    situacao: situacaoDoBanner(b, hoje),
  }))
}

// ---------- Aluno ----------

export interface BannerDoAluno {
  id: string
  titulo: string
  imagemComputador: string
  imagemCelular: string | null
  link: string | null
}

// Os banners que o aluno vê hoje, na ordem do painel. Vale a matrícula ativa de verdade (a Equipe
// também é vista como aluno aqui, pelas próprias matrículas).
export async function bannersParaOAluno(
  banco: Banco,
  agora: Relogio,
  userId: string,
): Promise<BannerDoAluno[]> {
  const db = comoLibsql(banco)
  const hoje = agora()
  const [lista, { ativos }] = await Promise.all([
    listarBannersDoPainel(db, agora),
    cursosDoAluno(db, agora, userId),
  ])
  return lista
    .filter((b) => bannerVisivel(b, ativos, hoje))
    .map((b) => ({
      id: b.id,
      titulo: b.titulo,
      imagemComputador: b.imagemComputador,
      imagemCelular: b.imagemCelular,
      link: b.link,
    }))
}

// ---------- Métricas ----------

export async function registrarExibicao(banco: Banco, id: string) {
  await comoLibsql(banco)
    .update(banner)
    .set({ exibicoes: sql`${banner.exibicoes} + 1` })
    .where(and(eq(banner.id, id), isNull(banner.excluidoEm)))
}

export async function registrarClique(banco: Banco, id: string) {
  await comoLibsql(banco)
    .update(banner)
    .set({ cliques: sql`${banner.cliques} + 1` })
    .where(and(eq(banner.id, id), isNull(banner.excluidoEm)))
}
