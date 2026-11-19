// Publicações e comentários das comunidades (#59): publicar, comentar num nível, melhor resposta
// (Resolvida), seguir e silenciar, não lidas, listas com filtros e busca, fila "Aguardando
// resposta" da Equipe e moderação (fixar, bloquear comentários, editar e excluir qualquer coisa).
//
// Todas as funções recebem o banco, o relógio e a pessoa (`{ id, perfil }`) e conferem o acesso à
// comunidade: quem não enxerga uma publicação recebe "não encontrada", igual a uma que não existe.
// Pontos (#54): `Ganchos` é o ponto de encaixe de `aoEscolherMelhorResposta` e
// `aoDesfazerMelhorResposta`, passados por quem chama (nada de registro global).

import {
  and,
  count,
  desc,
  eq,
  gt,
  inArray,
  isNull,
  ne,
  or,
  sql,
} from 'drizzle-orm'
import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import { alias } from 'drizzle-orm/sqlite-core'
import type * as schema from '#/db/schema'
import {
  anexoDaPublicacao,
  comentarioDaPublicacao,
  comunidade,
  leituraDaPublicacao,
  publicacao,
  seguidorDaPublicacao,
  user,
} from '#/db/schema'
import {
  type AnexoEnviado,
  LIMITE_DO_TEXTO_DA_PUBLICACAO,
  limparTextoDaPublicacao,
  textoPuro,
  validarAnexos,
} from '#/regras/anexos-da-comunidade'
import {
  LIMITE_DO_COMENTARIO,
  LIMITE_DO_TITULO,
  POR_PAGINA,
} from '#/regras/comunidade-constantes'
import {
  type ComunidadeDaLista,
  comunidadesVisiveis,
  comunidadeVisivel,
  ErroDeComunidade,
  podePublicar,
  quemEnxerga,
} from '#/regras/comunidades'
import { emLotes, emPedacos, entreOsIds } from '#/regras/lotes'
import { notificarVarios } from '#/regras/notificacoes'
import { ehEquipe, type Pessoa } from '#/regras/permissoes'
import { type Banco, comoLibsql, type Relogio } from '#/regras/tipos'

// biome-ignore lint/suspicious/noExplicitAny: comandos do Drizzle de tipos variados, só passam ao batch
type Comando = any
const emLote = (db: LibSQLDatabase<typeof schema>, comandos: Comando[]) =>
  db.batch(comandos as unknown as [Comando, ...Comando[]])

export { LIMITE_DO_COMENTARIO, LIMITE_DO_TITULO, POR_PAGINA }

export interface ContextoDaMelhorResposta {
  db: Banco
  agora: Relogio
  publicacaoId: string
  comentarioId: string
  autorDaResposta: string
  autorDaPublicacao: string
}

export interface Ganchos {
  /** Depois de marcar uma melhor resposta (os pontos entram aqui, #54). */
  aoEscolherMelhorResposta?: (c: ContextoDaMelhorResposta) => Promise<void>
  /** Depois de desmarcar, trocar ou excluir a melhor resposta (os pontos saem aqui). */
  aoDesfazerMelhorResposta?: (c: ContextoDaMelhorResposta) => Promise<void>
  /**
   * Os mesmos pontos, como comandos para entrar no `db.batch` de quem exclui: a publicação e o estorno
   * saem juntos. Quem não declara isto cai em `aoDesfazerMelhorResposta`, logo depois.
   */
  comandosParaDesfazerMelhorResposta?: (
    c: ContextoDaMelhorResposta,
  ) => Comando[]
}

const linkDaPublicacao = (id: string) => `/comunidades/publicacoes/${id}`

// ---------- Validações ----------

function chaveValida(chave: string): string {
  const limpa = chave.trim()
  if (limpa.length < 8 || limpa.length > 100) {
    throw new ErroDeComunidade('Chave de envio inválida. Recarregue a página.')
  }
  return limpa
}

function tituloValido(titulo: string): string {
  const limpo = titulo.trim()
  if (!limpo) throw new ErroDeComunidade('Escreva um título.')
  if (limpo.length > LIMITE_DO_TITULO) {
    throw new ErroDeComunidade(
      `O título pode ter no máximo ${LIMITE_DO_TITULO} caracteres.`,
    )
  }
  return limpo
}

function textoValido(html: string): string {
  const limpo = limparTextoDaPublicacao(html).trim()
  if (!textoPuro(limpo) && !limpo.includes('<img')) {
    throw new ErroDeComunidade('Escreva o texto da publicação.')
  }
  if (limpo.length > LIMITE_DO_TEXTO_DA_PUBLICACAO) {
    throw new ErroDeComunidade('O texto da publicação ficou grande demais.')
  }
  return limpo
}

function comentarioValido(texto: string): string {
  const limpo = texto.trim()
  if (!limpo) throw new ErroDeComunidade('Escreva o comentário.')
  if (limpo.length > LIMITE_DO_COMENTARIO) {
    throw new ErroDeComunidade(
      `O comentário pode ter no máximo ${LIMITE_DO_COMENTARIO} caracteres.`,
    )
  }
  return limpo
}

function exigirEquipe(pessoa: Pessoa) {
  if (!ehEquipe(pessoa)) {
    throw new ErroDeComunidade('Só a equipe pode fazer isso.')
  }
}

// ---------- Acesso ----------

type LinhaDaPublicacao = typeof publicacao.$inferSelect

async function publicacaoVisivel(
  db: Banco,
  agora: Relogio,
  pessoa: Pessoa,
  publicacaoId: string,
): Promise<{ pub: LinhaDaPublicacao; comunidade: ComunidadeDaLista }> {
  const [pub] = await comoLibsql(db)
    .select()
    .from(publicacao)
    .where(and(eq(publicacao.id, publicacaoId), isNull(publicacao.excluidoEm)))
  const achada = pub
    ? await comunidadeVisivel(db, agora, pessoa, pub.comunidadeId)
    : null
  if (!pub || !achada) {
    throw new ErroDeComunidade('Publicação não encontrada.')
  }
  return { pub, comunidade: achada }
}

const podeMexer = (pessoa: Pessoa, autorId: string) =>
  pessoa.id === autorId || ehEquipe(pessoa)

