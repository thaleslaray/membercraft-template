// Server functions dos e-mails: histórico e reenvio de acesso (Equipe), textos e prévia
// (Proprietário), interruptores de Minha conta (aluno) e descadastro por link (público).
import { env } from 'cloudflare:workers'
import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { getDb } from '#/db/index'
import { exigirPermissaoNaSessao } from '#/lib/autorizacao'
import { pedirEmail } from '#/lib/email-cola'
import { agora } from '#/lib/relogio'
import { getRequestSession } from '#/lib/request-session'
import { descadastroValido } from '#/regras/descadastro'
import { ErroDeEmail, modeloDe, primeiroNome } from '#/regras/email-modelos'
import {
  alunoParaEmail,
  definirPreferenciaDeEmail,
  historicoDeEmails,
  listarTextosDeEmail,
  preferenciasDeEmail,
  previaDeTexto,
  restaurarTextoDeEmail,
  salvarTextoDeEmail,
} from '#/regras/envio-de-email'

const id = z.string().min(1).max(100)
const tipo = z.string().min(1).max(60)
const texto = z.object({
  tipo,
  assunto: z.string().max(400),
  corpo: z.string().max(10_000),
})

// ---------- Equipe: perfil do aluno ----------

export const historicoDeEmailsFn = createServerFn({ method: 'GET' })
  .validator(z.object({ alunoId: id }))
  .handler(async ({ data }) => {
    await exigirPermissaoNaSessao('gerir-matriculas')
    return historicoDeEmails(getDb(env.DB), data.alunoId)
  })

// "Não recebi": manda de novo o e-mail "Seu acesso está pronto", com um link de entrada novo.
export const reenviarAcessoFn = createServerFn({ method: 'POST' })
  .validator(z.object({ alunoId: id }))
  .handler(async ({ data }) => {
    await exigirPermissaoNaSessao('gerir-matriculas')
    const aluno = await alunoParaEmail(getDb(env.DB), data.alunoId)
    if (!aluno) throw new Error('Aluno não encontrado.')
    const pedido = await pedirEmail(env, {
      tipo: 'acesso-pronto',
      para: aluno.email,
      userId: aluno.id,
      variaveis: { nome: primeiroNome(aluno.nome) },
    })
    if (!pedido)
      throw new Error('Não deu para pôr o e-mail na fila. Tente de novo.')
  })

// ---------- Proprietário: textos ----------

export const textosDeEmailFn = createServerFn({ method: 'GET' }).handler(
  async () => {
    await exigirPermissaoNaSessao('configurar-area')
    return listarTextosDeEmail(getDb(env.DB))
  },
)

export const salvarTextoDeEmailFn = createServerFn({ method: 'POST' })
  .validator(texto)
  .handler(async ({ data }) => {
    const sessao = await exigirPermissaoNaSessao('configurar-area')
    await salvarTextoDeEmail(getDb(env.DB), agora, {
      ...data,
      autorId: sessao.user.id,
    })
  })

export const restaurarTextoDeEmailFn = createServerFn({ method: 'POST' })
  .validator(z.object({ tipo }))
  .handler(async ({ data }) => {
    await exigirPermissaoNaSessao('configurar-area')
    await restaurarTextoDeEmail(getDb(env.DB), data.tipo)
  })

export const previaDeEmailFn = createServerFn({ method: 'POST' })
  .validator(texto)
  .handler(async ({ data }) => {
    await exigirPermissaoNaSessao('configurar-area')
    return previaDeTexto(data.tipo, data)
  })

// ---------- Aluno: Minha conta ----------

async function alunoDaSessao() {
  const sessao = await getRequestSession()
  if (!sessao) throw new Error('Entre para continuar.')
  return sessao.user.id
}

export const preferenciasDeEmailFn = createServerFn({ method: 'GET' }).handler(
  async () => preferenciasDeEmail(getDb(env.DB), await alunoDaSessao()),
)

export const definirPreferenciaDeEmailFn = createServerFn({ method: 'POST' })
  .validator(z.object({ tipo, ativo: z.boolean() }))
  .handler(async ({ data }) => {
    await definirPreferenciaDeEmail(getDb(env.DB), agora, {
      userId: await alunoDaSessao(),
      ...data,
    })
  })

// ---------- Público: descadastro por link ----------

const linkDeDescadastro = z.object({ u: id, t: tipo, s: z.string().max(200) })

async function conferirLink(dados: z.infer<typeof linkDeDescadastro>) {
  const modelo = modeloDe(dados.t)
  if (
    !modelo.descadastro ||
    !(await descadastroValido(
      env.BETTER_AUTH_SECRET,
      dados.u,
      dados.t,
      dados.s,
    ))
  ) {
    throw new ErroDeEmail('Este link de descadastro não é válido.')
  }
  return modelo
}

export const situacaoDoDescadastroFn = createServerFn({ method: 'GET' })
  .validator(linkDeDescadastro)
  .handler(async ({ data }) => {
    try {
      const modelo = await conferirLink(data)
      const prefs = await preferenciasDeEmail(getDb(env.DB), data.u)
      return {
        valido: true as const,
        nome: modelo.nome,
        ativo: prefs.find((p) => p.tipo === modelo.tipo)?.ativo ?? true,
      }
    } catch {
      return { valido: false as const }
    }
  })

export const descadastrarFn = createServerFn({ method: 'POST' })
  .validator(linkDeDescadastro)
  .handler(async ({ data }) => {
    await conferirLink(data)
    await definirPreferenciaDeEmail(getDb(env.DB), agora, {
      userId: data.u,
      tipo: data.t,
      ativo: false,
    })
  })
