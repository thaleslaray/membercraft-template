import { env } from 'cloudflare:workers'
import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { getDb } from '#/db/index'
import { abrirConversaPelaEquipeEAvisar } from '#/lib/atendimento-cola'
import { exigirPermissaoNaSessao } from '#/lib/autorizacao'
import { ganchosDoPedidoDoMec } from '#/lib/pedido-do-mec-cola'
import { agora } from '#/lib/relogio'
import {
  LIMITE_DO_LINK,
  LIMITE_DO_MOTIVO,
  listarPedidos,
  marcarLiberado,
  marcarProblema,
  tentarDeNovo,
} from '#/regras/pedido-do-mec'
import { tratarPerfil } from '#/regras/permissoes'

const id = z.string().min(1).max(100)

// Fila "Certificado do MEC" do painel.
export const pedidosDoMecFn = createServerFn({ method: 'GET' })
  .validator(
    z.object({
      estado: z.enum(['na_fila', 'problema', 'liberado']),
      pagina: z.number().int().min(1).max(10_000).optional(),
    }),
  )
  .handler(async ({ data }) => {
    await exigirPermissaoNaSessao('usar-estudio')
    return listarPedidos(getDb(env.DB), agora, data)
  })

async function equipeLogada() {
  const sessao = await exigirPermissaoNaSessao('usar-estudio')
  return { equipeId: sessao.user.id, perfil: tratarPerfil(sessao.user.perfil) }
}

export const liberarPedidoDoMecFn = createServerFn({ method: 'POST' })
  .validator(
    z.object({ pedidoId: id, link: z.string().max(LIMITE_DO_LINK + 100) }),
  )
  .handler(async ({ data }) => {
    const autoria = await equipeLogada()
    await marcarLiberado(
      getDb(env.DB),
      agora,
      { ...autoria, ...data },
      ganchosDoPedidoDoMec(env),
    )
    return true
  })

export const problemaNoPedidoDoMecFn = createServerFn({ method: 'POST' })
  .validator(
    z.object({ pedidoId: id, motivo: z.string().max(LIMITE_DO_MOTIVO + 100) }),
  )
  .handler(async ({ data }) => {
    const autoria = await equipeLogada()
    const conversaId = await marcarProblema(
      getDb(env.DB),
      agora,
      { ...autoria, ...data },
      (entrada) => abrirConversaPelaEquipeEAvisar(env, entrada),
    )
    return { conversaId }
  })

export const tentarDeNovoPedidoDoMecFn = createServerFn({ method: 'POST' })
  .validator(z.object({ pedidoId: id }))
  .handler(async ({ data }) => {
    const autoria = await equipeLogada()
    await tentarDeNovo(getDb(env.DB), agora, { ...autoria, ...data })
    return true
  })