// ---------- Publicar, editar, excluir ----------

export interface EntradaDaPublicacao {
  comunidadeId: string
  titulo: string
  textoHtml: string
  anexos: AnexoEnviado[]
  /** Gerada pela tela ao abrir o formulário: o clique duplo cai na mesma publicação. */
  chaveDeEnvio: string
}

async function publicacaoDaChave(db: Banco, autorId: string, chave: string) {
  const [achada] = await comoLibsql(db)
    .select({ id: publicacao.id })
    .from(publicacao)
    .where(
      and(eq(publicacao.autorId, autorId), eq(publicacao.chaveDeEnvio, chave)),
    )
  return achada?.id ?? null
}

export async function criarPublicacao(
  db: Banco,
  agora: Relogio,
  pessoa: Pessoa,
  entrada: EntradaDaPublicacao,
): Promise<{ id: string; repetida: boolean }> {
  const chave = chaveValida(entrada.chaveDeEnvio)
  const jaExiste = await publicacaoDaChave(db, pessoa.id, chave)
  if (jaExiste) return { id: jaExiste, repetida: true }

  const alvo = await comunidadeVisivel(db, agora, pessoa, entrada.comunidadeId)
  if (!alvo) throw new ErroDeComunidade('Comunidade não encontrada.')
  if (!podePublicar(pessoa, alvo)) {
    throw new ErroDeComunidade('Nesta comunidade só a equipe publica.')
  }
  const titulo = tituloValido(entrada.titulo)
  const textoHtml = textoValido(entrada.textoHtml)
  const anexos = validarAnexos(pessoa.id, entrada.anexos)

  const conexao = comoLibsql(db)
  const id = crypto.randomUUID()
  const instante = agora()
  try {
    await emLote(conexao, [
      conexao.insert(publicacao).values({
        id,
        comunidadeId: alvo.id,
        autorId: pessoa.id,
        titulo,
        textoHtml,
        chaveDeEnvio: chave,
        ultimaAtividadeEm: instante,
        criadoEm: instante,
      }),
      ...anexos.map((a) =>
        conexao.insert(anexoDaPublicacao).values({
          id: crypto.randomUUID(),
          publicacaoId: id,
          ...a,
          criadoEm: instante,
        }),
      ),
      conexao
        .insert(seguidorDaPublicacao)
        .values({ publicacaoId: id, userId: pessoa.id, situacao: 'seguindo' }),
      conexao
        .insert(leituraDaPublicacao)
        .values({ publicacaoId: id, userId: pessoa.id, lidaEm: instante }),
    ])
  } catch (erro) {
    // Dois envios ao mesmo tempo com a mesma chave: o segundo cai na publicação do primeiro.
    const outra = await publicacaoDaChave(db, pessoa.id, chave)
    if (outra) return { id: outra, repetida: true }
    throw erro
  }
  return { id, repetida: false }
}

export async function editarPublicacao(
  db: Banco,
  agora: Relogio,
  pessoa: Pessoa,
  publicacaoId: string,
  entrada: { titulo: string; textoHtml: string; anexos: AnexoEnviado[] },
): Promise<void> {
  const { pub } = await publicacaoVisivel(db, agora, pessoa, publicacaoId)
  if (!podeMexer(pessoa, pub.autorId)) {
    throw new ErroDeComunidade('Só o autor ou a equipe edita a publicação.')
  }
  const titulo = tituloValido(entrada.titulo)
  const textoHtml = textoValido(entrada.textoHtml)
  const conexao = comoLibsql(db)
  // Os anexos tirados em edições anteriores continuam na tabela (exclusão protegida de 30 dias).
  const todos = await conexao
    .select({
      id: anexoDaPublicacao.id,
      chave: anexoDaPublicacao.chave,
      excluidoEm: anexoDaPublicacao.excluidoEm,
    })
    .from(anexoDaPublicacao)
    .where(eq(anexoDaPublicacao.publicacaoId, publicacaoId))
  const ativos = todos.filter((a) => a.excluidoEm === null)
  const anexos = validarAnexos(
    pessoa.id,
    entrada.anexos,
    ativos.map((a) => a.chave),
  )
  const mantidas = new Set(anexos.map((a) => a.chave))
  const tirados = ativos.filter((a) => !mantidas.has(a.chave))
  await emLote(conexao, [
    conexao
      .update(publicacao)
      .set({ titulo, textoHtml, editadaEm: agora() })
      .where(eq(publicacao.id, publicacaoId)),
    ...emPedacos(tirados.map((a) => a.id)).map((ids) =>
      conexao
        .update(anexoDaPublicacao)
        .set({ excluidoEm: agora() })
        .where(inArray(anexoDaPublicacao.id, ids)),
    ),
    ...anexos.flatMap((a): Comando[] => {
      const existente = todos.find((t) => t.chave === a.chave)
      if (!existente) {
        return [
          conexao.insert(anexoDaPublicacao).values({
            id: crypto.randomUUID(),
            publicacaoId,
            ...a,
            criadoEm: agora(),
          }),
        ]
      }
      // Um anexo tirado e posto de volta dentro dos 30 dias reaproveita a linha.
      return existente.excluidoEm === null
        ? []
        : [
            conexao
              .update(anexoDaPublicacao)
              .set({ excluidoEm: null })
              .where(eq(anexoDaPublicacao.id, existente.id)),
          ]
    }),
  ])
}

/** Exclusão protegida: some das telas e só é apagada de vez depois de 30 dias. */
export async function excluirPublicacao(
  db: Banco,
  agora: Relogio,
  pessoa: Pessoa,
  publicacaoId: string,
  ganchos: Ganchos = {},
): Promise<void> {
  const { pub } = await publicacaoVisivel(db, agora, pessoa, publicacaoId)
  if (!podeMexer(pessoa, pub.autorId)) {
    throw new ErroDeComunidade('Só o autor ou a equipe exclui a publicação.')
  }
  const conexao = comoLibsql(db)
  const excluir = conexao
    .update(publicacao)
    .set({ excluidoEm: agora() })
    .where(eq(publicacao.id, publicacaoId))
  // A melhor resposta some junto: os pontos dela saem, no mesmo batch da exclusão.
  const contexto = await contextoDaMelhorResposta(db, agora, pub)
  if (contexto && ganchos.comandosParaDesfazerMelhorResposta) {
    await emLote(conexao, [
      excluir,
      ...ganchos.comandosParaDesfazerMelhorResposta(contexto),
    ])
    return
  }
  await excluir
  if (contexto) await ganchos.aoDesfazerMelhorResposta?.(contexto)
}

