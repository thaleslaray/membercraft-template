// Conteúdo da escola: categorias, cursos, módulos, aulas e materiais. Quem cadastra é a equipe;
// a leitura (vitrine, curso, aula) serve ao aluno e à equipe. Excluir é "excluir protegido":
// a linha ganha `excluidoEm` e some das consultas (ver `exclusao-protegida.ts`).

import {
  and,
  asc,
  eq,
  inArray,
  isNull,
  max,
  type SQLWrapper,
  sql,
} from 'drizzle-orm'
import { aula, categoria, curso, materialDaAula, modulo } from '#/db/schema'
import {
  LIMITE_DA_CARGA_HORARIA,
  LIMITE_DO_NOME,
  MENSAGEM_DA_CARGA_HORARIA,
} from '#/regras/formulario-do-curso'
import { limparHtml } from '#/regras/html-seguro'
import { type Banco, comoLibsql, type Relogio } from '#/regras/tipos'
import { interpretarVimeo } from '#/regras/vimeo'

export class ErroDeConteudo extends Error {
  constructor(mensagem: string) {
    super(mensagem)
    this.name = 'ErroDeConteudo'
  }
}

// D1 e libsql têm a mesma API de consulta; o tipo da união atrapalha seleções parciais e junções,
// então dentro deste módulo o banco é tratado como um só (nos testes é o libsql de fato).
const novoId = () => crypto.randomUUID()

function nomeObrigatorio(valor: string, rotulo: string): string {
  const limpo = valor.trim()
  if (!limpo) throw new ErroDeConteudo(`Informe o ${rotulo}.`)
  if (limpo.length > LIMITE_DO_NOME) {
    throw new ErroDeConteudo(
      `O ${rotulo} pode ter no máximo ${LIMITE_DO_NOME} caracteres.`,
    )
  }
  return limpo
}

function urlDeVendasValida(valor: string | null | undefined): string | null {
  const texto = (valor ?? '').trim()
  if (!texto) return null
  let url: URL
  try {
    url = new URL(texto)
  } catch {
    throw new ErroDeConteudo('A URL de vendas não é um endereço válido.')
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new ErroDeConteudo('A URL de vendas precisa começar com https://.')
  }
  return texto
}

// ---------- Categorias ----------

export async function criarCategoria(
  banco: Banco,
  entrada: { nome: string; origemMemberkit?: number },
): Promise<string> {
  const db = comoLibsql(banco)
  const nome = nomeObrigatorio(entrada.nome, 'nome da categoria')
  const [{ ultima }] = await db
    .select({ ultima: max(categoria.ordem) })
    .from(categoria)
    .where(isNull(categoria.excluidoEm))
  const id = novoId()
  await db.insert(categoria).values({
    id,
    nome,
    ordem: (ultima ?? 0) + 1,
    origemMemberkit: entrada.origemMemberkit ?? null,
  })
  return id
}

export async function editarCategoria(
  banco: Banco,
  id: string,
  entrada: { nome: string },
): Promise<void> {
  const db = comoLibsql(banco)
  const nome = nomeObrigatorio(entrada.nome, 'nome da categoria')
  await db
    .update(categoria)
    .set({ nome })
    .where(and(eq(categoria.id, id), isNull(categoria.excluidoEm)))
}

// Os cursos da categoria excluída ficam sem categoria; não somem.
export async function excluirCategoria(
  banco: Banco,
  agora: Relogio,
  id: string,
): Promise<void> {
  const db = comoLibsql(banco)
  await db.batch([
    db
      .update(curso)
      .set({ categoriaId: null })
      .where(eq(curso.categoriaId, id)),
    db
      .update(categoria)
      .set({ excluidoEm: agora() })
      .where(eq(categoria.id, id)),
  ])
}

// ---------- Cursos ----------

export interface DadosDoCurso {
  nome: string
  /** Só ao criar (importação da Memberkit, #40); editar não mexe nele. */
  origemMemberkit?: number
  descricao?: string
  categoriaId?: string | null
  cargaHoraria?: number | null
  capaHorizontal?: string | null
  capaVertical?: string | null
  imagemDestaque?: string | null
  mostrarATodos?: boolean
  urlDeVendas?: string | null
  /** Emitir o certificado deste curso abre um Pedido do MEC (#56). Omitido = não muda. */
  geraPedidoDoMec?: boolean
}

