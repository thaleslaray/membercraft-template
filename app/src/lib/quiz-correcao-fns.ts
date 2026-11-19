import { env } from 'cloudflare:workers'
import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { getDb } from '#/db/index'
import { exigirPermissaoNaSessao } from '#/lib/autorizacao'
import { ganchosDoQuizComPontosECertificado } from '#/lib/certificados-cola'
import { avisarNoSininho } from '#/lib/notificacoes-cola'
import { agora } from '#/lib/relogio'
import {
  corrigirResposta,
  LIMITE_DO_COMENTARIO,
  liberarTentativa,
  listarAguardandoCorrecao,
  listarSemTentativas,
} from '#/regras/quiz-correcao'

const id = z.string().min(1).max(100)

// Tudo aqui é da Equipe que corrige (`corrigir-quiz`).

export const filaDeCorrecaoFn = createServerFn({ method: 'GET' }).handler(
  async () => {
    await exigirPermissaoNaSessao('corrigir-quiz')
    return listarAguardandoCorrecao(getDb(env.DB))
  },
)

export const corrigirRespostaFn = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      respostaId: id,
      correta: z.boolean(),
      comentario: z.string().max(LIMITE_DO_COMENTARIO).nullish(),
    }),
  )
  .handler(async ({ data }) => {
    const sessao = await exigirPermissaoNaSessao('corrigir-quiz')
    // Os pontos (#54) entram em `aoAprovarPelaPrimeiraVez`.
    return corrigirResposta(
      getDb(env.DB),
      agora,
      sessao.user.id,
      data.respostaId,
      { correta: data.correta, comentario: data.comentario },
      {
        ...ganchosDoQuizComPontosECertificado,
        // Terminada a correção, o aluno é avisado no sininho (#46).
        aoCorrigir: async ({ userId, aulaId, aprovada }) => {
          await avisarNoSininho(env, {
            userId,
            tipo: 'quiz-corrigido',
            texto: aprovada
              ? 'Sua entrega do exercício foi corrigida: você foi aprovado.'
              : 'Sua entrega do exercício foi corrigida. Veja o resultado.',
            link: `/aulas/${aulaId}`,
          })
        },
      },
    )
  })

export const semTentativasFn = createServerFn({ method: 'GET' }).handler(
  async () => {
    await exigirPermissaoNaSessao('corrigir-quiz')
    return listarSemTentativas(getDb(env.DB))
  },
)

export const liberarTentativaFn = createServerFn({ method: 'POST' })
  .validator(z.object({ quizId: id, alunoId: id }))
  .handler(async ({ data }) => {
    const sessao = await exigirPermissaoNaSessao('corrigir-quiz')
    await liberarTentativa(
      getDb(env.DB),
      agora,
      sessao.user.id,
      data.quizId,
      data.alunoId,
    )
  })
