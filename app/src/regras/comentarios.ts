// Comentários nas aulas (#47): os alunos conversam com os colegas da mesma Turma e a Equipe modera.
//
// - Texto simples, resposta de um nível (resposta de resposta não existe).
// - Quem vê: os colegas que dividem uma Turma do curso com quem lê, e a Equipe (que também vê tudo).
//   Comentário de quem é da Equipe aparece para todos os alunos do curso, com o selo "Equipe".
// - O autor edita e exclui o que é dele; a Equipe fixa, edita, exclui qualquer um e desliga os
//   comentários de uma aula ou de um módulo inteiro (quem é aluno deixa de ver e de comentar).
// - Exclusão protegida (`excluidoEm`, 30 dias). Excluir um comentário leva as respostas junto.
// - Criar leva uma chave de envio: o mesmo formulário enviado duas vezes vira um comentário só.
// - Responder avisa o autor no sininho e põe um aviso no agrupamento de 15 minutos, que vira UM
//   e-mail "Resposta ao comentário" (`agruparRespostasEmEmail`, registrado em `src/lib/avisos-cola.ts`).
//
// Pontos (#54), por `Ganchos` passados por quem chama (nada de registro global):
// - `aoComentarPelaPrimeiraVezNaAula`: o autor não tinha outro comentário vivo na aula (25 pontos).
// - `aoExcluirComentario`: a origem sumiu e os pontos saem; leva quantos comentários vivos o autor
//   ainda tem na aula, para só estornar quando não restar nenhum.

import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  inArray,
  isNull,
  lt,
  ne,
  or,
  type SQL,
  sql,
} from 'drizzle-orm'
import {
  aula,
  comentarioDaAula,
  comentariosDesligados,
  matricula,
  modulo,
  turma,
  user,
} from '#/db/schema'
import type { GrupoDeAvisos } from '#/regras/agrupamento'
import { adicionarAviso } from '#/regras/agrupamento'
import type { DependenciasDosAvisos } from '#/regras/avisos-agendados'
import { primeiroNome } from '#/regras/email-modelos'
import { notificar } from '#/regras/notificacoes'
import { POR_PAGINA } from '#/regras/paginacao'
import { ehEquipe, exigirPermissao, type Pessoa } from '#/regras/permissoes'
import { type Banco, comoLibsql, type Relogio } from '#/regras/tipos'

export class ErroDeComentario extends Error {
  constructor(mensagem: string) {
    super(mensagem)
    this.name = 'ErroDeComentario'
  }
}

export const LIMITE_DO_TEXTO = 2000
/** Comentários (de primeiro nível) por página. */
export { POR_PAGINA }

const RESUMO_NO_AVISO = 140

export const PREFIXO_DA_RESPOSTA = 'resposta-ao-comentario'

export interface ContextoDeComentario {
  db: Banco
  agora: Relogio
  userId: string
  aulaId: string
  comentarioId: string
}

export interface ContextoDeExclusao extends ContextoDeComentario {
  /** Comentários vivos que o autor ainda tem nesta aula, depois da exclusão. */
  restantesDoAutorNaAula: number
}

export interface Ganchos {
  aoComentarPelaPrimeiraVezNaAula?: (
    contexto: ContextoDeComentario,
  ) => Promise<void>
  aoExcluirComentario?: (contexto: ContextoDeExclusao) => Promise<void>
}

// ---------- Onde a aula está ----------

interface LugarDaAula {
  aulaId: string
  aulaTitulo: string
  moduloId: string
  cursoId: string
}

async function lugarDaAula(
  db: Banco,
  aulaId: string,
): Promise<LugarDaAula | null> {
  const [linha] = await comoLibsql(db)
    .select({
      aulaId: aula.id,
      aulaTitulo: aula.titulo,
      moduloId: modulo.id,
      cursoId: modulo.cursoId,
    })
    .from(aula)
    .innerJoin(modulo, eq(modulo.id, aula.moduloId))
    .where(
      and(
        eq(aula.id, aulaId),
        isNull(aula.excluidoEm),
        isNull(modulo.excluidoEm),
      ),
    )
  return linha ?? null
}

async function lugarOuErro(db: Banco, aulaId: string) {
  const lugar = await lugarDaAula(db, aulaId)
  if (!lugar) throw new ErroDeComentario('Aula não encontrada.')
  return lugar
}

// ---------- Ligar e desligar ----------