function valoresDoCurso(entrada: DadosDoCurso) {
  const cargaHoraria = entrada.cargaHoraria ?? null
  if (
    cargaHoraria !== null &&
    (!Number.isInteger(cargaHoraria) ||
      cargaHoraria < 0 ||
      cargaHoraria > LIMITE_DA_CARGA_HORARIA)
  ) {
    throw new ErroDeConteudo(MENSAGEM_DA_CARGA_HORARIA)
  }
  const urlDeVendas = urlDeVendasValida(entrada.urlDeVendas)
  const mostrarATodos = entrada.mostrarATodos ?? false
  if (mostrarATodos && !urlDeVendas) {
    throw new ErroDeConteudo(
      'Para mostrar o curso a todos, informe a URL da página de vendas.',
    )
  }
  return {
    nome: nomeObrigatorio(entrada.nome, 'nome do curso'),
    descricao: (entrada.descricao ?? '').trim(),
    categoriaId: entrada.categoriaId || null,
    cargaHoraria,
    capaHorizontal: entrada.capaHorizontal || null,
    capaVertical: entrada.capaVertical || null,
    imagemDestaque: entrada.imagemDestaque || null,
    mostrarATodos,
    urlDeVendas,
    ...(entrada.geraPedidoDoMec === undefined
      ? {}
      : { geraPedidoDoMec: entrada.geraPedidoDoMec }),
  }
}

export async function criarCurso(
  banco: Banco,
  entrada: DadosDoCurso,
): Promise<string> {
  const db = comoLibsql(banco)
  const valores = valoresDoCurso(entrada)
  const [{ ultima }] = await db
    .select({ ultima: max(curso.ordem) })
    .from(curso)
    .where(isNull(curso.excluidoEm))
  const id = novoId()
  await db.insert(curso).values({
    id,
    ...valores,
    ordem: (ultima ?? 0) + 1,
    origemMemberkit: entrada.origemMemberkit ?? null,
  })
  return id
}

export async function editarCurso(
  banco: Banco,
  id: string,
  entrada: DadosDoCurso,
): Promise<void> {
  const db = comoLibsql(banco)
  await db
    .update(curso)
    .set(valoresDoCurso(entrada))
    .where(and(eq(curso.id, id), isNull(curso.excluidoEm)))
}

// Excluir o curso leva junto os módulos, as aulas e os materiais, todos com a mesma data.
export async function excluirCurso(
  banco: Banco,
  agora: Relogio,
  id: string,
): Promise<void> {
  const db = comoLibsql(banco)
  const quando = agora()
  const modulos = db
    .select({ id: modulo.id })
    .from(modulo)
    .where(eq(modulo.cursoId, id))
  const aulas = db
    .select({ id: aula.id })
    .from(aula)
    .where(inArray(aula.moduloId, modulos))
  await db.batch([
    db
      .update(materialDaAula)
      .set({ excluidoEm: quando })
      .where(
        and(
          inArray(materialDaAula.aulaId, aulas),
          isNull(materialDaAula.excluidoEm),
        ),
      ),
    db
      .update(aula)
      .set({ excluidoEm: quando })
      .where(and(inArray(aula.moduloId, modulos), isNull(aula.excluidoEm))),
    db
      .update(modulo)
      .set({ excluidoEm: quando })
      .where(and(eq(modulo.cursoId, id), isNull(modulo.excluidoEm))),
    db
      .update(curso)
      .set({ excluidoEm: quando })
      .where(and(eq(curso.id, id), isNull(curso.excluidoEm))),
  ])
}

// ---------- Módulos ----------

