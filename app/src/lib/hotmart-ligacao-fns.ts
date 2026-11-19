import { env } from 'cloudflare:workers'
import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { getDb } from '#/db/index'
import { exigirPermissaoNaSessao } from '#/lib/autorizacao'
import { clienteDaHotmart } from '#/lib/hotmart-cliente'
import { agora } from '#/lib/relogio'
import { ErroDaHotmart } from '#/regras/hotmart-api'
import {
  listarOfertasDaHotmart,
  listarProdutosDaHotmart,
  type ProdutoDaHotmart,
} from '#/regras/hotmart-catalogo'
import {
  carregarLiberacaoDaHotmart,
  desmarcarCursoNaOferta,
  marcarCursoNaOferta,
} from '#/regras/liberacao-por-produto'

const id = z.string().min(1).max(100)

function mensagemDeErro(e: unknown): string {
  if (e instanceof ErroDaHotmart) return e.message
  return 'Não foi possível consultar a Hotmart. Confira as credenciais e tente de novo.'
}

// Produtos da Hotmart (catálogo da API): só o Proprietário (`ligar-produto-da-hotmart`). Sem credencial, a tela
// explica e aponta para Vendas; com a API fora do ar, o erro aparece no lugar da lista de produtos.
async function catalogoDaHotmart(db: ReturnType<typeof getDb>) {
  const cliente = await clienteDaHotmart(db).catch(() => 'ilegivel' as const)
  let produtos: ProdutoDaHotmart[] = []
  let situacao: 'sem-credencial' | 'erro' | 'ok' = 'ok'
  let erro: string | null = null
  if (cliente === 'ilegivel' || !cliente) {
    situacao = 'sem-credencial'
  } else {
    try {
      produtos = await listarProdutosDaHotmart(cliente)
    } catch (e) {
      situacao = 'erro'
      erro = mensagemDeErro(e)
    }
  }
  return { produtos, situacao, erro }
}

// Vendas › Produtos: produtos da Hotmart, cursos e o que cada produto/oferta libera.
export const liberacaoDaHotmartFn = createServerFn({ method: 'GET' }).handler(
  async () => {
    await exigirPermissaoNaSessao('ligar-produto-da-hotmart')
    const db = getDb(env.DB)
    const [liberacao, catalogo] = await Promise.all([
      carregarLiberacaoDaHotmart(db),
      catalogoDaHotmart(db),
    ])
    return { ...liberacao, ...catalogo }
  },
)

// Aba Quem compra do curso: nomes dos produtos.
export const produtosDaHotmartFn = createServerFn({ method: 'GET' }).handler(
  async () => {
    await exigirPermissaoNaSessao('ligar-produto-da-hotmart')
    return catalogoDaHotmart(getDb(env.DB))
  },
)

export const ofertasDaHotmartFn = createServerFn({ method: 'POST' })
  .validator(z.object({ ucode: id }))
  .handler(async ({ data }) => {
    await exigirPermissaoNaSessao('ligar-produto-da-hotmart')
    const cliente = await clienteDaHotmart(getDb(env.DB))
    if (!cliente) {
      return { ofertas: [], erro: 'Salve as credenciais da Hotmart antes.' }
    }
    try {
      return {
        ofertas: await listarOfertasDaHotmart(cliente, data.ucode),
        erro: null,
      }
    } catch (e) {
      return { ofertas: [], erro: mensagemDeErro(e) }
    }
  })

const entradaDoCurso = z.object({
  produtoId: z.string().min(1).max(100),
  /** Vazio: "Qualquer oferta". */
  ofertaHash: z.string().max(100).optional(),
  cursoId: id,
})

// Marcar/desmarcar um CURSO num produto (e oferta): o dono nunca escolhe turma. O prazo vale o da turma.
export const marcarCursoNaOfertaFn = createServerFn({ method: 'POST' })
  .validator(entradaDoCurso)
  .handler(async ({ data }) => {
    await exigirPermissaoNaSessao('ligar-produto-da-hotmart')
    await marcarCursoNaOferta(getDb(env.DB), agora, data)
  })

export const desmarcarCursoNaOfertaFn = createServerFn({ method: 'POST' })
  .validator(entradaDoCurso)
  .handler(async ({ data }) => {
    await exigirPermissaoNaSessao('ligar-produto-da-hotmart')
    await desmarcarCursoNaOferta(getDb(env.DB), data)
  })