async function contextoDaMelhorResposta(
  db: Banco,
  agora: Relogio,
  pub: Pick<LinhaDaPublicacao, 'id' | 'autorId' | 'melhorRespostaId'>,
): Promise<ContextoDaMelhorResposta | null> {
  if (!pub.melhorRespostaId) return null
  const [comentario] = await comoLibsql(db)
    .select({ autorId: comentarioDaPublicacao.autorId })
    .from(comentarioDaPublicacao)
    .where(eq(comentarioDaPublicacao.id, pub.melhorRespostaId))
  if (!comentario) return null
  return {
    db,
    agora,
    publicacaoId: pub.id,
    comentarioId: pub.melhorRespostaId,
    autorDaResposta: comentario.autorId,
    autorDaPublicacao: pub.autorId,
  }
}

async function desfazerPontosDaMelhorResposta(
  db: Banco,
  agora: Relogio,
  pub: Pick<LinhaDaPublicacao, 'id' | 'autorId' | 'melhorRespostaId'>,
  ganchos: Ganchos,
) {
  if (!ganchos.aoDesfazerMelhorResposta) return
  const contexto = await contextoDaMelhorResposta(db, agora, pub)
  if (contexto) await ganchos.aoDesfazerMelhorResposta(contexto)
}

export async function fixarPublicacao(
  db: Banco,
  agora: Relogio,
  pessoa: Pessoa,
  publicacaoId: string,
  fixada: boolean,
): Promise<void> {
  exigirEquipe(pessoa)
  await publicacaoVisivel(db, agora, pessoa, publicacaoId)
  await comoLibsql(db)
    .update(publicacao)
    .set({ fixada })
    .where(eq(publicacao.id, publicacaoId))
}

/** A Equipe bloqueia (ou libera) comentários novos; a própria Equipe continua podendo comentar. */
export async function bloquearComentarios(
  db: Banco,
  agora: Relogio,
  pessoa: Pessoa,
  publicacaoId: string,
  bloqueados: boolean,
): Promise<void> {
  exigirEquipe(pessoa)
  await publicacaoVisivel(db, agora, pessoa, publicacaoId)
  await comoLibsql(db)
    .update(publicacao)
    .set({ comentariosBloqueados: bloqueados })
    .where(eq(publicacao.id, publicacaoId))
}

// ---------- Comentários ----------

export interface EntradaDoComentario {
  publicacaoId: string
  /** Comentário de primeiro nível ao qual este responde; vazio = comentário novo. */
  paiId?: string | null
  texto: string
  chaveDeEnvio: string
}

async function comentarioDaChave(db: Banco, autorId: string, chave: string) {
  const [achado] = await comoLibsql(db)
    .select({ id: comentarioDaPublicacao.id })
    .from(comentarioDaPublicacao)
    .where(
      and(
        eq(comentarioDaPublicacao.autorId, autorId),
        eq(comentarioDaPublicacao.chaveDeEnvio, chave),
      ),
    )
  return achado?.id ?? null
}

/**
 * Comenta (ou responde a um comentário de primeiro nível). Quem comenta passa a seguir a
 * publicação, e quem segue recebe um aviso no sininho. O aviso nunca desfaz o comentário.
 */
export async function comentar(
  db: Banco,
  agora: Relogio,
  pessoa: Pessoa,
  entrada: EntradaDoComentario,
): Promise<{ id: string; repetida: boolean; avisados: number }> {
  const chave = chaveValida(entrada.chaveDeEnvio)
  const jaExiste = await comentarioDaChave(db, pessoa.id, chave)
  if (jaExiste) return { id: jaExiste, repetida: true, avisados: 0 }

  const { pub } = await publicacaoVisivel(
    db,
    agora,
    pessoa,
    entrada.publicacaoId,
  )
  if (pub.comentariosBloqueados && !ehEquipe(pessoa)) {
    throw new ErroDeComunidade(
      'Os comentários desta publicação estão bloqueados.',
    )
  }
  const texto = comentarioValido(entrada.texto)
  const conexao = comoLibsql(db)
  const paiId = entrada.paiId ?? null
  if (paiId) {
    const [pai] = await conexao
      .select({ paiId: comentarioDaPublicacao.paiId })
      .from(comentarioDaPublicacao)
      .where(
        and(
          eq(comentarioDaPublicacao.id, paiId),
          eq(comentarioDaPublicacao.publicacaoId, pub.id),
          isNull(comentarioDaPublicacao.excluidoEm),
        ),
      )
    if (!pai) throw new ErroDeComunidade('Comentário não encontrado.')
    if (pai.paiId) {
      throw new ErroDeComunidade(
        'Só dá para responder a um comentário, não a uma resposta.',
      )
    }
  }

  const id = crypto.randomUUID()
  const instante = agora()
  try {
    await emLote(conexao, [
      conexao.insert(comentarioDaPublicacao).values({
        id,
        publicacaoId: pub.id,
        autorId: pessoa.id,
        paiId,
        texto,
        chaveDeEnvio: chave,
        criadoEm: instante,
      }),
      conexao
        .update(publicacao)
        .set({ ultimaAtividadeEm: instante })
        .where(eq(publicacao.id, pub.id)),
      // Quem comenta passa a seguir, a não ser que já tenha silenciado.
      conexao
        .insert(seguidorDaPublicacao)
        .values({
          publicacaoId: pub.id,
          userId: pessoa.id,
          situacao: 'seguindo',
        })
        .onConflictDoNothing(),
      conexao
        .insert(leituraDaPublicacao)
        .values({ publicacaoId: pub.id, userId: pessoa.id, lidaEm: instante })
        .onConflictDoUpdate({
          target: [
            leituraDaPublicacao.publicacaoId,
            leituraDaPublicacao.userId,
          ],
          set: { lidaEm: instante },
        }),
    ])
  } catch (erro) {
    const outro = await comentarioDaChave(db, pessoa.id, chave)
    if (outro) return { id: outro, repetida: true, avisados: 0 }
    throw erro
  }

  let avisados = 0
  try {
    const seguidores = await conexao
      .select({ userId: seguidorDaPublicacao.userId })
      .from(seguidorDaPublicacao)
      .where(
        and(
          eq(seguidorDaPublicacao.publicacaoId, pub.id),
          eq(seguidorDaPublicacao.situacao, 'seguindo'),
          ne(seguidorDaPublicacao.userId, pessoa.id),
        ),
      )
    const quem = await quemEnxerga(
      db,
      agora,
      pub.comunidadeId,
      seguidores.map((s) => s.userId),
    )
    const [autor] = await conexao
      .select({ nome: user.name })
      .from(user)
      .where(eq(user.id, pessoa.id))
    avisados = await notificarVarios(db, agora, quem, {
      tipo: 'publicacao',
      texto: `${autor?.nome ?? 'Alguém'} comentou em "${pub.titulo}"`,
      link: linkDaPublicacao(pub.id),
    })
  } catch (erro) {
    console.error('[comunidade] não consegui avisar os seguidores', erro)
  }
  return { id, repetida: false, avisados }
}