export async function criarModulo(
  banco: Banco,
  cursoId: string,
  entrada: { nome: string; capa?: string | null; origemMemberkit?: number },
): Promise<string> {
  const db = comoLibsql(banco)
  const nome = nomeObrigatorio(entrada.nome, 'nome do módulo')
  const [{ ultima }] = await db
    .select({ ultima: max(modulo.ordem) })
    .from(modulo)
    .where(and(eq(modulo.cursoId, cursoId), isNull(modulo.excluidoEm)))
  const id = novoId()
  await db.insert(modulo).values({
    id,
    cursoId,
    nome,
    capa: entrada.capa || null,
    ordem: (ultima ?? 0) + 1,
    origemMemberkit: entrada.origemMemberkit ?? null,
  })
  return id
}

export async function editarModulo(
  banco: Banco,
  id: string,
  entrada: { nome: string; capa?: string | null },
): Promise<void> {
  const db = comoLibsql(banco)
  await db
    .update(modulo)
    .set({
      nome: nomeObrigatorio(entrada.nome, 'nome do módulo'),
      capa: entrada.capa || null,
    })
    .where(and(eq(modulo.id, id), isNull(modulo.excluidoEm)))
}

export async function excluirModulo(
  banco: Banco,
  agora: Relogio,
  id: string,
): Promise<void> {
  const db = comoLibsql(banco)
  const quando = agora()
  const aulas = db
    .select({ id: aula.id })
    .from(aula)
    .where(eq(aula.moduloId, id))
  await db.batch([
    db
      .update(materialDaAula)
      .set({ excluidoEm: quando })
      .where(
        and(
          inArray(materialDaAula.aulaId, aulas),
          isNull(materialDaAula.excluidoEm),
        ),
      ),
    db
      .update(aula)
      .set({ excluidoEm: quando })
      .where(and(eq(aula.moduloId, id), isNull(aula.excluidoEm))),
    db
      .update(modulo)
      .set({ excluidoEm: quando })
      .where(and(eq(modulo.id, id), isNull(modulo.excluidoEm))),
  ])
}

// ---------- Aulas ----------

export interface DadosDaAula {
  titulo: string
  /** Só ao criar (importação da Memberkit, #40); editar não mexe nele. */
  origemMemberkit?: number
  /** O que a equipe colou: id, URL do Vimeo ou iframe. Vazio = aula sem vídeo. */
  video?: string
  textoHtml?: string
  miniatura?: string | null
}

function valoresDaAula(entrada: DadosDaAula) {
  const texto = (entrada.video ?? '').trim()
  const video = texto ? interpretarVimeo(texto) : null
  if (texto && !video) {
    throw new ErroDeConteudo(
      'Não achei um vídeo do Vimeo nesse texto. Cole o link ou o número do vídeo.',
    )
  }
  return {
    titulo: nomeObrigatorio(entrada.titulo, 'título da aula'),
    vimeoId: video?.id ?? null,
    vimeoHash: video?.hash ?? null,
    textoHtml: limparHtml(entrada.textoHtml ?? '', { embeds: true }),
    miniatura: entrada.miniatura || null,
  }
}

export async function criarAula(
  banco: Banco,
  moduloId: string,
  entrada: DadosDaAula,
): Promise<string> {
  const db = comoLibsql(banco)
  const valores = valoresDaAula(entrada)
  const [{ ultima }] = await db
    .select({ ultima: max(aula.ordem) })
    .from(aula)
    .where(and(eq(aula.moduloId, moduloId), isNull(aula.excluidoEm)))
  const id = novoId()
  await db.insert(aula).values({
    id,
    moduloId,
    ...valores,
    ordem: (ultima ?? 0) + 1,
    origemMemberkit: entrada.origemMemberkit ?? null,
  })
  return id
}

export async function editarAula(
  banco: Banco,
  id: string,
  entrada: DadosDaAula,
): Promise<void> {
  const db = comoLibsql(banco)
  await db
    .update(aula)
    .set(valoresDaAula(entrada))
    .where(and(eq(aula.id, id), isNull(aula.excluidoEm)))
}

export async function excluirAula(
  banco: Banco,
  agora: Relogio,
  id: string,
): Promise<void> {
  const db = comoLibsql(banco)
  const quando = agora()
  await db.batch([
    db
      .update(materialDaAula)
      .set({ excluidoEm: quando })
      .where(
        and(eq(materialDaAula.aulaId, id), isNull(materialDaAula.excluidoEm)),
      ),
    db
      .update(aula)
      .set({ excluidoEm: quando })
      .where(and(eq(aula.id, id), isNull(aula.excluidoEm))),
  ])
}

