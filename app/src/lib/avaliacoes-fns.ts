import { env } from 'cloudflare:workers'
import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { getDb } from '#/db/index'
import {
  exigirPermissaoNaSessao,
  pessoaLogadaNaSessao,
} from '#/lib/autorizacao'
import { ganchosDaAvaliacaoComCertificado } from '#/lib/certificados-cola'
import { aulaEstaLiberada } from '#/lib/liberacao'
import { agora } from '#/lib/relogio'
import { podeAcessarCurso } from '#/regras/acesso-ao-curso'
import {
  avaliarAula,
  ErroDeAvaliacao,
  lerAvaliacao,
  listarAvaliacoes,
  marcarComoLida,
} from '#/regras/avaliacoes'
import { cursoDaAula } from '#/regras/progresso'

const id = z.string().min(1).max(100)

// Autentica e confere o acesso ao curso da aula. Quem não tem acesso vê "aula não encontrada".
async function pessoaComAcessoA(aulaId: string) {
  const pessoa = await pessoaLogadaNaSessao()
  const db = getDb(env.DB)
  const cursoId = await cursoDaAula(db, aulaId)
  if (!cursoId || !(await podeAcessarCurso(db, agora, pessoa, cursoId))) {
    throw new ErroDeAvaliacao('Aula não encontrada.')
  }
  // Aula oculta ou com cadeado (regras de liberação, #42) não recebe resposta nem avaliação.
  if (!(await aulaEstaLiberada(db, agora, pessoa, aulaId))) {
    throw new ErroDeAvaliacao('Aula não encontrada.')
  }
  return { db, userId: pessoa.id }
}

// A avaliação que o aluno já deu à aula (nula se ainda não deu).
export const avaliacaoDaAulaFn = createServerFn({ method: 'GET' })
  .validator(z.object({ aulaId: id }))
  .handler(async ({ data }) => {
    const { db, userId } = await pessoaComAcessoA(data.aulaId)
    return lerAvaliacao(db, userId, data.aulaId)
  })

// Os 25 pontos da primeira avaliação (#54) entram pelo gancho.
export const avaliarAulaFn = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      aulaId: id,
      nota: z.number().int().min(1).max(5),
      oQueFaltou: z.string().max(2000).nullable().optional(),
    }),
  )
  .handler(async ({ data }) => {
    const { db, userId } = await pessoaComAcessoA(data.aulaId)
    const { aulaId, ...entrada } = data
    return avaliarAula(
      db,
      agora,
      userId,
      aulaId,
      entrada,
      ganchosDaAvaliacaoComCertificado,
    )
  })

// Fila da equipe: "para ler" ou "lidas".
export const avaliacoesDoPainelFn = createServerFn({ method: 'GET' })
  .validator(z.object({ situacao: z.enum(['para-ler', 'lidas']) }))
  .handler(async ({ data }) => {
    await exigirPermissaoNaSessao('usar-estudio')
    return listarAvaliacoes(getDb(env.DB), data.situacao)
  })

export const marcarAvaliacaoComoLidaFn = createServerFn({ method: 'POST' })
  .validator(z.object({ avaliacaoId: id }))
  .handler(async ({ data }) => {
    const sessao = await exigirPermissaoNaSessao('usar-estudio')
    await marcarComoLida(getDb(env.DB), agora, sessao.user.id, data.avaliacaoId)
  })