async function comentarioDoPedido(
  db: Banco,
  agora: Relogio,
  pessoa: Pessoa,
  comentarioId: string,
) {
  const [comentario] = await comoLibsql(db)
    .select()
    .from(comentarioDaPublicacao)
    .where(
      and(
        eq(comentarioDaPublicacao.id, comentarioId),
        isNull(comentarioDaPublicacao.excluidoEm),
      ),
    )
  if (!comentario) throw new ErroDeComunidade('Comentário não encontrado.')
  const { pub } = await publicacaoVisivel(
    db,
    agora,
    pessoa,
    comentario.publicacaoId,
  )
  return { comentario, pub }
}

export async function editarComentario(
  db: Banco,
  agora: Relogio,
  pessoa: Pessoa,
  comentarioId: string,
  texto: string,
): Promise<void> {
  const { comentario } = await comentarioDoPedido(
    db,
    agora,
    pessoa,
    comentarioId,
  )
  if (!podeMexer(pessoa, comentario.autorId)) {
    throw new ErroDeComunidade('Só o autor ou a equipe edita o comentário.')
  }
  await comoLibsql(db)
    .update(comentarioDaPublicacao)
    .set({ texto: comentarioValido(texto), editadoEm: agora() })
    .where(eq(comentarioDaPublicacao.id, comentarioId))
}

/**
 * Exclusão protegida do comentário e das respostas dele. Se era a melhor resposta, a publicação
 * volta a ficar Em aberto.
 */
export async function excluirComentario(
  db: Banco,
  agora: Relogio,
  pessoa: Pessoa,
  comentarioId: string,
  ganchos: Ganchos = {},
): Promise<void> {
  const { comentario, pub } = await comentarioDoPedido(
    db,
    agora,
    pessoa,
    comentarioId,
  )
  if (!podeMexer(pessoa, comentario.autorId)) {
    throw new ErroDeComunidade('Só o autor ou a equipe exclui o comentário.')
  }
  const conexao = comoLibsql(db)
  const instante = agora()
  const eraAMelhor = pub.melhorRespostaId === comentario.id
  await emLote(conexao, [
    conexao
      .update(comentarioDaPublicacao)
      .set({ excluidoEm: instante })
      .where(
        and(
          or(
            eq(comentarioDaPublicacao.id, comentario.id),
            eq(comentarioDaPublicacao.paiId, comentario.id),
          ),
          isNull(comentarioDaPublicacao.excluidoEm),
        ),
      ),
    ...(eraAMelhor
      ? [
          conexao
            .update(publicacao)
            .set({ melhorRespostaId: null })
            .where(eq(publicacao.id, pub.id)),
        ]
      : []),
  ])
  if (eraAMelhor) {
    await ganchos.aoDesfazerMelhorResposta?.({
      db,
      agora,
      publicacaoId: pub.id,
      comentarioId: comentario.id,
      autorDaResposta: comentario.autorId,
      autorDaPublicacao: pub.autorId,
    })
  }
}

// ---------- Melhor resposta ----------

/**
 * O autor da publicação ou a Equipe marca um comentário de primeiro nível como a melhor resposta:
 * a publicação fica Resolvida. Trocar de melhor resposta desfaz a anterior (e os pontos dela).
 */
export async function escolherMelhorResposta(
  db: Banco,
  agora: Relogio,
  pessoa: Pessoa,
  publicacaoId: string,
  comentarioId: string,
  ganchos: Ganchos = {},
): Promise<void> {
  const { pub } = await publicacaoVisivel(db, agora, pessoa, publicacaoId)
  if (!podeMexer(pessoa, pub.autorId)) {
    throw new ErroDeComunidade(
      'Só o autor da publicação ou a equipe escolhe a melhor resposta.',
    )
  }
  const conexao = comoLibsql(db)
  const [comentario] = await conexao
    .select()
    .from(comentarioDaPublicacao)
    .where(
      and(
        eq(comentarioDaPublicacao.id, comentarioId),
        eq(comentarioDaPublicacao.publicacaoId, pub.id),
        isNull(comentarioDaPublicacao.excluidoEm),
        isNull(comentarioDaPublicacao.paiId),
      ),
    )
  if (!comentario) throw new ErroDeComunidade('Comentário não encontrado.')
  if (pub.melhorRespostaId === comentario.id) return

  const anterior = pub.melhorRespostaId
    ? (
        await conexao
          .select({ autorId: comentarioDaPublicacao.autorId })
          .from(comentarioDaPublicacao)
          .where(eq(comentarioDaPublicacao.id, pub.melhorRespostaId))
      )[0]
    : undefined
  await conexao
    .update(publicacao)
    .set({ melhorRespostaId: comentario.id })
    .where(eq(publicacao.id, pub.id))
  if (anterior && pub.melhorRespostaId) {
    await ganchos.aoDesfazerMelhorResposta?.({
      db,
      agora,
      publicacaoId: pub.id,
      comentarioId: pub.melhorRespostaId,
      autorDaResposta: anterior.autorId,
      autorDaPublicacao: pub.autorId,
    })
  }
  await ganchos.aoEscolherMelhorResposta?.({
    db,
    agora,
    publicacaoId: pub.id,
    comentarioId: comentario.id,
    autorDaResposta: comentario.autorId,
    autorDaPublicacao: pub.autorId,
  })
}