// ---------- Materiais ----------

export async function anexarMaterial(
  banco: Banco,
  aulaId: string,
  entrada: {
    nome: string
    chave: string
    tipo: string
    tamanho: number
    origemMemberkit?: number
  },
): Promise<string> {
  const db = comoLibsql(banco)
  const [{ ultima }] = await db
    .select({ ultima: max(materialDaAula.ordem) })
    .from(materialDaAula)
    .where(
      and(eq(materialDaAula.aulaId, aulaId), isNull(materialDaAula.excluidoEm)),
    )
  const id = novoId()
  await db.insert(materialDaAula).values({
    id,
    aulaId,
    nome: nomeObrigatorio(entrada.nome, 'nome do material'),
    chave: entrada.chave,
    tipo: entrada.tipo || 'application/octet-stream',
    tamanho: entrada.tamanho,
    ordem: (ultima ?? 0) + 1,
    origemMemberkit: entrada.origemMemberkit ?? null,
  })
  return id
}

export async function excluirMaterial(
  banco: Banco,
  agora: Relogio,
  id: string,
): Promise<void> {
  const db = comoLibsql(banco)
  await db
    .update(materialDaAula)
    .set({ excluidoEm: agora() })
    .where(and(eq(materialDaAula.id, id), isNull(materialDaAula.excluidoEm)))
}

// ---------- Ordem ----------

export type Ordenavel = 'categoria' | 'curso' | 'modulo' | 'aula' | 'material'

const TABELAS_ORDENAVEIS = {
  categoria,
  curso,
  modulo,
  aula,
  material: materialDaAula,
} as const

// `ids` é a nova ordem completa de um grupo de irmãos (por exemplo, os módulos de um curso).
// Rejeita ids que não existam ou que não sejam irmãos, para um pedido torto não bagunçar outro curso.
export async function reordenar(
  banco: Banco,
  entidade: Ordenavel,
  ids: string[],
): Promise<void> {
  const db = comoLibsql(banco)
  if (new Set(ids).size !== ids.length) {
    throw new ErroDeConteudo('A ordem tem itens repetidos.')
  }
  if (ids.length === 0) return
  const tabela = TABELAS_ORDENAVEIS[entidade]
  const linhas = await db
    .select()
    .from(tabela)
    .where(and(inArray(tabela.id, ids), isNull(tabela.excluidoEm)))
  if (linhas.length !== ids.length) {
    throw new ErroDeConteudo('Há itens que não existem mais na ordem enviada.')
  }
  const pais = new Set(
    linhas.map((l) => {
      const linha = l as Record<string, unknown>
      return (
        linha.categoriaId ??
        linha.cursoId ??
        linha.moduloId ??
        linha.aulaId ??
        ''
      )
    }),
  )
  // Cursos agrupam por categoria na vitrine, mas a ordem deles é uma só: não exige irmandade.
  if (entidade !== 'curso' && pais.size > 1) {
    throw new ErroDeConteudo('Só dá para ordenar itens do mesmo grupo.')
  }
  // Todas as tabelas ordenáveis têm `id` e `ordem`; o tipo de uma serve para o lote.
  const t = tabela as typeof categoria
  const comandos = ids.map((id, i) =>
    db
      .update(t)
      .set({ ordem: i + 1 })
      .where(eq(t.id, id)),
  )
  await db.batch(comandos as [(typeof comandos)[number], ...typeof comandos])
}

// ---------- Leitura ----------

type Curso = typeof curso.$inferSelect
type Modulo = typeof modulo.$inferSelect
type Aula = typeof aula.$inferSelect
type Material = typeof materialDaAula.$inferSelect
type Categoria = typeof categoria.$inferSelect

const porOrdem = <T extends { ordem: number }>(a: T, b: T) => a.ordem - b.ordem

export async function listarCategorias(db: Banco): Promise<Categoria[]> {
  return db
    .select()
    .from(categoria)
    .where(isNull(categoria.excluidoEm))
    .orderBy(asc(categoria.ordem))
}

