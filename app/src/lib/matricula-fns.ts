import { env } from 'cloudflare:workers'
import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { getDb } from '#/db/index'
import { exigirPermissaoNaSessao } from '#/lib/autorizacao'
import { fimDoDiaEmBrasilia } from '#/lib/datas'
import { avisarCursoLiberado, avisarTrocaDeEmail } from '#/lib/email-cola'
import { agora } from '#/lib/relogio'
import { LIMITE_DO_NOME } from '#/regras/formulario-do-curso'
import {
  buscarAlunos,
  criarTurma,
  editarTurma,
  encerrar,
  excluirTurma,
  interpretarLote,
  listarTurmas,
  matricularManual,
  perfilDoAluno,
  prorrogar,
  reativar,
  trocarEmail,
} from '#/regras/matricula'

const id = z.string().min(1).max(100)
// Data digitada no painel (aaaa-mm-dd); vazio = sem data.
const dataOpcional = z.string().max(10).optional()

// Tudo aqui é da Equipe (`gerir-matriculas`).
export const salvarTurmaFn = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      id: id.optional(),
      cursoId: id,
      nome: z.string().max(LIMITE_DO_NOME),
      prazoEmDias: z.number().int().nullish(),
    }),
  )
  .handler(async ({ data }) => {
    await exigirPermissaoNaSessao('gerir-matriculas')
    const db = getDb(env.DB)
    if (data.id) {
      await editarTurma(db, data.id, {
        nome: data.nome,
        prazoEmDias: data.prazoEmDias,
      })
      return data.id
    }
    return criarTurma(db, data)
  })

export const excluirTurmaFn = createServerFn({ method: 'POST' })
  .validator(z.object({ id }))
  .handler(async ({ data }) => {
    const sessao = await exigirPermissaoNaSessao('gerir-matriculas')
    await excluirTurma(getDb(env.DB), agora, data.id, sessao.user.id)
  })

export const turmasParaMatriculaFn = createServerFn({ method: 'GET' }).handler(
  async () => {
    await exigirPermissaoNaSessao('gerir-matriculas')
    return listarTurmas(getDb(env.DB))
  },
)

export const matricularManualFn = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      turmaId: id,
      lote: z.string().max(50_000),
      expiracao: dataOpcional,
      observacao: z.string().max(500).optional(),
    }),
  )
  .handler(async ({ data }) => {
    const sessao = await exigirPermissaoNaSessao('gerir-matriculas')
    return matricularManual(getDb(env.DB), agora, {
      pessoas: interpretarLote(data.lote),
      turmaId: data.turmaId,
      expiracao: fimDoDiaEmBrasilia(data.expiracao),
      observacao: data.observacao,
      autorId: sessao.user.id,
      // O e-mail "Curso liberado" vai para a fila, um por matrícula nova ou reativada.
      aoLiberarCurso: (evento) => avisarCursoLiberado(env, evento),
    })
  })

export const alunosFn = createServerFn({ method: 'GET' })
  .validator(
    z.object({
      termo: z.string().max(100).optional(),
      pagina: z.number().int().min(1).optional(),
    }),
  )
  .handler(async ({ data }) => {
    await exigirPermissaoNaSessao('gerir-matriculas')
    return buscarAlunos(getDb(env.DB), data.termo, data.pagina, agora)
  })

export const perfilDoAlunoFn = createServerFn({ method: 'GET' })
  .validator(z.object({ id }))
  .handler(async ({ data }) => {
    await exigirPermissaoNaSessao('gerir-matriculas')
    return perfilDoAluno(getDb(env.DB), agora, data.id)
  })

export const prorrogarFn = createServerFn({ method: 'POST' })
  .validator(z.object({ matriculaId: id, ate: dataOpcional }))
  .handler(async ({ data }) => {
    await exigirPermissaoNaSessao('gerir-matriculas')
    // Sem data = vitalícia.
    await prorrogar(getDb(env.DB), agora, {
      matriculaId: data.matriculaId,
      ate: fimDoDiaEmBrasilia(data.ate),
    })
  })

export const encerrarFn = createServerFn({ method: 'POST' })
  .validator(z.object({ matriculaId: id }))
  .handler(async ({ data }) => {
    await exigirPermissaoNaSessao('gerir-matriculas')
    await encerrar(getDb(env.DB), { matriculaId: data.matriculaId })
  })

export const reativarFn = createServerFn({ method: 'POST' })
  .validator(z.object({ matriculaId: id, expiracao: dataOpcional }))
  .handler(async ({ data }) => {
    const sessao = await exigirPermissaoNaSessao('gerir-matriculas')
    await reativar(getDb(env.DB), agora, {
      matriculaId: data.matriculaId,
      autorId: sessao.user.id,
      expiracao: fimDoDiaEmBrasilia(data.expiracao),
    })
  })

export const trocarEmailFn = createServerFn({ method: 'POST' })
  .validator(z.object({ alunoId: id, novoEmail: z.string().max(254) }))
  .handler(async ({ data }) => {
    const sessao = await exigirPermissaoNaSessao('gerir-matriculas')
    const troca = await trocarEmail(getDb(env.DB), agora, {
      userId: data.alunoId,
      novoEmail: data.novoEmail,
      autorId: sessao.user.id,
    })
    if (troca) await avisarTrocaDeEmail(env, { userId: data.alunoId, ...troca })
  })
