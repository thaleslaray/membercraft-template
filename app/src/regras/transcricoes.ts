// Transcrições dos vídeos (#50): a equipe sobe em lote os arquivos SRT/VTT, nomeados pelo ID do
// Vimeo, e a busca passa a achar o que foi falado e a abrir a aula no minuto certo. O aluno nunca
// vê o texto (GLOSSARY): ele só alimenta a busca.
import { and, asc, eq, isNull, like, sql } from 'drizzle-orm'
import { aula, modulo, transcricao, trechoDaTranscricao } from '#/db/schema'
import { normalizar, palavrasDoTermo, type Trecho } from '#/regras/busca'
import { trechosDaLegenda } from '#/regras/legendas'
import { entreOsIds } from '#/regras/lotes'
import { type Banco, comoLibsql, type Relogio } from '#/regras/tipos'

// O D1 aceita no máximo 100 valores por comando: 3 por trecho gravado.
const TRECHOS_POR_COMANDO = 25

export interface ArquivoDeLegenda {
  nome: string
  conteudo: string
}

export interface TranscricaoImportada {
  nome: string
  vimeoId: string
  aulas: string[]
  trechos: number
  /** Havia uma transcrição desse vídeo e ela foi trocada. */
  substituiu: boolean
}

export interface ArquivoIgnorado {
  nome: string
  motivo: 'sem-id' | 'sem-aula' | 'sem-legenda'
}

export interface ResultadoDaImportacao {
  importadas: TranscricaoImportada[]
  /** Arquivos que não entraram, com o motivo: nome fora do padrão, vídeo sem aula, texto ilegível. */
  ignorados: ArquivoIgnorado[]
}

/** O ID do Vimeo é o número no começo do nome: `123456789.srt`, `123456789.pt-BR.vtt`. */
export function vimeoIdDoArquivo(nome: string): string | null {
  const base = nome.split(/[\\/]/).pop() ?? nome
  return /^(\d{4,})(?=\D|$)/.exec(base)?.[1] ?? null
}

export async function importarTranscricoes(
  banco: Banco,
  agora: Relogio,
  arquivos: ArquivoDeLegenda[],
): Promise<ResultadoDaImportacao> {
  const db = comoLibsql(banco)
  const importadas: TranscricaoImportada[] = []
  const ignorados: ArquivoIgnorado[] = []

  for (const arquivo of arquivos) {
    const vimeoId = vimeoIdDoArquivo(arquivo.nome)
    if (!vimeoId) {
      ignorados.push({ nome: arquivo.nome, motivo: 'sem-id' })
      continue
    }
    const aulas = await db
      .select({ titulo: aula.titulo })
      .from(aula)
      .where(and(eq(aula.vimeoId, vimeoId), isNull(aula.excluidoEm)))
    if (aulas.length === 0) {
      ignorados.push({ nome: arquivo.nome, motivo: 'sem-aula' })
      continue
    }
    const trechos = trechosDaLegenda(arquivo.conteudo)
    if (trechos.length === 0) {
      ignorados.push({ nome: arquivo.nome, motivo: 'sem-legenda' })
      continue
    }
    const anterior = await db
      .select({ vimeoId: transcricao.vimeoId })
      .from(transcricao)
      .where(eq(transcricao.vimeoId, vimeoId))

    const linhas = trechos.map((t) => ({
      vimeoId,
      inicio: t.inicio,
      texto: t.texto,
      textoBusca: normalizar(t.texto),
    }))
    const insercoes = []
    for (let i = 0; i < linhas.length; i += TRECHOS_POR_COMANDO) {
      insercoes.push(
        db
          .insert(trechoDaTranscricao)
          .values(linhas.slice(i, i + TRECHOS_POR_COMANDO)),
      )
    }
    // Um lote só: ou troca tudo ou não troca nada.
    await db.batch([
      db
        .delete(trechoDaTranscricao)
        .where(eq(trechoDaTranscricao.vimeoId, vimeoId)),
      db
        .insert(transcricao)
        .values({ vimeoId, arquivo: arquivo.nome, criadoEm: agora() })
        .onConflictDoUpdate({
          target: transcricao.vimeoId,
          set: { arquivo: arquivo.nome, criadoEm: agora() },
        }),
      ...insercoes,
    ])

    importadas.push({
      nome: arquivo.nome,
      vimeoId,
      aulas: aulas.map((a) => a.titulo),
      trechos: trechos.length,
      substituiu: anterior.length > 0,
    })
  }
  return { importadas, ignorados }
}