export async function listarCursos(db: Banco): Promise<Curso[]> {
  return db
    .select()
    .from(curso)
    .where(isNull(curso.excluidoEm))
    .orderBy(asc(curso.ordem))
}

export interface VitrineCurso extends Curso {
  totalDeAulas: number
  /** O aluno não tem o curso: aparece com cadeado e leva à página de vendas. */
  bloqueado: boolean
  /** Bloqueado porque a matrícula expirou (cadeado "acesso expirado"), não por falta de matrícula. */
  expirado: boolean
}
export interface GrupoDaVitrine {
  categoria: { id: string; nome: string } | null
  cursos: VitrineCurso[]
}

// Cursos agrupados por categoria. `cursosPermitidos` é o que o aluno acessa ("todos" para a equipe);
// o resto só entra se estiver marcado "mostrar a todos" ou se a matrícula expirou (e vem com
// `bloqueado`, para o cadeado).
// O que a vitrine lê do banco, sem depender de quem olha (por isso pode ir junto com a leitura do
// acesso da pessoa, em vez de esperar por ela).
export async function carregarDadosDaVitrine(banco: Banco) {
  const db = comoLibsql(banco)
  const [categorias, cursos, aulas] = await Promise.all([
    listarCategorias(db),
    listarCursos(db),
    db
      .select({ cursoId: modulo.cursoId, aulaId: aula.id })
      .from(aula)
      .innerJoin(modulo, eq(modulo.id, aula.moduloId))
      .where(and(isNull(aula.excluidoEm), isNull(modulo.excluidoEm))),
  ])
  return { categorias, cursos, aulas }
}

export async function montarVitrine(
  banco: Banco,
  cursosPermitidos: string[] | 'todos',
  cursosExpirados: string[] = [],
): Promise<GrupoDaVitrine[]> {
  return agruparVitrine(
    await carregarDadosDaVitrine(banco),
    cursosPermitidos,
    cursosExpirados,
  )
}

export function agruparVitrine(
  {
    categorias,
    cursos,
    aulas,
  }: Awaited<ReturnType<typeof carregarDadosDaVitrine>>,
  cursosPermitidos: string[] | 'todos',
  cursosExpirados: string[] = [],
): GrupoDaVitrine[] {
  const totais = new Map<string, number>()
  for (const a of aulas) totais.set(a.cursoId, (totais.get(a.cursoId) ?? 0) + 1)

  const visiveis = cursos
    .map((c) => ({
      ...c,
      totalDeAulas: totais.get(c.id) ?? 0,
      bloqueado:
        cursosPermitidos !== 'todos' && !cursosPermitidos.includes(c.id),
      expirado: cursosExpirados.includes(c.id),
    }))
    // O curso de acesso expirado aparece sempre (o aluno já o teve); os outros, só se "para todos".
    .filter((c) => !c.bloqueado || c.mostrarATodos || c.expirado)

  const grupos: GrupoDaVitrine[] = categorias.map((cat) => ({
    categoria: { id: cat.id, nome: cat.nome },
    cursos: visiveis.filter((c) => c.categoriaId === cat.id),
  }))
  const semCategoria = visiveis.filter(
    (c) =>
      !c.categoriaId || !categorias.some((cat) => cat.id === c.categoriaId),
  )
  if (semCategoria.length)
    grupos.push({ categoria: null, cursos: semCategoria })
  return grupos.filter((g) => g.cursos.length > 0)
}

export interface CursoCompleto {
  curso: Curso
  modulos: (Modulo & { aulas: Aula[] })[]
}