/** Tira a melhor resposta: a publicação volta a ficar Em aberto. Sem melhor resposta, nada muda. */
export async function desfazerMelhorResposta(
  db: Banco,
  agora: Relogio,
  pessoa: Pessoa,
  publicacaoId: string,
  ganchos: Ganchos = {},
): Promise<void> {
  const { pub } = await publicacaoVisivel(db, agora, pessoa, publicacaoId)
  if (!podeMexer(pessoa, pub.autorId)) {
    throw new ErroDeComunidade(
      'Só o autor da publicação ou a equipe desfaz a melhor resposta.',
    )
  }
  if (!pub.melhorRespostaId) return
  const conexao = comoLibsql(db)
  const [comentario] = await conexao
    .select({ autorId: comentarioDaPublicacao.autorId })
    .from(comentarioDaPublicacao)
    .where(eq(comentarioDaPublicacao.id, pub.melhorRespostaId))
  await conexao
    .update(publicacao)
    .set({ melhorRespostaId: null })
    .where(eq(publicacao.id, pub.id))
  if (comentario) {
    await ganchos.aoDesfazerMelhorResposta?.({
      db,
      agora,
      publicacaoId: pub.id,
      comentarioId: pub.melhorRespostaId,
      autorDaResposta: comentario.autorId,
      autorDaPublicacao: pub.autorId,
    })
  }
}

/**
 * Antes de excluir uma comunidade: estorna os pontos das melhores respostas das publicações dela
 * (a exclusão leva as publicações e, com elas, as origens dos pontos).
 */
export async function estornarMelhoresRespostasDaComunidade(
  db: Banco,
  agora: Relogio,
  comunidadeId: string,
  ganchos: Ganchos,
): Promise<number> {
  const marcadas = await comoLibsql(db)
    .select({
      id: publicacao.id,
      autorId: publicacao.autorId,
      melhorRespostaId: publicacao.melhorRespostaId,
    })
    .from(publicacao)
    .where(
      and(
        eq(publicacao.comunidadeId, comunidadeId),
        isNull(publicacao.excluidoEm),
        sql`${publicacao.melhorRespostaId} is not null`,
      ),
    )
  for (const pub of marcadas) {
    await desfazerPontosDaMelhorResposta(db, agora, pub, ganchos)
  }
  return marcadas.length
}

// ---------- Seguir e silenciar, lidas ----------

export type SituacaoDoSeguidor = 'seguindo' | 'silenciada'

/** Segue ou silencia a publicação para a pessoa (silenciar desfaz o seguir). */
export async function definirSeguidor(
  db: Banco,
  agora: Relogio,
  pessoa: Pessoa,
  publicacaoId: string,
  situacao: SituacaoDoSeguidor,
): Promise<void> {
  await publicacaoVisivel(db, agora, pessoa, publicacaoId)
  await comoLibsql(db)
    .insert(seguidorDaPublicacao)
    .values({ publicacaoId, userId: pessoa.id, situacao })
    .onConflictDoUpdate({
      target: [seguidorDaPublicacao.publicacaoId, seguidorDaPublicacao.userId],
      set: { situacao },
    })
}

/** A pessoa abriu a publicação: tudo o que aconteceu até agora está lido. */
export async function marcarComoVista(
  db: Banco,
  agora: Relogio,
  userId: string,
  publicacaoId: string,
): Promise<void> {
  const instante = agora()
  await comoLibsql(db)
    .insert(leituraDaPublicacao)
    .values({ publicacaoId, userId, lidaEm: instante })
    .onConflictDoUpdate({
      target: [leituraDaPublicacao.publicacaoId, leituraDaPublicacao.userId],
      set: { lidaEm: instante },
    })
}

// ---------- Listas ----------

export type VisaoDaLista = 'inicio' | 'nao-lidas' | 'minhas'
export type StatusDaLista =
  | 'todas'
  | 'em-aberto'
  | 'sem-resposta'
  | 'resolvidas'
export type OrdemDaLista = 'mais-ativas' | 'mais-recentes'

export interface FiltrosDaLista {
  visao: VisaoDaLista
  comunidadeId?: string
  status: StatusDaLista
  ordem: OrdemDaLista
  busca?: string
  /** Começa em 1. */
  pagina: number
}

export interface AutorDaLista {
  id: string
  nome: string
  imagem: string | null
  /** Texto do "Sobre você" da pessoa; aparece no cartão de perfil. */
  bio: string | null
  daEquipe: boolean
}

export interface PublicacaoDaLista {
  id: string
  titulo: string
  resumo: string
  comunidade: { id: string; nome: string; icone: string; cor: string }
  autor: AutorDaLista
  criadoEm: Date
  ultimaAtividadeEm: Date
  comentarios: number
  resolvida: boolean
  fixada: boolean
  comentariosBloqueados: boolean
  naoLida: boolean
}

export interface PaginaDePublicacoes {
  itens: PublicacaoDaLista[]
  total: number
  pagina: number
  porPagina: number
}

const paginaValida = (pagina: number) =>
  Number.isInteger(pagina) && pagina >= 1 ? pagina : 1

const escaparLike = (t: string) => t.replace(/[\\%_]/g, (c) => `\\${c}`)

const totalDeComentarios = sql<number>`(select count(*) from ${comentarioDaPublicacao} where ${comentarioDaPublicacao.publicacaoId} = ${publicacao.id} and ${comentarioDaPublicacao.excluidoEm} is null)`

