// Busca do aluno (#49): títulos e textos de cursos, módulos e aulas, só nos cursos que a pessoa
// acessa. Monta o índice na hora a partir do conteúdo (são centenas de aulas, não milhares), em vez
// de manter uma tabela que precisaria acompanhar cada edição da equipe.
//
// Pontos de extensão deixados para as fatias seguintes:
// - Transcrições (#50): é só produzir `Trecho`s de tipo `transcricao` com `tempo` (segundos) e
//   passá-los em `trechosExtras`; entram na contagem de "Aulas" e levam ao minuto do vídeo.
// - Cadeado (#42, regras de liberação): `bloqueioDaAula` devolve o motivo pelo qual a aula está
//   bloqueada para a pessoa (ou `null`). A aula bloqueada continua na busca, com o motivo.

import { and, eq, isNull } from 'drizzle-orm'
import { aula, curso, favorito, modulo } from '#/db/schema'
import { FILTROS_DA_BUSCA, type FiltroDaBusca } from '#/regras/busca-filtros'
import { entreOsIds } from '#/regras/lotes'
import { type Banco, comoLibsql } from '#/regras/tipos'

export { FILTROS_DA_BUSCA, type FiltroDaBusca }

/** O que o trecho é: o título de um item, o texto de uma aula ou uma fala do vídeo. */
export type TipoDeTrecho = 'curso' | 'modulo' | 'aula' | 'texto' | 'transcricao'

/** Uma peça pesquisável. `tempo` (segundos no vídeo) só existe nas transcrições. */
export interface Trecho {
  tipo: TipoDeTrecho
  cursoId: string
  moduloId?: string
  aulaId?: string
  texto: string
  tempo?: number
}

export interface ResultadoDaBusca {
  tipo: 'curso' | 'modulo' | 'aula'
  cursoId: string
  cursoNome: string
  moduloId: string | null
  moduloNome: string | null
  aulaId: string | null
  titulo: string
  /** Pedaço do texto (ou da fala) em que o termo apareceu; nulo quando só o título bateu. */
  trecho: string | null
  /** Segundos no vídeo, quando o trecho é de transcrição. */
  tempo: number | null
  /** Minuto em que o termo é falado no vídeo, mesmo que o título também tenha batido (busca rápida). */
  falaEm: number | null
  favorita: boolean
  /** Motivo do cadeado (aula bloqueada); nulo quando liberada. */
  bloqueio: string | null
}

export interface RespostaDaBusca {
  termo: string
  filtro: FiltroDaBusca
  contagem: Record<FiltroDaBusca, number>
  resultados: ResultadoDaBusca[]
}

export interface OpcoesDaBusca {
  userId: string
  cursosPermitidos: string[] | 'todos'
  termo: string
  filtro?: FiltroDaBusca
  /** Trechos de fora do conteúdo (transcrições, #50). */
  trechosExtras?: (aulaIds: string[]) => Promise<Trecho[]>
  /** Motivo do cadeado da aula para esta pessoa (regras de liberação, #42). */
  bloqueioDaAula?: (aulaId: string) => string | null
  /** Motivo do cadeado do módulo (#42); nulo quando liberado. */
  bloqueioDoModulo?: (moduloId: string) => string | null
  /** Conteúdo oculto pelas regras de liberação (#42) não aparece na busca. */
  aulaOculta?: (aulaId: string) => boolean
  moduloOculto?: (moduloId: string) => boolean
}

const ENTIDADES: Record<string, string> = {
  nbsp: ' ',
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
}

/** Texto puro de um HTML de aula (sem marcação nem entidades comuns). */
export function textoDoHtml(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&([a-z]+);/gi, (m, nome) => ENTIDADES[nome.toLowerCase()] ?? m)
    .replace(/\s+/g, ' ')
    .trim()
}

/** Minúsculas e sem acento: "Coloração" acha "coloracao". */
export function normalizar(texto: string): string {
  return texto.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
}

export function palavrasDoTermo(termo: string): string[] {
  return normalizar(termo).split(/\s+/).filter(Boolean)
}

function bate(texto: string, palavras: string[]): boolean {
  const alvo = normalizar(texto)
  return palavras.every((p) => alvo.includes(p))
}

/** Pedaço do texto em volta da primeira palavra encontrada. */
function recortar(texto: string, palavras: string[]): string {
  const alvo = normalizar(texto)
  const pos = Math.min(
    ...palavras.map((p) => alvo.indexOf(p)).filter((i) => i >= 0),
  )
  const inicio = Math.max(0, pos - 40)
  const fim = Math.min(texto.length, pos + 100)
  return `${inicio > 0 ? '…' : ''}${texto.slice(inicio, fim).trim()}${fim < texto.length ? '…' : ''}`
}

