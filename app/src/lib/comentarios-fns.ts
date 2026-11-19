import { env } from 'cloudflare:workers'
import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { getDb } from '#/db/index'
import { pessoaLogadaNaSessao } from '#/lib/autorizacao'
import { ganchosDosComentariosComCertificado } from '#/lib/certificados-cola'
import { aulaEstaLiberada } from '#/lib/liberacao'
import { escritaLimitada, MENSAGEM_DE_ESCRITA_LIMITADA } from '#/lib/rate-limit'
import { agora } from '#/lib/relogio'
import { podeAcessarCurso } from '#/regras/acesso-ao-curso'
import {
  alterarComentarios,
  aulaDoComentario,
  criarComentario,
  ErroDeComentario,
  editarComentario,
  excluirComentario,
  fixarComentario,
  LIMITE_DO_TEXTO,
  listarComentarios,
  moduloDaAula,
} from '#/regras/comentarios'
import { podeFazer } from '#/regras/permissoes'
import { cursoDaAula } from '#/regras/progresso'

const id = z.string().min(1).max(100)
const texto = z.string().max(LIMITE_DO_TEXTO + 500)

// Autentica e confere o acesso ao curso e a liberação da aula. Quem não tem acesso vê "aula não
// encontrada".
async function pessoaComAcessoA(aulaId: string) {
  const ator = await pessoaLogadaNaSessao()
  const db = getDb(env.DB)
  const cursoId = await cursoDaAula(db, aulaId)
  if (!cursoId || !(await podeAcessarCurso(db, agora, ator, cursoId))) {
    throw new ErroDeComentario('Aula não encontrada.')
  }
  if (!(await aulaEstaLiberada(db, agora, ator, aulaId))) {
    throw new ErroDeComentario('Aula não encontrada.')
  }
  return { db, ator }
}

async function pessoaComAcessoAoComentario(comentarioId: string) {
  const db = getDb(env.DB)
  return pessoaComAcessoA(await aulaDoComentario(db, comentarioId))
}

export const comentariosDaAulaFn = createServerFn({ method: 'GET' })
  .validator(z.object({ aulaId: id, pagina: z.number().int().min(1).max(500) }))
  .handler(async ({ data }) => {
    const { db, ator } = await pessoaComAcessoA(data.aulaId)
    const lista = await listarComentarios(db, ator, data.aulaId, data.pagina)
    return { ...lista, ehEquipe: podeFazer(ator.perfil, 'usar-estudio') }
  })

export const criarComentarioFn = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      aulaId: id,
      texto,
      paiId: id.nullable().optional(),
      chaveDeEnvio: id,
    }),
  )
  .handler(async ({ data }) => {
    const { db, ator } = await pessoaComAcessoA(data.aulaId)
    if (await escritaLimitada(ator.id)) {
      throw new ErroDeComentario(MENSAGEM_DE_ESCRITA_LIMITADA)
    }
    // Os pontos de comentar (#54): 25 no primeiro comentário da aula.
    return criarComentario(
      db,
      agora,
      ator,
      data,
      ganchosDosComentariosComCertificado,
    )
  })

export const editarComentarioFn = createServerFn({ method: 'POST' })
  .validator(z.object({ comentarioId: id, texto }))
  .handler(async ({ data }) => {
    const { db, ator } = await pessoaComAcessoAoComentario(data.comentarioId)
    await editarComentario(db, agora, ator, data.comentarioId, data.texto)
  })

// Os pontos de um comentário excluído (#54) saem junto.
export const excluirComentarioFn = createServerFn({ method: 'POST' })
  .validator(z.object({ comentarioId: id }))
  .handler(async ({ data }) => {
    const { db, ator } = await pessoaComAcessoAoComentario(data.comentarioId)
    await excluirComentario(
      db,
      agora,
      ator,
      data.comentarioId,
      ganchosDosComentariosComCertificado,
    )
  })

export const fixarComentarioFn = createServerFn({ method: 'POST' })
  .validator(z.object({ comentarioId: id, fixado: z.boolean() }))
  .handler(async ({ data }) => {
    const { db, ator } = await pessoaComAcessoAoComentario(data.comentarioId)
    await fixarComentario(db, agora, ator, data.comentarioId, data.fixado)
  })

// A Equipe liga ou desliga os comentários de uma aula ou de um módulo inteiro.
export const alterarComentariosFn = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      aulaId: id,
      alvo: z.enum(['aula', 'modulo']),
      ligados: z.boolean(),
    }),
  )
  .handler(async ({ data }) => {
    const { db, ator } = await pessoaComAcessoA(data.aulaId)
    const alvoId =
      data.alvo === 'aula' ? data.aulaId : await moduloDaAula(db, data.aulaId)
    await alterarComentarios(
      db,
      agora,
      ator,
      { tipo: data.alvo, id: alvoId },
      data.ligados,
    )
  })