/** As publicações das comunidades que a pessoa enxerga, com os filtros, a busca e a ordem. */
export async function listarPublicacoes(
  db: Banco,
  agora: Relogio,
  pessoa: Pessoa,
  filtros: FiltrosDaLista,
): Promise<PaginaDePublicacoes> {
  const pagina = paginaValida(filtros.pagina)
  const vazia = { itens: [], total: 0, pagina, porPagina: POR_PAGINA }
  const visiveis = await comunidadesVisiveis(db, agora, pessoa)
  let ids = visiveis.map((c) => c.id)
  if (filtros.comunidadeId) {
    ids = ids.filter((id) => id === filtros.comunidadeId)
  }
  if (ids.length === 0) return vazia

  const termo = (filtros.busca ?? '').trim().slice(0, 100)
  const padrao = `%${escaparLike(termo)}%`
  const condicoes = [
    isNull(publicacao.excluidoEm),
    entreOsIds(publicacao.comunidadeId, ids),
    filtros.status === 'em-aberto'
      ? isNull(publicacao.melhorRespostaId)
      : filtros.status === 'resolvidas'
        ? sql`${publicacao.melhorRespostaId} is not null`
        : filtros.status === 'sem-resposta'
          ? sql`not exists (select 1 from ${comentarioDaPublicacao} where ${comentarioDaPublicacao.publicacaoId} = ${publicacao.id} and ${comentarioDaPublicacao.excluidoEm} is null)`
          : undefined,
    termo
      ? or(
          sql`${publicacao.titulo} like ${padrao} escape '\\'`,
          sql`${publicacao.textoHtml} like ${padrao} escape '\\'`,
        )
      : undefined,
    filtros.visao === 'minhas'
      ? or(
          eq(publicacao.autorId, pessoa.id),
          sql`exists (select 1 from ${comentarioDaPublicacao} where ${comentarioDaPublicacao.publicacaoId} = ${publicacao.id} and ${comentarioDaPublicacao.autorId} = ${pessoa.id} and ${comentarioDaPublicacao.excluidoEm} is null)`,
        )
      : filtros.visao === 'nao-lidas'
        ? or(
            isNull(leituraDaPublicacao.lidaEm),
            gt(publicacao.ultimaAtividadeEm, leituraDaPublicacao.lidaEm),
          )
        : undefined,
  ]
  const onde = and(...condicoes)
  const conexao = comoLibsql(db)
  const comLeitura = and(
    eq(leituraDaPublicacao.publicacaoId, publicacao.id),
    eq(leituraDaPublicacao.userId, pessoa.id),
  )

  const [[contagem], linhas] = await Promise.all([
    conexao
      .select({ total: count() })
      .from(publicacao)
      .leftJoin(leituraDaPublicacao, comLeitura)
      .where(onde),
    conexao
      .select({
        id: publicacao.id,
        titulo: publicacao.titulo,
        textoHtml: publicacao.textoHtml,
        comunidadeId: comunidade.id,
        comunidadeNome: comunidade.nome,
        icone: comunidade.icone,
        cor: comunidade.cor,
        autorId: user.id,
        autorNome: user.name,
        autorImagem: user.image,
        autorBio: user.bio,
        autorPerfil: user.perfil,
        criadoEm: publicacao.criadoEm,
        ultimaAtividadeEm: publicacao.ultimaAtividadeEm,
        comentarios: totalDeComentarios,
        melhorRespostaId: publicacao.melhorRespostaId,
        fixada: publicacao.fixada,
        bloqueados: publicacao.comentariosBloqueados,
        lidaEm: leituraDaPublicacao.lidaEm,
      })
      .from(publicacao)
      .innerJoin(comunidade, eq(comunidade.id, publicacao.comunidadeId))
      .innerJoin(user, eq(user.id, publicacao.autorId))
      .leftJoin(leituraDaPublicacao, comLeitura)
      .where(onde)
      .orderBy(
        desc(publicacao.fixada),
        filtros.ordem === 'mais-recentes'
          ? desc(publicacao.criadoEm)
          : desc(publicacao.ultimaAtividadeEm),
        desc(publicacao.id),
      )
      .limit(POR_PAGINA)
      .offset((pagina - 1) * POR_PAGINA),
  ])

  return {
    total: contagem?.total ?? 0,
    pagina,
    porPagina: POR_PAGINA,
    itens: linhas.map((l) => ({
      id: l.id,
      titulo: l.titulo,
      resumo: textoPuro(l.textoHtml).slice(0, 180),
      comunidade: {
        id: l.comunidadeId,
        nome: l.comunidadeNome,
        icone: l.icone,
        cor: l.cor,
      },
      autor: {
        id: l.autorId,
        nome: l.autorNome,
        imagem: l.autorImagem,
        bio: l.autorBio,
        daEquipe: l.autorPerfil !== 'aluno',
      },
      criadoEm: l.criadoEm,
      ultimaAtividadeEm: l.ultimaAtividadeEm,
      comentarios: Number(l.comentarios),
      resolvida: l.melhorRespostaId !== null,
      fixada: l.fixada,
      comentariosBloqueados: l.bloqueados,
      naoLida: l.lidaEm === null || l.ultimaAtividadeEm > l.lidaEm,
    })),
  }
}

/** Quantas publicações não lidas a pessoa tem (ponto no menu "Não lidas"). */
export async function contarNaoLidas(
  db: Banco,
  agora: Relogio,
  pessoa: Pessoa,
): Promise<number> {
  const { total } = await listarPublicacoes(db, agora, pessoa, {
    visao: 'nao-lidas',
    status: 'todas',
    ordem: 'mais-ativas',
    pagina: 1,
  })
  return total
}

// ---------- Uma publicação ----------

export interface ComentarioDaTela {
  id: string
  autor: AutorDaLista
  texto: string
  criadoEm: Date
  editadoEm: Date | null
  respostas: ComentarioDaTela[]
}

export interface PublicacaoDaTela {
  id: string
  titulo: string
  textoHtml: string
  comunidade: ComunidadeDaLista
  autor: AutorDaLista
  criadoEm: Date
  editadoEm: Date | null
  resolvida: boolean
  fixada: boolean
  comentariosBloqueados: boolean
  anexos: {
    id: string
    chave: string
    nome: string
    tipo: string
    tamanho: number
  }[]
  /** A melhor resposta, separada da lista para aparecer sempre no topo. */
  melhorResposta: ComentarioDaTela | null
  comentarios: ComentarioDaTela[]
  totalDeComentarios: number
  pagina: number
  totalDePaginas: number
  situacaoDoSeguidor: SituacaoDoSeguidor | null
  eu: { id: string; souEquipe: boolean; souAutor: boolean }
  podeComentar: boolean
}

