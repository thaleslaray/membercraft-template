import { env } from 'cloudflare:workers'
import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { getDb } from '#/db/index'
import { avisarRespostaDaEquipe } from '#/lib/atendimento-cola'
import {
  exigirPermissaoNaSessao,
  pessoaLogadaNaSessao,
} from '#/lib/autorizacao'
import { agora } from '#/lib/relogio'
import {
  avisoDeAtendimentoLigado,
  cursosParaConversa,
  definirAvisoDeAtendimento,
  excluirConversa,
  filaDaEquipe,
  fioDoAluno,
  lerConversa,
  mandarNoFio,
  resolverConversa,
  responderComoEquipe,
} from '#/regras/atendimento'
import { podeFazer } from '#/regras/permissoes'
import type { Banco } from '#/regras/tipos'

const id = z.string().min(1).max(100)
// Gerada pela tela a cada formulário: o mesmo envio repetido (clique duplo) é a mesma mensagem.
const chave = z.string().min(8).max(100)
const anexos = z.array(z.string().min(1).max(300)).max(5).default([])

// Quem está logado, com o que o Atendimento precisa saber: se é da equipe.
async function pessoaDaSessao() {
  const { id, perfil } = await pessoaLogadaNaSessao()
  return { id, equipe: podeFazer(perfil, 'usar-estudio') }
}

// ---- Aluno ----

// A conversa com as mensagens. O aluno lê só a dele; a equipe lê qualquer uma.
export const conversaFn = createServerFn({ method: 'GET' })
  .validator(z.object({ conversaId: id }))
  .handler(async ({ data }) => {
    const pessoa = await pessoaDaSessao()
    return lerConversa(getDb(env.DB), data.conversaId, pessoa)
  })

// O fio da aluna: as mensagens de todas as conversas dela, em ordem, e os cursos para o campo opcional.
export const fioFn = createServerFn({ method: 'GET' }).handler(async () => {
  const pessoa = await pessoaDaSessao()
  const db = getDb(env.DB)
  const [mensagens, cursos] = await Promise.all([
    fioDoAluno(db, pessoa.id),
    cursosParaConversa(db, agora, pessoa.id),
  ])
  return { mensagens, cursos }
})

export const mandarNoFioFn = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      cursoId: id.nullable().optional(),
      texto: z.string().max(20000),
      anexos,
      chaveDeEnvio: chave,
    }),
  )
  .handler(async ({ data }) => {
    const pessoa = await pessoaDaSessao()
    return mandarNoFio(getDb(env.DB), agora, { userId: pessoa.id, ...data })
  })

// ---- Equipe ----

// A fila e o aviso não dependem um do outro: vão juntos (exportada para o teste de idas).
export async function carregarFilaDoAtendimento(
  db: Banco,
  userId: string,
  estado: 'aberta' | 'respondida' | 'resolvida',
) {
  const [fila, avisoLigado] = await Promise.all([
    filaDaEquipe(db, estado),
    avisoDeAtendimentoLigado(db, userId),
  ])
  return { ...fila, avisoLigado }
}

export const filaDoAtendimentoFn = createServerFn({ method: 'GET' })
  .validator(
    z.object({ estado: z.enum(['aberta', 'respondida', 'resolvida']) }),
  )
  .handler(async ({ data }) => {
    const sessao = await exigirPermissaoNaSessao('usar-estudio')
    return carregarFilaDoAtendimento(getDb(env.DB), sessao.user.id, data.estado)
  })

// Devolve um valor (a tela só esvazia a caixa de resposta se a chamada devolver algo: `undefined`
// quer dizer que deu erro). Exportada para o teste.
export async function enviarRespostaDaEquipe(
  db: Banco,
  entrada: Parameters<typeof responderComoEquipe>[2],
  ganchos: Parameters<typeof responderComoEquipe>[3] = {},
) {
  const resposta = await responderComoEquipe(db, agora, entrada, ganchos)
  return { enviada: true as const, conversaId: resposta.conversaId }
}

export const responderComoEquipeFn = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      conversaId: id,
      texto: z.string().max(20000),
      anexos,
      chaveDeEnvio: chave,
    }),
  )
  .handler(async ({ data }) => {
    const sessao = await exigirPermissaoNaSessao('usar-estudio')
    return enviarRespostaDaEquipe(
      getDb(env.DB),
      { equipeId: sessao.user.id, ...data },
      { aoResponderPelaEquipe: (r) => avisarRespostaDaEquipe(env, r) },
    )
  })

export const resolverConversaFn = createServerFn({ method: 'POST' })
  .validator(z.object({ conversaId: id }))
  .handler(async ({ data }) => {
    await exigirPermissaoNaSessao('usar-estudio')
    await resolverConversa(getDb(env.DB), agora, data.conversaId)
  })

export const excluirConversaFn = createServerFn({ method: 'POST' })
  .validator(z.object({ conversaId: id }))
  .handler(async ({ data }) => {
    await exigirPermissaoNaSessao('usar-estudio')
    await excluirConversa(getDb(env.DB), agora, data.conversaId)
  })

export const definirAvisoDeAtendimentoFn = createServerFn({ method: 'POST' })
  .validator(z.object({ ligado: z.boolean() }))
  .handler(async ({ data }) => {
    const sessao = await exigirPermissaoNaSessao('usar-estudio')
    await definirAvisoDeAtendimento(
      getDb(env.DB),
      agora,
      sessao.user.id,
      data.ligado,
    )
  })