export interface SituacaoDosComentarios {
  /** Os comentários desta aula estão ligados (nem a aula nem o módulo foram desligados). */
  ligados: boolean
  desligadosNaAula: boolean
  desligadosNoModulo: boolean
}

async function situacaoDosComentarios(
  db: Banco,
  lugar: LugarDaAula,
): Promise<SituacaoDosComentarios> {
  const linhas = await comoLibsql(db)
    .select({
      tipo: comentariosDesligados.alvoTipo,
      id: comentariosDesligados.alvoId,
    })
    .from(comentariosDesligados)
    .where(
      or(
        and(
          eq(comentariosDesligados.alvoTipo, 'aula'),
          eq(comentariosDesligados.alvoId, lugar.aulaId),
        ),
        and(
          eq(comentariosDesligados.alvoTipo, 'modulo'),
          eq(comentariosDesligados.alvoId, lugar.moduloId),
        ),
      ),
    )
  const desligadosNaAula = linhas.some((l) => l.tipo === 'aula')
  const desligadosNoModulo = linhas.some((l) => l.tipo === 'modulo')
  return {
    ligados: !desligadosNaAula && !desligadosNoModulo,
    desligadosNaAula,
    desligadosNoModulo,
  }
}

/** A Equipe liga ou desliga os comentários de uma aula ou de um módulo inteiro. */
export async function alterarComentarios(
  db: Banco,
  agora: Relogio,
  ator: Pessoa,
  alvo: { tipo: 'aula' | 'modulo'; id: string },
  ligados: boolean,
): Promise<void> {
  exigirPermissao(ator.perfil, 'usar-estudio')
  const conexao = comoLibsql(db)
  const [existe] =
    alvo.tipo === 'aula'
      ? await conexao
          .select({ id: aula.id })
          .from(aula)
          .where(and(eq(aula.id, alvo.id), isNull(aula.excluidoEm)))
      : await conexao
          .select({ id: modulo.id })
          .from(modulo)
          .where(and(eq(modulo.id, alvo.id), isNull(modulo.excluidoEm)))
  if (!existe) {
    throw new ErroDeComentario(
      alvo.tipo === 'aula' ? 'Aula não encontrada.' : 'Módulo não encontrado.',
    )
  }
  if (ligados) {
    await conexao
      .delete(comentariosDesligados)
      .where(
        and(
          eq(comentariosDesligados.alvoTipo, alvo.tipo),
          eq(comentariosDesligados.alvoId, alvo.id),
        ),
      )
    return
  }
  await conexao
    .insert(comentariosDesligados)
    .values({
      alvoTipo: alvo.tipo,
      alvoId: alvo.id,
      autorId: ator.id,
      desligadoEm: agora(),
    })
    .onConflictDoNothing()
}

// ---------- Quem vê ----------

// Aluno vê: os próprios comentários, os da Equipe e os de quem divide com ele uma Turma do curso.
// A Equipe vê tudo (nenhum filtro).
function filtroDeVisibilidade(
  db: Banco,
  ator: Pessoa,
  cursoId: string,
): SQL | undefined {
  if (ehEquipe(ator)) return undefined
  const conexao = comoLibsql(db)
  const turmasDele = conexao
    .select({ id: turma.id })
    .from(matricula)
    .innerJoin(turma, eq(turma.id, matricula.turmaId))
    .where(and(eq(matricula.userId, ator.id), eq(turma.cursoId, cursoId)))
  const colegas = conexao
    .select({ id: matricula.userId })
    .from(matricula)
    .where(inArray(matricula.turmaId, turmasDele))
  return or(
    eq(comentarioDaAula.userId, ator.id),
    ne(user.perfil, 'aluno'),
    inArray(comentarioDaAula.userId, colegas),
  )
}

// ---------- Ler ----------

export interface ComentarioDaLista {
  id: string
  paiId: string | null
  texto: string
  autorId: string
  autorNome: string
  /** Foto do autor (caminho da imagem); nula = sem foto. */
  autorImagem: string | null
  /** "Sobre você" do autor, para o cartão de perfil. */
  autorBio: string | null
  /** O autor é da Equipe: a tela mostra o selo "Equipe". */
  autorEquipe: boolean
  /** O comentário é de quem está lendo. */
  seu: boolean
  fixado: boolean
  editado: boolean
  criadoEm: Date
  respostas: ComentarioDaLista[]
}

export interface ListaDeComentarios extends SituacaoDosComentarios {
  comentarios: ComentarioDaLista[]
  temMais: boolean
}

