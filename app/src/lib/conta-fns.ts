// Server functions de Minha conta (aluno): dados, foto e o estado do tour.
import { env } from 'cloudflare:workers'
import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { getDb } from '#/db/index'
import { pessoaLogadaNaSessao, renovarSessaoNoCookie } from '#/lib/autorizacao'
import { agora } from '#/lib/relogio'
import {
  definirFoto,
  ErroDeMinhaConta,
  lerMinhaConta,
  marcarTourVisto,
  nomeDaFoto,
  PREFIXO_DA_FOTO,
  salvarMinhaConta,
  validarFoto,
} from '#/regras/minha-conta'

export const minhaContaFn = createServerFn({ method: 'GET' }).handler(
  async () => lerMinhaConta(getDb(env.DB), (await pessoaLogadaNaSessao()).id),
)

export const salvarMinhaContaFn = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      nome: z.string().max(200).optional(),
      telefone: z.string().max(40).nullable().optional(),
      fusoHorario: z.string().max(80).nullable().optional(),
      bio: z.string().max(2000).nullable().optional(),
      proximaAulaSozinha: z.boolean().optional(),
    }),
  )
  .handler(async ({ data }) => {
    try {
      const resultado = await salvarMinhaConta(
        getDb(env.DB),
        agora,
        (await pessoaLogadaNaSessao()).id,
        data,
      )
      await renovarSessaoNoCookie()
      return resultado
    } catch (e) {
      // Mensagem de regra (em pt-BR) chega à tela; o resto não vaza detalhe.
      if (e instanceof ErroDeMinhaConta) throw e
      throw new Error('Não foi possível salvar. Tente de novo.')
    }
  })

// Foto de perfil: pequena (até 2 MB), passa pelo Worker e fica no R2 em `fotos/<aluno>-<instante>.<ext>`.
export const enviarFotoFn = createServerFn({ method: 'POST' })
  .validator((dados: unknown) => {
    if (!(dados instanceof FormData)) throw new Error('Envio inválido.')
    const arquivo = dados.get('arquivo')
    if (!(arquivo instanceof File)) throw new Error('Nenhum arquivo enviado.')
    const motivo = validarFoto({ tipo: arquivo.type, tamanho: arquivo.size })
    if (motivo) throw new Error(motivo)
    return { arquivo }
  })
  .handler(async ({ data: { arquivo } }) => {
    const userId = (await pessoaLogadaNaSessao()).id
    const nome = nomeDaFoto(userId, arquivo.type, agora)
    await env.BUCKET.put(`fotos/${nome}`, await arquivo.arrayBuffer(), {
      httpMetadata: { contentType: arquivo.type },
    })
    await definirFoto(getDb(env.DB), agora, userId, `${PREFIXO_DA_FOTO}${nome}`)
    await renovarSessaoNoCookie()
    return { foto: `${PREFIXO_DA_FOTO}${nome}` }
  })

export const removerFotoFn = createServerFn({ method: 'POST' }).handler(
  async () => {
    await definirFoto(
      getDb(env.DB),
      agora,
      (await pessoaLogadaNaSessao()).id,
      null,
    )
    await renovarSessaoNoCookie()
  },
)

// Terminou ou pulou o tour: não abre mais sozinho.
export const marcarTourVistoFn = createServerFn({ method: 'POST' }).handler(
  async () => {
    await marcarTourVisto(
      getDb(env.DB),
      agora,
      (await pessoaLogadaNaSessao()).id,
    )
    await renovarSessaoNoCookie()
  },
)