export interface TranscricaoDoPainel {
  vimeoId: string
  arquivo: string
  trechos: number
  aulas: string[]
  importadaEm: Date
}

/** Transcrições gravadas, para a equipe conferir (só metadados; o texto não sai do banco). */
export async function listarTranscricoes(
  banco: Banco,
): Promise<TranscricaoDoPainel[]> {
  const db = comoLibsql(banco)
  const [lista, contagens, aulas] = await Promise.all([
    db.select().from(transcricao).orderBy(asc(transcricao.criadoEm)),
    db
      .select({
        vimeoId: trechoDaTranscricao.vimeoId,
        total: sql<number>`count(*)`,
      })
      .from(trechoDaTranscricao)
      .groupBy(trechoDaTranscricao.vimeoId),
    db
      .select({ vimeoId: aula.vimeoId, titulo: aula.titulo })
      .from(aula)
      .where(isNull(aula.excluidoEm)),
  ])
  const total = new Map(contagens.map((c) => [c.vimeoId, Number(c.total)]))
  return lista.map((t) => ({
    vimeoId: t.vimeoId,
    arquivo: t.arquivo,
    trechos: total.get(t.vimeoId) ?? 0,
    aulas: aulas.filter((a) => a.vimeoId === t.vimeoId).map((a) => a.titulo),
    importadaEm: t.criadoEm,
  }))
}

const escaparLike = (p: string) => p.replace(/[\\%_]/g, (c) => `\\${c}`)

/**
 * Fonte de `trechosExtras` da busca (#49): os trechos de transcrição que têm todas as palavras do
 * termo, das aulas pedidas. O filtro de texto e o de permissão rodam no banco (texto já sem
 * acento), que devolve um trecho por aula (o primeiro do vídeo). `limite` (opcional) corta o
 * número de aulas devolvidas; sem ele vêm todas, porque a contagem da busca depende disso.
 */
export function trechosDeTranscricao(
  banco: Banco,
  termo: string,
  limite?: number,
) {
  const db = comoLibsql(banco)
  const palavras = palavrasDoTermo(termo)
  return async (aulaIds: string[]): Promise<Trecho[]> => {
    if (palavras.length === 0 || aulaIds.length === 0) return []
    const linhas = await db
      .select({
        aulaId: aula.id,
        cursoId: modulo.cursoId,
        moduloId: aula.moduloId,
        // Com min(), o SQLite devolve o texto da mesma linha do menor início.
        inicio: sql<number>`min(${trechoDaTranscricao.inicio})`,
        texto: trechoDaTranscricao.texto,
      })
      .from(trechoDaTranscricao)
      .innerJoin(aula, eq(aula.vimeoId, trechoDaTranscricao.vimeoId))
      .innerJoin(modulo, eq(modulo.id, aula.moduloId))
      .where(
        and(
          isNull(aula.excluidoEm),
          entreOsIds(aula.id, aulaIds),
          ...palavras.map((p) =>
            like(
              trechoDaTranscricao.textoBusca,
              sql`${`%${escaparLike(p)}%`} escape '\\'`,
            ),
          ),
        ),
      )
      .groupBy(aula.id)
      .orderBy(asc(sql`min(${trechoDaTranscricao.inicio})`), asc(aula.id))
      .limit(limite ?? -1)
    return linhas.map((l) => ({
      tipo: 'transcricao' as const,
      cursoId: l.cursoId,
      moduloId: l.moduloId,
      aulaId: l.aulaId,
      texto: l.texto,
      tempo: l.inicio,
    }))
  }
}