export async function obterCurso(
  banco: Banco,
  cursoId: string,
): Promise<CursoCompleto | null> {
  const db = comoLibsql(banco)
  // Curso, módulos e aulas saem numa ida só (`batch`): as aulas pedem "os módulos deste curso" por
  // subconsulta, em vez de esperar a lista de módulos chegar (eram duas idas em fila, e a lista de ids
  // estourava os 100 parâmetros do D1 num curso com muitos módulos).
  const modulosDoCurso = db
    .select({ id: modulo.id })
    .from(modulo)
    .where(and(eq(modulo.cursoId, cursoId), isNull(modulo.excluidoEm)))
  const [[encontrado], modulosAchados, aulas] = await db.batch([
    db
      .select()
      .from(curso)
      .where(and(eq(curso.id, cursoId), isNull(curso.excluidoEm))),
    db
      .select()
      .from(modulo)
      .where(and(eq(modulo.cursoId, cursoId), isNull(modulo.excluidoEm))),
    db
      .select()
      .from(aula)
      .where(
        and(inArray(aula.moduloId, modulosDoCurso), isNull(aula.excluidoEm)),
      ),
  ])
  if (!encontrado) return null
  const modulos = modulosAchados.sort(porOrdem)
  return {
    curso: encontrado,
    modulos: modulos.map((m) => ({
      ...m,
      aulas: aulas.filter((a) => a.moduloId === m.id).sort(porOrdem),
    })),
  }
}

/** O que o índice do curso (módulos e aulas ao lado da aula, lista da página do curso) lê: nada de texto nem vídeo. */
export interface AulaDoIndice {
  id: string
  titulo: string
  miniatura: string | null
  /** Só diz se há vídeo (o ícone da lista); o id e o hash do Vimeo ficam no servidor. */
  temVideo: boolean
  ordem: number
  moduloId: string
}
export interface ModuloDoIndice {
  id: string
  nome: string
  capa: string | null
  ordem: number
  aulas: AulaDoIndice[]
}
export interface IndiceDoCurso {
  curso: Curso
  modulos: ModuloDoIndice[]
}

// As três consultas do índice (curso, módulos, aulas), prontas para irem juntas num `batch`. `cursoIds` é
// o id do curso ou uma subconsulta que o devolve (a aula aberta ainda não sabe o curso dela): assim as
// aulas pedem "os módulos deste curso" por subconsulta, sem esperar a lista de módulos chegar.
function consultasDoIndice(
  db: ReturnType<typeof comoLibsql>,
  cursoIds: string[] | SQLWrapper,
) {
  const modulosDoCurso = db
    .select({ id: modulo.id })
    .from(modulo)
    .where(and(inArray(modulo.cursoId, cursoIds), isNull(modulo.excluidoEm)))
  return {
    curso: db
      .select()
      .from(curso)
      .where(and(inArray(curso.id, cursoIds), isNull(curso.excluidoEm))),
    modulos: db
      .select({
        id: modulo.id,
        nome: modulo.nome,
        capa: modulo.capa,
        ordem: modulo.ordem,
      })
      .from(modulo)
      .where(and(inArray(modulo.cursoId, cursoIds), isNull(modulo.excluidoEm))),
    aulas: db
      .select({
        id: aula.id,
        titulo: aula.titulo,
        miniatura: aula.miniatura,
        temVideo:
          sql<boolean>`(${aula.vimeoId} is not null and ${aula.vimeoId} != '')`.mapWith(
            Boolean,
          ),
        ordem: aula.ordem,
        moduloId: aula.moduloId,
      })
      .from(aula)
      .where(
        and(inArray(aula.moduloId, modulosDoCurso), isNull(aula.excluidoEm)),
      ),
  }
}

function montarIndice(
  encontrado: Curso | undefined,
  modulosDoCurso: Omit<ModuloDoIndice, 'aulas'>[],
  aulas: AulaDoIndice[],
): IndiceDoCurso | null {
  if (!encontrado) return null
  const modulos = [...modulosDoCurso].sort(porOrdem)
  return {
    curso: encontrado,
    modulos: modulos.map((m) => ({
      ...m,
      aulas: aulas.filter((a) => a.moduloId === m.id).sort(porOrdem),
    })),
  }
}

// Como `obterCurso`, mas seleciona só as colunas do índice: lê menos do D1 e não manda texto, vídeo
// nem hash de aula nenhuma (a aula aberta traz os campos dela à parte). Uma ida só.
export async function obterIndiceDoCurso(
  banco: Banco,
  cursoId: string,
): Promise<IndiceDoCurso | null> {
  const db = comoLibsql(banco)
  const q = consultasDoIndice(db, [cursoId])
  const [[encontrado], modulosDoCurso, aulas] = await db.batch([
    q.curso,
    q.modulos,
    q.aulas,
  ])
  return montarIndice(encontrado, modulosDoCurso, aulas)
}