const colunasDaLista = {
  id: comentarioDaAula.id,
  paiId: comentarioDaAula.paiId,
  texto: comentarioDaAula.texto,
  autorId: comentarioDaAula.userId,
  autorNome: user.name,
  autorImagem: user.image,
  autorBio: user.bio,
  autorPerfil: user.perfil,
  fixadoEm: comentarioDaAula.fixadoEm,
  editadoEm: comentarioDaAula.editadoEm,
  criadoEm: comentarioDaAula.criadoEm,
}

type LinhaDaLista = {
  id: string
  paiId: string | null
  texto: string
  autorId: string
  autorNome: string
  autorImagem: string | null
  autorBio: string | null
  autorPerfil: string
  fixadoEm: Date | null
  editadoEm: Date | null
  criadoEm: Date
}

function paraLista(l: LinhaDaLista, leitor: Pessoa): ComentarioDaLista {
  return {
    id: l.id,
    paiId: l.paiId,
    texto: l.texto,
    autorId: l.autorId,
    autorNome: l.autorNome,
    autorImagem: l.autorImagem,
    autorBio: l.autorBio,
    autorEquipe: l.autorPerfil !== 'aluno',
    seu: l.autorId === leitor.id,
    fixado: l.fixadoEm !== null,
    editado: l.editadoEm !== null,
    criadoEm: l.criadoEm,
    respostas: [],
  }
}

/**
 * Os comentários da aula que `ator` pode ver, 20 por página: fixados primeiro, depois os mais
 * novos; as respostas de cada um do mais antigo para o mais novo. Comentários desligados: o aluno
 * recebe a lista vazia, a Equipe continua vendo (para moderar e religar).
 */
export async function listarComentarios(
  db: Banco,
  ator: Pessoa,
  aulaId: string,
  pagina = 1,
): Promise<ListaDeComentarios> {
  const lugar = await lugarOuErro(db, aulaId)
  const situacao = await situacaoDosComentarios(db, lugar)
  if (!situacao.ligados && !ehEquipe(ator)) {
    return { ...situacao, comentarios: [], temMais: false }
  }
  const conexao = comoLibsql(db)
  const visibilidade = filtroDeVisibilidade(db, ator, lugar.cursoId)
  const deslocamento = (Math.max(1, Math.floor(pagina)) - 1) * POR_PAGINA
  const principais = await conexao
    .select(colunasDaLista)
    .from(comentarioDaAula)
    .innerJoin(user, eq(user.id, comentarioDaAula.userId))
    .where(
      and(
        eq(comentarioDaAula.aulaId, aulaId),
        isNull(comentarioDaAula.excluidoEm),
        isNull(comentarioDaAula.paiId),
        visibilidade,
      ),
    )
    .orderBy(
      sql`${comentarioDaAula.fixadoEm} is null`,
      desc(comentarioDaAula.fixadoEm),
      desc(comentarioDaAula.criadoEm),
    )
    .limit(POR_PAGINA + 1)
    .offset(deslocamento)
  const temMais = principais.length > POR_PAGINA
  const daPagina = principais
    .slice(0, POR_PAGINA)
    .map((l) => paraLista(l, ator))
  if (daPagina.length > 0) {
    const respostas = await conexao
      .select(colunasDaLista)
      .from(comentarioDaAula)
      .innerJoin(user, eq(user.id, comentarioDaAula.userId))
      .where(
        and(
          inArray(
            comentarioDaAula.paiId,
            daPagina.map((c) => c.id),
          ),
          isNull(comentarioDaAula.excluidoEm),
          visibilidade,
        ),
      )
      .orderBy(asc(comentarioDaAula.criadoEm))
    for (const r of respostas) {
      daPagina.find((c) => c.id === r.paiId)?.respostas.push(paraLista(r, ator))
    }
  }
  return { ...situacao, comentarios: daPagina, temMais }
}

// ---------- Escrever ----------

function textoValido(bruto: string): string {
  const texto = bruto.trim()
  if (!texto) throw new ErroDeComentario('Escreva o comentário.')
  if (texto.length > LIMITE_DO_TEXTO) {
    throw new ErroDeComentario(`Escreva até ${LIMITE_DO_TEXTO} caracteres.`)
  }
  return texto
}

export interface EntradaDoComentario {
  aulaId: string
  texto: string
  /** Resposta a este comentário (de primeiro nível). */
  paiId?: string | null
  /** Gerada pela tela a cada formulário: o mesmo envio duas vezes cria um comentário só. */
  chaveDeEnvio: string
}

