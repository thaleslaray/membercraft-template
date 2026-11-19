import { env } from 'cloudflare:workers'
import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { getDb } from '#/db/index'
import { exigirPermissaoNaSessao } from '#/lib/autorizacao'
import { agora } from '#/lib/relogio'
import {
  adicionarNaEquipe,
  listarEquipe,
  removerDaEquipe,
  trocarPerfilDaEquipe,
} from '#/regras/equipe'
import { excluirAluno } from '#/regras/exclusao-de-aluno'
import { contarFilas, FILAS } from '#/regras/filas'
import {
  listarAcoesComAutor,
  opcoesDoRegistro,
} from '#/regras/registro-de-acoes'
import { definirResumoDiario, resumoDiarioLigado } from '#/regras/resumo-diario'
import type { Banco } from '#/regras/tipos'

const id = z.string().min(1).max(100)
const perfil = z.enum(['equipe', 'proprietario'])

// Equipe: só o Proprietário (`gerir-equipe`).
export const equipeFn = createServerFn({ method: 'GET' }).handler(async () => {
  const sessao = await exigirPermissaoNaSessao('gerir-equipe')
  return {
    meuId: sessao.user.id,
    pessoas: await listarEquipe(getDb(env.DB)),
  }
})

export const adicionarNaEquipeFn = createServerFn({ method: 'POST' })
  .validator(z.object({ email: z.string().max(200), perfil }))
  .handler(async ({ data }) => {
    const sessao = await exigirPermissaoNaSessao('gerir-equipe')
    return adicionarNaEquipe(getDb(env.DB), agora, {
      autorId: sessao.user.id,
      ...data,
    })
  })

export const trocarPerfilFn = createServerFn({ method: 'POST' })
  .validator(z.object({ pessoaId: id, perfil }))
  .handler(async ({ data }) => {
    const sessao = await exigirPermissaoNaSessao('gerir-equipe')
    await trocarPerfilDaEquipe(getDb(env.DB), agora, {
      autorId: sessao.user.id,
      userId: data.pessoaId,
      perfil: data.perfil,
    })
  })

export const removerDaEquipeFn = createServerFn({ method: 'POST' })
  .validator(z.object({ pessoaId: id }))
  .handler(async ({ data }) => {
    const sessao = await exigirPermissaoNaSessao('gerir-equipe')
    await removerDaEquipe(getDb(env.DB), agora, {
      autorId: sessao.user.id,
      userId: data.pessoaId,
    })
  })

// Registro de ações: só o Proprietário lê.
export const registroDeAcoesFn = createServerFn({ method: 'GET' })
  .validator(
    z.object({
      pagina: z.number().int().min(1).optional(),
      autorId: id.optional(),
      acao: id.optional(),
      de: z.string().max(10).optional(),
      ate: z.string().max(10).optional(),
    }),
  )
  .handler(async ({ data }) => {
    await exigirPermissaoNaSessao('ler-registro-de-acoes')
    const db = getDb(env.DB)
    const { pagina, ...filtros } = data
    const [acoes, opcoes] = await Promise.all([
      listarAcoesComAutor(db, pagina, filtros),
      opcoesDoRegistro(db),
    ])
    return { ...acoes, opcoes }
  })

export const excluirAlunoFn = createServerFn({ method: 'POST' })
  .validator(z.object({ alunoId: id }))
  .handler(async ({ data }) => {
    const sessao = await exigirPermissaoNaSessao('excluir-aluno')
    const arquivos = await excluirAluno(getDb(env.DB), agora, {
      autorId: sessao.user.id,
      userId: data.alunoId,
    })
    // O banco já confirmou: os arquivos dele saem do R2 (1.000 chaves por chamada).
    for (let i = 0; i < arquivos.length; i += 1000) {
      await env.BUCKET.delete(arquivos.slice(i, i + 1000))
    }
    return { excluido: true }
  })

// Contadores das filas (menu do painel) e o resumo diário: de toda a Equipe.
export const contadoresDasFilasFn = createServerFn({ method: 'GET' }).handler(
  async () => {
    await exigirPermissaoNaSessao('usar-estudio')
    return contarFilas(getDb(env.DB), FILAS, agora)
  },
)

// O interruptor e as contagens não dependem um do outro: vão juntos (exportada para o teste de idas).
export async function carregarResumoDiario(db: Banco, userId: string) {
  const [ligado, filas] = await Promise.all([
    resumoDiarioLigado(db, userId),
    contarFilas(db, FILAS, agora),
  ])
  return { ligado, filas }
}

export const resumoDiarioFn = createServerFn({ method: 'GET' }).handler(
  async () => {
    const sessao = await exigirPermissaoNaSessao('usar-estudio')
    return carregarResumoDiario(getDb(env.DB), sessao.user.id)
  },
)

export const definirResumoDiarioFn = createServerFn({ method: 'POST' })
  .validator(z.object({ ligado: z.boolean() }))
  .handler(async ({ data }) => {
    const sessao = await exigirPermissaoNaSessao('usar-estudio')
    await definirResumoDiario(getDb(env.DB), agora, {
      userId: sessao.user.id,
      ligado: data.ligado,
    })
  })