export interface AulaCompleta {
  aula: Aula
  modulo: Modulo
  curso: Curso
  materiais: Material[]
  /** Aulas do curso na ordem em que o aluno as segue (módulo, depois aula). */
  sequencia: { id: string; titulo: string; moduloId: string }[]
  anterior: { id: string; titulo: string } | null
  proxima: { id: string; titulo: string } | null
  modulos: ModuloDoIndice[]
}

export async function obterAula(
  banco: Banco,
  aulaId: string,
): Promise<AulaCompleta | null> {
  const db = comoLibsql(banco)
  // Duas rodadas em paralelo (nada espera por nada): a aula com o módulo (um JOIN) e, num `batch`, os
  // materiais e o índice do curso. O curso da aula entra por subconsulta (ainda não se sabe qual é), em
  // vez de esperar a aula chegar. A aula com o módulo fica FORA do `batch`: no D1 o lote devolve as
  // linhas como objeto, e as colunas de mesmo nome das duas tabelas (`id`, `ordem`...) se fundiriam
  // (veja `conferirColunas` em src/test/banco.ts).
  const naoExcluidos = and(
    eq(aula.id, aulaId),
    isNull(aula.excluidoEm),
    isNull(modulo.excluidoEm),
  )
  const cursoDaAula = db
    .select({ id: modulo.cursoId })
    .from(aula)
    .innerJoin(modulo, eq(modulo.id, aula.moduloId))
    .where(naoExcluidos)
  const indice = consultasDoIndice(db, cursoDaAula)
  const [
    [achada],
    [materiaisDaAula, [cursoAchado], modulosDoCurso, aulasDoCurso],
  ] = await Promise.all([
    db
      .select({ aula, modulo })
      .from(aula)
      .innerJoin(modulo, eq(modulo.id, aula.moduloId))
      .where(naoExcluidos),
    db.batch([
      db
        .select()
        .from(materialDaAula)
        .where(
          and(
            eq(materialDaAula.aulaId, aulaId),
            isNull(materialDaAula.excluidoEm),
          ),
        ),
      indice.curso,
      indice.modulos,
      indice.aulas,
    ]),
  ])
  if (!achada) return null
  const { aula: encontrada, modulo: mod } = achada
  const completo = montarIndice(cursoAchado, modulosDoCurso, aulasDoCurso)
  if (!completo) return null
  const materiais = materiaisDaAula.sort(porOrdem)
  const sequencia = completo.modulos.flatMap((m) =>
    m.aulas.map((a) => ({ id: a.id, titulo: a.titulo, moduloId: m.id })),
  )
  const i = sequencia.findIndex((a) => a.id === aulaId)
  return {
    aula: encontrada,
    modulo: mod,
    curso: completo.curso,
    materiais,
    sequencia,
    anterior: i > 0 ? sequencia[i - 1] : null,
    proxima: i >= 0 && i < sequencia.length - 1 ? sequencia[i + 1] : null,
    modulos: completo.modulos,
  }
}

// Para a rota de download: de qual curso é o material (para conferir o acesso).
export async function materialComCurso(
  banco: Banco,
  materialId: string,
): Promise<{ material: Material; cursoId: string } | null> {
  const db = comoLibsql(banco)
  const [linha] = await db
    .select({ material: materialDaAula, cursoId: modulo.cursoId })
    .from(materialDaAula)
    .innerJoin(aula, eq(aula.id, materialDaAula.aulaId))
    .innerJoin(modulo, eq(modulo.id, aula.moduloId))
    .innerJoin(curso, eq(curso.id, modulo.cursoId))
    .where(
      and(
        eq(materialDaAula.id, materialId),
        isNull(materialDaAula.excluidoEm),
        isNull(aula.excluidoEm),
        isNull(modulo.excluidoEm),
        isNull(curso.excluidoEm),
      ),
    )
  return linha ?? null
}