async function avisarResposta(
  db: Banco,
  agora: Relogio,
  lugar: LugarDaAula,
  autor: { id: string; nome: string },
  pai: { userId: string },
  texto: string,
) {
  if (pai.userId === autor.id) return
  try {
    await notificar(db, agora, {
      userId: pai.userId,
      tipo: 'resposta-ao-comentario',
      texto: `${autor.nome} respondeu o seu comentário em "${lugar.aulaTitulo}".`,
      link: `/aulas/${lugar.aulaId}`,
    })
  } catch (erro) {
    console.error('[comentarios] não criei o aviso do sininho', erro)
  }
  try {
    await adicionarAviso(db, agora, {
      chave: `${PREFIXO_DA_RESPOSTA}:${pai.userId}`,
      dados: {
        nome: autor.nome,
        texto: texto.slice(0, RESUMO_NO_AVISO),
        aulaId: lugar.aulaId,
        aulaTitulo: lugar.aulaTitulo,
      },
    })
  } catch (erro) {
    console.error('[comentarios] não agrupei o aviso do e-mail', erro)
  }
}

/** Cria o comentário (ou a resposta). Repetir a mesma `chaveDeEnvio` devolve o que já existe. */
export async function criarComentario(
  db: Banco,
  agora: Relogio,
  ator: Pessoa,
  entrada: EntradaDoComentario,
  ganchos: Ganchos = {},
): Promise<{ id: string; criado: boolean }> {
  const texto = textoValido(entrada.texto)
  const chave = entrada.chaveDeEnvio.trim()
  if (!chave) throw new ErroDeComentario('Falta a chave de envio.')
  const conexao = comoLibsql(db)
  const lugar = await lugarOuErro(db, entrada.aulaId)
  if (!(await situacaoDosComentarios(db, lugar)).ligados) {
    throw new ErroDeComentario('Os comentários desta aula estão desligados.')
  }

  const [repetido] = await conexao
    .select({ id: comentarioDaAula.id })
    .from(comentarioDaAula)
    .where(
      and(
        eq(comentarioDaAula.userId, ator.id),
        eq(comentarioDaAula.chaveDeEnvio, chave),
      ),
    )
  if (repetido) return { id: repetido.id, criado: false }

  let pai: { userId: string } | undefined
  if (entrada.paiId) {
    const [encontrado] = await conexao
      .select({
        id: comentarioDaAula.id,
        userId: comentarioDaAula.userId,
        paiId: comentarioDaAula.paiId,
      })
      .from(comentarioDaAula)
      .innerJoin(user, eq(user.id, comentarioDaAula.userId))
      .where(
        and(
          eq(comentarioDaAula.id, entrada.paiId),
          eq(comentarioDaAula.aulaId, entrada.aulaId),
          isNull(comentarioDaAula.excluidoEm),
          filtroDeVisibilidade(db, ator, lugar.cursoId),
        ),
      )
    if (!encontrado) throw new ErroDeComentario('Comentário não encontrado.')
    if (encontrado.paiId) {
      throw new ErroDeComentario(
        'Só dá para responder o comentário, não a resposta.',
      )
    }
    pai = encontrado
  }

  const id = crypto.randomUUID()
  const criada = await conexao
    .insert(comentarioDaAula)
    .values({
      id,
      aulaId: entrada.aulaId,
      userId: ator.id,
      paiId: pai ? (entrada.paiId ?? null) : null,
      texto,
      chaveDeEnvio: chave,
      criadoEm: agora(),
    })
    .onConflictDoNothing()
    .returning({ id: comentarioDaAula.id })
  if (criada.length === 0) {
    // Dois envios correram juntos e o outro chegou primeiro.
    const [existente] = await conexao
      .select({ id: comentarioDaAula.id })
      .from(comentarioDaAula)
      .where(
        and(
          eq(comentarioDaAula.userId, ator.id),
          eq(comentarioDaAula.chaveDeEnvio, chave),
        ),
      )
    return { id: existente?.id ?? id, criado: false }
  }

  if (pai) {
    const [autor] = await conexao
      .select({ nome: user.name })
      .from(user)
      .where(eq(user.id, ator.id))
    await avisarResposta(
      db,
      agora,
      lugar,
      { id: ator.id, nome: autor?.nome ?? 'Alguém' },
      pai,
      texto,
    )
  }

  const [{ outros }] = await conexao
    .select({ outros: count() })
    .from(comentarioDaAula)
    .where(
      and(
        eq(comentarioDaAula.userId, ator.id),
        eq(comentarioDaAula.aulaId, entrada.aulaId),
        isNull(comentarioDaAula.excluidoEm),
        ne(comentarioDaAula.id, id),
      ),
    )
  if (outros === 0) {
    await ganchos.aoComentarPelaPrimeiraVezNaAula?.({
      db,
      agora,
      userId: ator.id,
      aulaId: entrada.aulaId,
      comentarioId: id,
    })
  }
  return { id, criado: true }
}

