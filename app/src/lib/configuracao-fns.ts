import { env } from 'cloudflare:workers'
import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { getDb } from '#/db/index'
import {
  exigirPermissaoNaSessao,
  pessoaLogadaNaSessao,
} from '#/lib/autorizacao'
import { boasVindasDoAluno } from '#/regras/boas-vindas'
import {
  lerConfiguracaoDaArea,
  salvarConfiguracaoDaArea,
} from '#/regras/configuracao-da-area'

// Pública de propósito: os Termos, a privacidade e o contato de suporte valem para todos,
// inclusive para quem ainda não entrou.
export const getConfiguracaoDaAreaFn = createServerFn({
  method: 'GET',
}).handler(async () => {
  // O endereço do vídeo de boas-vindas (pode ter hash de vídeo não listado) não sai na leitura pública.
  const { boasVindasVimeo: _, ...publica } = await lerConfiguracaoDaArea(
    getDb(env.DB),
  )
  return publica
})

// A configuração inteira, para o formulário do Estúdio: só o Proprietário lê.
export const getConfiguracaoDoEstudioFn = createServerFn({
  method: 'GET',
}).handler(async () => {
  await exigirPermissaoNaSessao('configurar-area')
  return lerConfiguracaoDaArea(getDb(env.DB))
})

// Vídeo de boas-vindas para quem está logado: o endereço e se abre sozinho neste acesso.
export const getBoasVindasFn = createServerFn({ method: 'GET' }).handler(
  async () =>
    boasVindasDoAluno(getDb(env.DB), (await pessoaLogadaNaSessao()).id),
)

// Só o Proprietário edita (ação sensível `configurar-area`, #37).
export const salvarConfiguracaoDaAreaFn = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      termosTexto: z.string().max(100_000).optional(),
      privacidadeTexto: z.string().max(100_000).optional(),
      suporteEmail: z.string().max(254).optional(),
      boasVindasVimeo: z.string().max(2000).optional(),
      exigirNovoAceite: z.boolean().optional(),
    }),
  )
  .handler(async ({ data }) => {
    const sessao = await exigirPermissaoNaSessao('configurar-area')
    return salvarConfiguracaoDaArea(
      getDb(env.DB),
      () => new Date(),
      data,
      sessao.user.id,
    )
  })