export async function buscar(
  banco: Banco,
  opcoes: OpcoesDaBusca,
): Promise<RespostaDaBusca> {
  const filtro = opcoes.filtro ?? 'todos'
  const termo = opcoes.termo.trim()
  const vazia: RespostaDaBusca = {
    termo,
    filtro,
    contagem: { todos: 0, cursos: 0, modulos: 0, aulas: 0, favoritos: 0 },
    resultados: [],
  }
  const palavras = palavrasDoTermo(termo)
  const { cursosPermitidos } = opcoes
  if (
    palavras.length === 0 ||
    (Array.isArray(cursosPermitidos) && cursosPermitidos.length === 0)
  ) {
    return vazia
  }

  const db = comoLibsql(banco)
  const doCurso = (coluna: typeof curso.id | typeof modulo.cursoId) =>
    Array.isArray(cursosPermitidos)
      ? entreOsIds(coluna, cursosPermitidos)
      : undefined
  const [cursos, modulos, aulas] = await Promise.all([
    db
      .select({ id: curso.id, nome: curso.nome, descricao: curso.descricao })
      .from(curso)
      .where(and(isNull(curso.excluidoEm), doCurso(curso.id))),
    db
      .select({ id: modulo.id, nome: modulo.nome, cursoId: modulo.cursoId })
      .from(modulo)
      .innerJoin(curso, eq(curso.id, modulo.cursoId))
      .where(
        and(
          isNull(modulo.excluidoEm),
          isNull(curso.excluidoEm),
          doCurso(modulo.cursoId),
        ),
      ),
    db
      .select({
        id: aula.id,
        titulo: aula.titulo,
        textoHtml: aula.textoHtml,
        moduloId: aula.moduloId,
        cursoId: modulo.cursoId,
      })
      .from(aula)
      .innerJoin(modulo, eq(modulo.id, aula.moduloId))
      .innerJoin(curso, eq(curso.id, modulo.cursoId))
      .where(
        and(
          isNull(aula.excluidoEm),
          isNull(modulo.excluidoEm),
          isNull(curso.excluidoEm),
          doCurso(modulo.cursoId),
        ),
      ),
  ])
  const nomeDoCurso = new Map(cursos.map((c) => [c.id, c.nome]))
  const moduloPorId = new Map(modulos.map((m) => [m.id, m]))
  const favoritas = new Set(
    (
      await db
        .select({ aulaId: favorito.aulaId })
        .from(favorito)
        .where(eq(favorito.userId, opcoes.userId))
    ).map((f) => f.aulaId),
  )
  const extras = opcoes.trechosExtras
    ? await opcoes.trechosExtras(aulas.map((a) => a.id))
    : []

  const lista: ResultadoDaBusca[] = []
  for (const c of cursos) {
    const noTitulo = bate(c.nome, palavras)
    const naDescricao = !noTitulo && bate(c.descricao, palavras)
    if (!noTitulo && !naDescricao) continue
    lista.push({
      tipo: 'curso',
      cursoId: c.id,
      cursoNome: c.nome,
      moduloId: null,
      moduloNome: null,
      aulaId: null,
      titulo: c.nome,
      trecho: naDescricao ? recortar(c.descricao, palavras) : null,
      tempo: null,
      falaEm: null,
      favorita: false,
      bloqueio: null,
    })
  }
  for (const m of modulos) {
    if (!bate(m.nome, palavras) || opcoes.moduloOculto?.(m.id)) continue
    lista.push({
      tipo: 'modulo',
      cursoId: m.cursoId,
      cursoNome: nomeDoCurso.get(m.cursoId) ?? '',
      moduloId: m.id,
      moduloNome: m.nome,
      aulaId: null,
      titulo: m.nome,
      trecho: null,
      tempo: null,
      falaEm: null,
      favorita: false,
      bloqueio: opcoes.bloqueioDoModulo?.(m.id) ?? null,
    })
  }
  const extrasDaAula = new Map<string, Trecho[]>()
  for (const t of extras) {
    if (!t.aulaId) continue
    extrasDaAula.set(t.aulaId, [...(extrasDaAula.get(t.aulaId) ?? []), t])
  }
  for (const a of aulas) {
    if (opcoes.aulaOculta?.(a.id)) continue
    const noTitulo = bate(a.titulo, palavras)
    const texto = noTitulo ? '' : textoDoHtml(a.textoHtml)
    const noTexto = !noTitulo && bate(texto, palavras)
    const extra = extrasDaAula.get(a.id)?.find((t) => bate(t.texto, palavras))
    if (!noTitulo && !noTexto && !extra) continue
    // O aluno não vê o texto da transcrição (GLOSSARY): só o minuto em que a fala acontece.
    const trecho = noTexto ? recortar(texto, palavras) : null
    lista.push({
      tipo: 'aula',
      cursoId: a.cursoId,
      cursoNome: nomeDoCurso.get(a.cursoId) ?? '',
      moduloId: a.moduloId,
      moduloNome: moduloPorId.get(a.moduloId)?.nome ?? null,
      aulaId: a.id,
      titulo: a.titulo,
      trecho,
      tempo: !noTitulo && !noTexto && extra ? (extra.tempo ?? null) : null,
      falaEm: extra?.tempo ?? null,
      favorita: favoritas.has(a.id),
      bloqueio: opcoes.bloqueioDaAula?.(a.id) ?? null,
    })
  }

  const contagem = {
    todos: lista.length,
    cursos: lista.filter((r) => r.tipo === 'curso').length,
    modulos: lista.filter((r) => r.tipo === 'modulo').length,
    aulas: lista.filter((r) => r.tipo === 'aula').length,
    favoritos: lista.filter((r) => r.favorita).length,
  }
  const resultados = lista.filter(
    (r) =>
      filtro === 'todos' ||
      (filtro === 'favoritos' && r.favorita) ||
      (filtro === 'cursos' && r.tipo === 'curso') ||
      (filtro === 'modulos' && r.tipo === 'modulo') ||
      (filtro === 'aulas' && r.tipo === 'aula'),
  )
  return { termo, filtro, contagem, resultados }
}