async function comentarioVivo(db: Banco, id: string) {
  const [linha] = await comoLibsql(db)
    .select({
      id: comentarioDaAula.id,
      userId: comentarioDaAula.userId,
      aulaId: comentarioDaAula.aulaId,
      paiId: comentarioDaAula.paiId,
      texto: comentarioDaAula.texto,
    })
    .from(comentarioDaAula)
    .where(
      and(eq(comentarioDaAula.id, id), isNull(comentarioDaAula.excluidoEm)),
    )
  if (!linha) throw new ErroDeComentario('Comentário não encontrado.')
  return linha
}

/** A aula de um comentário (para a server function conferir o acesso ao curso antes de mexer). */
export async function aulaDoComentario(
  db: Banco,
  comentarioId: string,
): Promise<string> {
  return (await comentarioVivo(db, comentarioId)).aulaId
}

function exigirAutorOuEquipe(
  ator: Pessoa,
  comentario: { userId: string },
  acao: string,
) {
  if (comentario.userId !== ator.id && !ehEquipe(ator)) {
    throw new ErroDeComentario(`Você só pode ${acao} os seus comentários.`)
  }
}

/** O autor (ou a Equipe) edita o texto. Texto igual ao guardado não conta como edição. */
export async function editarComentario(
  db: Banco,
  agora: Relogio,
  ator: Pessoa,
  comentarioId: string,
  textoNovo: string,
): Promise<void> {
  const texto = textoValido(textoNovo)
  const comentario = await comentarioVivo(db, comentarioId)
  exigirAutorOuEquipe(ator, comentario, 'editar')
  if (texto === comentario.texto) return
  await comoLibsql(db)
    .update(comentarioDaAula)
    .set({ texto, editadoEm: agora() })
    .where(eq(comentarioDaAula.id, comentarioId))
}

/** A Equipe fixa (ou desafixa) um comentário no alto da lista; resposta não se fixa. */
export async function fixarComentario(
  db: Banco,
  agora: Relogio,
  ator: Pessoa,
  comentarioId: string,
  fixado: boolean,
): Promise<void> {
  exigirPermissao(ator.perfil, 'usar-estudio')
  const comentario = await comentarioVivo(db, comentarioId)
  if (comentario.paiId) {
    throw new ErroDeComentario(
      'Só dá para fixar um comentário, não uma resposta.',
    )
  }
  await comoLibsql(db)
    .update(comentarioDaAula)
    .set({ fixadoEm: fixado ? agora() : null })
    .where(eq(comentarioDaAula.id, comentarioId))
}

/**
 * O autor (ou a Equipe) exclui. Exclusão protegida: o comentário e as respostas dele ganham
 * `excluidoEm` e somem das telas; a limpeza diária apaga de vez depois de 30 dias.
 */
export async function excluirComentario(
  db: Banco,
  agora: Relogio,
  ator: Pessoa,
  comentarioId: string,
  ganchos: Ganchos = {},
): Promise<void> {
  const comentario = await comentarioVivo(db, comentarioId)
  exigirAutorOuEquipe(ator, comentario, 'excluir')
  const conexao = comoLibsql(db)
  const respostas = comentario.paiId
    ? []
    : await conexao
        .select({
          id: comentarioDaAula.id,
          userId: comentarioDaAula.userId,
        })
        .from(comentarioDaAula)
        .where(
          and(
            eq(comentarioDaAula.paiId, comentarioId),
            isNull(comentarioDaAula.excluidoEm),
          ),
        )
  await conexao
    .update(comentarioDaAula)
    .set({ excluidoEm: agora(), fixadoEm: null })
    .where(
      and(
        isNull(comentarioDaAula.excluidoEm),
        or(
          eq(comentarioDaAula.id, comentarioId),
          eq(comentarioDaAula.paiId, comentarioId),
        ),
      ),
    )
  if (!ganchos.aoExcluirComentario) return
  const excluidos = [
    { id: comentario.id, userId: comentario.userId },
    ...respostas,
  ]
  for (const { id, userId } of excluidos) {
    const [{ restantes }] = await conexao
      .select({ restantes: count() })
      .from(comentarioDaAula)
      .where(
        and(
          eq(comentarioDaAula.userId, userId),
          eq(comentarioDaAula.aulaId, comentario.aulaId),
          isNull(comentarioDaAula.excluidoEm),
        ),
      )
    await ganchos.aoExcluirComentario({
      db,
      agora,
      userId,
      aulaId: comentario.aulaId,
      comentarioId: id,
      restantesDoAutorNaAula: restantes,
    })
  }
}