/** A publicação com anexos e comentários (20 de primeiro nível por página); nulo se não enxerga. */
export async function obterPublicacao(
  db: Banco,
  agora: Relogio,
  pessoa: Pessoa,
  publicacaoId: string,
  paginaDeComentarios = 1,
): Promise<PublicacaoDaTela | null> {
  let encontrada: Awaited<ReturnType<typeof publicacaoVisivel>>
  try {
    encontrada = await publicacaoVisivel(db, agora, pessoa, publicacaoId)
  } catch (erro) {
    if (erro instanceof ErroDeComunidade) return null
    throw erro
  }
  const { pub, comunidade: alvo } = encontrada
  const conexao = comoLibsql(db)
  const pagina = paginaValida(paginaDeComentarios)
  const aberto = isNull(comentarioDaPublicacao.excluidoEm)
  const doNivel1 = and(
    eq(comentarioDaPublicacao.publicacaoId, pub.id),
    aberto,
    isNull(comentarioDaPublicacao.paiId),
    pub.melhorRespostaId
      ? ne(comentarioDaPublicacao.id, pub.melhorRespostaId)
      : undefined,
  )

  const [[autor], anexos, [seguidor], [totais], [semMelhor]] =
    await Promise.all([
      conexao.select().from(user).where(eq(user.id, pub.autorId)),
      conexao
        .select()
        .from(anexoDaPublicacao)
        .where(
          and(
            eq(anexoDaPublicacao.publicacaoId, pub.id),
            isNull(anexoDaPublicacao.excluidoEm),
          ),
        )
        .orderBy(anexoDaPublicacao.criadoEm, anexoDaPublicacao.id),
      conexao
        .select({ situacao: seguidorDaPublicacao.situacao })
        .from(seguidorDaPublicacao)
        .where(
          and(
            eq(seguidorDaPublicacao.publicacaoId, pub.id),
            eq(seguidorDaPublicacao.userId, pessoa.id),
          ),
        ),
      conexao
        .select({ total: count() })
        .from(comentarioDaPublicacao)
        .where(and(eq(comentarioDaPublicacao.publicacaoId, pub.id), aberto)),
      conexao
        .select({ total: count() })
        .from(comentarioDaPublicacao)
        .where(doNivel1),
    ])

  const tops = await conexao
    .select()
    .from(comentarioDaPublicacao)
    .where(doNivel1)
    .orderBy(comentarioDaPublicacao.criadoEm, comentarioDaPublicacao.id)
    .limit(POR_PAGINA)
    .offset((pagina - 1) * POR_PAGINA)
  const idsDosTopos = [...tops.map((t) => t.id)]
  if (pub.melhorRespostaId) idsDosTopos.push(pub.melhorRespostaId)
  const [melhor] = pub.melhorRespostaId
    ? await conexao
        .select()
        .from(comentarioDaPublicacao)
        .where(and(eq(comentarioDaPublicacao.id, pub.melhorRespostaId), aberto))
    : []
  const respostas =
    idsDosTopos.length === 0
      ? []
      : (
          await emLotes(idsDosTopos, (ids) =>
            conexao
              .select()
              .from(comentarioDaPublicacao)
              .where(and(inArray(comentarioDaPublicacao.paiId, ids), aberto)),
          )
        ).sort(
          (a, b) =>
            a.criadoEm.getTime() - b.criadoEm.getTime() ||
            (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
        )

  const autoresIds = [
    ...new Set([
      ...tops.map((c) => c.autorId),
      ...(melhor ? [melhor.autorId] : []),
      ...respostas.map((c) => c.autorId),
    ]),
  ]
  const autores = autoresIds.length
    ? await emLotes(autoresIds, (ids) =>
        conexao.select().from(user).where(inArray(user.id, ids)),
      )
    : []
  const paraAutor = (id: string): AutorDaLista => {
    const a = autores.find((x) => x.id === id)
    return {
      id,
      nome: a?.name ?? 'Aluno',
      imagem: a?.image ?? null,
      bio: a?.bio ?? null,
      daEquipe: !!a && a.perfil !== 'aluno',
    }
  }
  const montar = (
    c: typeof comentarioDaPublicacao.$inferSelect,
  ): ComentarioDaTela => ({
    id: c.id,
    autor: paraAutor(c.autorId),
    texto: c.texto,
    criadoEm: c.criadoEm,
    editadoEm: c.editadoEm,
    respostas: respostas.filter((r) => r.paiId === c.id).map(montar),
  })

  return {
    id: pub.id,
    titulo: pub.titulo,
    textoHtml: pub.textoHtml,
    comunidade: alvo,
    autor: {
      id: pub.autorId,
      nome: autor?.name ?? 'Aluno',
      imagem: autor?.image ?? null,
      bio: autor?.bio ?? null,
      daEquipe: !!autor && autor.perfil !== 'aluno',
    },
    criadoEm: pub.criadoEm,
    editadoEm: pub.editadaEm,
    resolvida: pub.melhorRespostaId !== null,
    fixada: pub.fixada,
    comentariosBloqueados: pub.comentariosBloqueados,
    anexos: anexos.map((a) => ({
      id: a.id,
      chave: a.chave,
      nome: a.nome,
      tipo: a.tipo,
      tamanho: a.tamanho,
    })),
    melhorResposta: melhor ? montar(melhor) : null,
    comentarios: tops.map(montar),
    totalDeComentarios: totais?.total ?? 0,
    pagina,
    totalDePaginas: Math.max(
      1,
      Math.ceil((semMelhor?.total ?? 0) / POR_PAGINA),
    ),
    situacaoDoSeguidor: seguidor?.situacao ?? null,
    eu: {
      id: pessoa.id,
      souEquipe: ehEquipe(pessoa),
      souAutor: pessoa.id === pub.autorId,
    },
    podeComentar: !pub.comentariosBloqueados || ehEquipe(pessoa),
  }
}

/** Um anexo, se a pessoa enxerga a publicação dele (para o download). */
export async function anexoVisivel(
  db: Banco,
  agora: Relogio,
  pessoa: Pessoa,
  anexoId: string,
) {
  const [anexo] = await comoLibsql(db)
    .select()
    .from(anexoDaPublicacao)
    .where(
      and(
        eq(anexoDaPublicacao.id, anexoId),
        isNull(anexoDaPublicacao.excluidoEm),
      ),
    )
  if (!anexo) return null
  try {
    await publicacaoVisivel(db, agora, pessoa, anexo.publicacaoId)
  } catch (erro) {
    if (erro instanceof ErroDeComunidade) return null
    throw erro
  }
  return anexo
}

// ---------- Fila "Aguardando resposta" e comentários recentes (Equipe) ----------

// Em aberto, escrita por aluno e sem nenhum comentário de alguém da Equipe.
const aguardandoResposta = () =>
  and(
    isNull(publicacao.excluidoEm),
    isNull(comunidade.excluidoEm),
    isNull(publicacao.melhorRespostaId),
    eq(user.perfil, 'aluno'),
    sql`not exists (select 1 from ${comentarioDaPublicacao} inner join ${user} as respondente on respondente.id = ${comentarioDaPublicacao.autorId} where ${comentarioDaPublicacao.publicacaoId} = ${publicacao.id} and ${comentarioDaPublicacao.excluidoEm} is null and respondente.perfil <> 'aluno')`,
  )

/** Quantas publicações esperam resposta da Equipe (contador do menu e do sininho da equipe). */
export async function contarAguardandoResposta(db: Banco): Promise<number> {
  const [linha] = await comoLibsql(db)
    .select({ total: count() })
    .from(publicacao)
    .innerJoin(comunidade, eq(comunidade.id, publicacao.comunidadeId))
    .innerJoin(user, eq(user.id, publicacao.autorId))
    .where(aguardandoResposta())
  return linha?.total ?? 0
}

export interface PublicacaoAguardando {
  id: string
  titulo: string
  resumo: string
  comunidadeNome: string
  autorNome: string
  comentarios: number
  criadoEm: Date
}

/** A fila, das que esperam há mais tempo para as mais novas. */
export async function listarAguardandoResposta(
  db: Banco,
  pagina = 1,
): Promise<{
  itens: PublicacaoAguardando[]
  total: number
  pagina: number
  porPagina: number
}> {
  const atual = paginaValida(pagina)
  const conexao = comoLibsql(db)
  const [total, linhas] = await Promise.all([
    contarAguardandoResposta(db),
    conexao
      .select({
        id: publicacao.id,
        titulo: publicacao.titulo,
        textoHtml: publicacao.textoHtml,
        comunidadeNome: comunidade.nome,
        autorNome: user.name,
        comentarios: totalDeComentarios,
        criadoEm: publicacao.criadoEm,
      })
      .from(publicacao)
      .innerJoin(comunidade, eq(comunidade.id, publicacao.comunidadeId))
      .innerJoin(user, eq(user.id, publicacao.autorId))
      .where(aguardandoResposta())
      .orderBy(publicacao.criadoEm, publicacao.id)
      .limit(POR_PAGINA)
      .offset((atual - 1) * POR_PAGINA),
  ])
  return {
    total,
    pagina: atual,
    porPagina: POR_PAGINA,
    itens: linhas.map((l) => ({
      id: l.id,
      titulo: l.titulo,
      resumo: textoPuro(l.textoHtml).slice(0, 180),
      comunidadeNome: l.comunidadeNome,
      autorNome: l.autorNome,
      comentarios: Number(l.comentarios),
      criadoEm: l.criadoEm,
    })),
  }
}

export interface ComentarioRecente {
  id: string
  texto: string
  autorNome: string
  daEquipe: boolean
  publicacaoId: string
  publicacaoTitulo: string
  comunidadeNome: string
  criadoEm: Date
}

/** Os comentários mais recentes de todas as comunidades, para a Equipe acompanhar. */
export async function listarComentariosRecentes(
  db: Banco,
  pagina = 1,
): Promise<{
  itens: ComentarioRecente[]
  total: number
  pagina: number
  porPagina: number
}> {
  const atual = paginaValida(pagina)
  const conexao = comoLibsql(db)
  const onde = and(
    isNull(comentarioDaPublicacao.excluidoEm),
    isNull(publicacao.excluidoEm),
    isNull(comunidade.excluidoEm),
  )
  const autor = alias(user, 'autor')
  const [[contagem], linhas] = await Promise.all([
    conexao
      .select({ total: count() })
      .from(comentarioDaPublicacao)
      .innerJoin(
        publicacao,
        eq(publicacao.id, comentarioDaPublicacao.publicacaoId),
      )
      .innerJoin(comunidade, eq(comunidade.id, publicacao.comunidadeId))
      .where(onde),
    conexao
      .select({
        id: comentarioDaPublicacao.id,
        texto: comentarioDaPublicacao.texto,
        autorNome: autor.name,
        autorPerfil: autor.perfil,
        publicacaoId: publicacao.id,
        publicacaoTitulo: publicacao.titulo,
        comunidadeNome: comunidade.nome,
        criadoEm: comentarioDaPublicacao.criadoEm,
      })
      .from(comentarioDaPublicacao)
      .innerJoin(
        publicacao,
        eq(publicacao.id, comentarioDaPublicacao.publicacaoId),
      )
      .innerJoin(comunidade, eq(comunidade.id, publicacao.comunidadeId))
      .innerJoin(autor, eq(autor.id, comentarioDaPublicacao.autorId))
      .where(onde)
      .orderBy(
        desc(comentarioDaPublicacao.criadoEm),
        desc(comentarioDaPublicacao.id),
      )
      .limit(POR_PAGINA)
      .offset((atual - 1) * POR_PAGINA),
  ])
  return {
    total: contagem?.total ?? 0,
    pagina: atual,
    porPagina: POR_PAGINA,
    itens: linhas.map((l) => ({
      id: l.id,
      texto: l.texto,
      autorNome: l.autorNome,
      daEquipe: l.autorPerfil !== 'aluno',
      publicacaoId: l.publicacaoId,
      publicacaoTitulo: l.publicacaoTitulo,
      comunidadeNome: l.comunidadeNome,
      criadoEm: l.criadoEm,
    })),
  }
}
