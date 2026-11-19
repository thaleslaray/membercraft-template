import { env } from 'cloudflare:workers'
import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { themeIds } from '#/config/themes'
import { getDb } from '#/db'
import { exigirPermissaoNaSessao } from '#/lib/autorizacao'
import {
  type DadosDeAparencia,
  lerAparencia,
  PREFIXO_DE_ARQUIVO,
  restaurarPadrao,
  salvarAparencia,
} from '#/regras/aparencia'
import {
  ehCampoDeImagem,
  nomeDoArquivo,
  validarImagem,
} from '#/regras/aparencia-imagem'

// Pública de propósito: a aparência vale para todos, inclusive na tela de entrar.
export const getAparenciaFn = createServerFn({ method: 'GET' }).handler(
  async () => lerAparencia(getDb(env.DB)),
)

// Só o Proprietário mexe na aparência (ação sensível `configurar-area`, #37).
const exigirProprietario = () => exigirPermissaoNaSessao('configurar-area')

const url = z.string().max(300).nullable()
const dadosSchema = z.object({
  tema: z.enum(themeIds).optional(),
  casca: z.enum(['classica', 'lume']).optional(),
  mostrarComunidade: z.boolean().optional(),
  corDaMarca: z.string().max(7).nullable().optional(),
  logoUrl: url.optional(),
  faviconUrl: url.optional(),
  fundoDoMenuUrl: url.optional(),
  fundoDoLoginUrl: url.optional(),
})

export const salvarAparenciaFn = createServerFn({ method: 'POST' })
  .validator((dados: unknown): DadosDeAparencia => dadosSchema.parse(dados))
  .handler(async ({ data }) => {
    const session = await exigirProprietario()
    return salvarAparencia(
      getDb(env.DB),
      () => new Date(),
      data,
      session.user.id,
    )
  })

export const restaurarAparenciaFn = createServerFn({
  method: 'POST',
}).handler(async () => {
  const session = await exigirProprietario()
  return restaurarPadrao(getDb(env.DB), () => new Date(), session.user.id)
})

// Recebe uma imagem (logo, favicon ou fundo), guarda no R2 e devolve a URL que a área serve
// (src/routes/api/aparencia/$.ts). Imagens são pequenas (até 5 MB): passam pelo Worker.
export const enviarImagemFn = createServerFn({ method: 'POST' })
  .validator((dados: unknown) => {
    if (!(dados instanceof FormData)) throw new Error('Envio inválido.')
    const campo = dados.get('campo')
    const arquivo = dados.get('arquivo')
    if (!ehCampoDeImagem(campo))
      throw new Error('Campo de imagem desconhecido.')
    if (!(arquivo instanceof File)) throw new Error('Nenhum arquivo enviado.')
    const motivo = validarImagem({ tipo: arquivo.type, tamanho: arquivo.size })
    if (motivo) throw new Error(motivo)
    return { campo, arquivo }
  })
  .handler(async ({ data: { campo, arquivo } }) => {
    await exigirProprietario()
    const nome = nomeDoArquivo(campo, arquivo.type, () => new Date())
    await env.BUCKET.put(`aparencia/${nome}`, await arquivo.arrayBuffer(), {
      httpMetadata: { contentType: arquivo.type },
    })
    return { campo, url: `${PREFIXO_DE_ARQUIVO}${nome}` }
  })