// ---------- E-mail agrupado ----------

/**
 * Agrupador do e-mail "Resposta ao comentário": as respostas de 15 minutos a comentários da mesma
 * pessoa viram UM e-mail. Registrado com `registrarAgrupador(PREFIXO_DA_RESPOSTA, ...)`.
 */
export async function agruparRespostasEmEmail(
  grupo: GrupoDeAvisos,
  deps: DependenciasDosAvisos & { banco: Banco },
): Promise<void> {
  const userId = grupo.chave.slice(PREFIXO_DA_RESPOSTA.length + 1)
  const [aluno] = await comoLibsql(deps.banco)
    .select({ nome: user.name, email: user.email })
    .from(user)
    .where(eq(user.id, userId))
  // Conta excluída entre o aviso e o envio: não há para quem mandar.
  if (!aluno) return
  const linhas = grupo.avisos.map((a) => {
    const nome = typeof a.dados.nome === 'string' ? a.dados.nome : 'Alguém'
    const texto = typeof a.dados.texto === 'string' ? a.dados.texto : ''
    return `${nome}: ${texto}`
  })
  await deps.pedirEmail({
    tipo: 'resposta-ao-comentario',
    para: aluno.email,
    userId,
    variaveis: {
      nome: primeiroNome(aluno.nome),
      quantidade: String(grupo.avisos.length),
      respostas: linhas.join('\n'),
    },
  })
}

// ---------- Relatórios ----------

/**
 * Quantos comentários e respostas (não excluídos) foram feitos no período `[de, ate)`, de um curso
 * ou de todos. Plugável: o relatório Panorama (#62) chama esta função.
 */
export async function contarComentarios(
  db: Banco,
  periodo: { de: Date; ate: Date },
  cursoId?: string,
): Promise<number> {
  const [{ total }] = await comoLibsql(db)
    .select({ total: count() })
    .from(comentarioDaAula)
    .innerJoin(aula, eq(aula.id, comentarioDaAula.aulaId))
    .innerJoin(modulo, eq(modulo.id, aula.moduloId))
    .where(
      and(
        isNull(comentarioDaAula.excluidoEm),
        isNull(aula.excluidoEm),
        isNull(modulo.excluidoEm),
        gte(comentarioDaAula.criadoEm, periodo.de),
        lt(comentarioDaAula.criadoEm, periodo.ate),
        cursoId ? eq(modulo.cursoId, cursoId) : undefined,
      ),
    )
  return total
}

/**
 * Os comentários do período `[de, ate)` de TODOS os cursos de uma vez (curso -> total): o Panorama
 * usa isto em vez de uma contagem por curso. A soma dos valores é o total de `contarComentarios` sem
 * curso.
 */
export async function contarComentariosPorCurso(
  db: Banco,
  periodo: { de: Date; ate: Date },
): Promise<Map<string, number>> {
  const linhas = await comoLibsql(db)
    .select({ cursoId: modulo.cursoId, total: count() })
    .from(comentarioDaAula)
    .innerJoin(aula, eq(aula.id, comentarioDaAula.aulaId))
    .innerJoin(modulo, eq(modulo.id, aula.moduloId))
    .where(
      and(
        isNull(comentarioDaAula.excluidoEm),
        isNull(aula.excluidoEm),
        isNull(modulo.excluidoEm),
        gte(comentarioDaAula.criadoEm, periodo.de),
        lt(comentarioDaAula.criadoEm, periodo.ate),
      ),
    )
    .groupBy(modulo.cursoId)
  return new Map(linhas.map((l) => [l.cursoId, l.total]))
}

/** O módulo da aula (para ligar e desligar os comentários do módulo inteiro). */
export async function moduloDaAula(db: Banco, aulaId: string): Promise<string> {
  const [linha] = await comoLibsql(db)
    .select({ moduloId: aula.moduloId })
    .from(aula)
    .where(eq(aula.id, aulaId))
  if (!linha) throw new ErroDeComentario('Aula não encontrada.')
  return linha.moduloId
}
