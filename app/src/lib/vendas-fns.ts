import { env } from 'cloudflare:workers'
import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { getDb } from '#/db/index'
import type { Gateway } from '#/db/schema'
import { exigirPermissaoNaSessao } from '#/lib/autorizacao'
import { avisarCursosLiberados } from '#/lib/email-cola'
import { alertarAvisoComErro } from '#/lib/fila-voomp'
import { agora } from '#/lib/relogio'
import { definirVoompLigada } from '#/regras/configuracao-da-area'
import { contarVendasSemTurma } from '#/regras/filas'
import { listarTurmas } from '#/regras/matricula'
import { podeFazer, tratarPerfil } from '#/regras/permissoes'
import type { Banco } from '#/regras/tipos'
import {
  atualizarLigacao,
  ligarProduto,
  listarAvisos,
  listarLigacoes,
  processarAviso,
  produtosVistos,
  removerLigacao,
  type SituacaoDoAviso,
} from '#/regras/vendas'
import { situacaoDaVoomp } from '#/regras/voomp-em-uso'

const id = z.string().min(1).max(100)

// Avisos, contagem, ligações, produtos e turmas não dependem uns dos outros: vão juntos (exportada para
// o teste de idas).
export async function carregarVendasDaVoomp(
  db: Banco,
  podeLigar: boolean,
  filtro: {
    situacao?: SituacaoDoAviso
    gateway?: Gateway
    pagina?: number
  },
) {
  const [avisos, semTurma, ligacoes, produtos, turmas, voomp] =
    await Promise.all([
      listarAvisos(db, {
        situacao: filtro.situacao,
        gateway: filtro.gateway,
        pagina: filtro.pagina,
      }),
      contarVendasSemTurma(db),
      podeLigar ? listarLigacoes(db) : [],
      podeLigar ? produtosVistos(db) : [],
      podeLigar ? listarTurmas(db) : [],
      situacaoDaVoomp(db),
    ])
  return {
    avisos,
    semTurma,
    podeLigar,
    voompEmUso: voomp.emUso,
    ligacoes,
    turmas,
    produtos: produtos.map((p) => ({
      produtoId: p.produtoId,
      produtoNome: p.produtoNome,
      ofertaHash: p.ofertaHash,
      semTurma: Number(p.semTurma),
    })),
  }
}

// A tela Vendas da Voomp é da Equipe (`gerir-matriculas`); as ligações só o Proprietário mexe
// (`ligar-produto-da-voomp`) e só ele recebe a lista delas.
export const vendasDaVoompFn = createServerFn({ method: 'GET' })
  .validator(
    z.object({
      situacao: z
        .enum(['recebida', 'aplicada', 'sem_turma', 'ignorada', 'com_erro'])
        .optional(),
      gateway: z.enum(['voomp', 'hotmart']).optional(),
      pagina: z.number().int().min(1).optional(),
    }),
  )
  .handler(async ({ data }) => {
    const sessao = await exigirPermissaoNaSessao('gerir-matriculas')
    const podeLigar = podeFazer(
      tratarPerfil(sessao.user.perfil),
      'ligar-produto-da-voomp',
    )
    return carregarVendasDaVoomp(getDb(env.DB), podeLigar, data)
  })

export const reprocessarVendaFn = createServerFn({ method: 'POST' })
  .validator(z.object({ id }))
  .handler(async ({ data }) => {
    await exigirPermissaoNaSessao('gerir-matriculas')
    return processarAviso(getDb(env.DB), agora, data.id, {
      aoLiberarCursos: (eventos) => avisarCursosLiberados(env, eventos),
      aoComErro: alertarAvisoComErro,
    })
  })

export const ligarProdutoFn = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      produtoId: z.string().max(100),
      ofertaHash: z.string().max(100).optional(),
      turmaId: id,
      prazoEmDias: z.number().int().nullish(),
    }),
  )
  .handler(async ({ data }) => {
    await exigirPermissaoNaSessao('ligar-produto-da-voomp')
    return ligarProduto(getDb(env.DB), agora, data)
  })

export const removerLigacaoFn = createServerFn({ method: 'POST' })
  .validator(z.object({ id }))
  .handler(async ({ data }) => {
    await exigirPermissaoNaSessao('ligar-produto-da-voomp')
    await removerLigacao(getDb(env.DB), data.id)
  })

export const atualizarLigacaoFn = createServerFn({ method: 'POST' })
  .validator(
    z.object({ id, turmaId: id, prazoEmDias: z.number().int().nullish() }),
  )
  .handler(async ({ data }) => {
    await exigirPermissaoNaSessao('ligar-produto-da-voomp')
    await atualizarLigacao(getDb(env.DB), data.id, data)
  })

// Cartão da Voomp na aba Plataformas: só o Proprietário. `emUso` junta o interruptor, os avisos e as ligações.
export const voompDaAreaFn = createServerFn({ method: 'GET' }).handler(
  async () => {
    await exigirPermissaoNaSessao('gerir-credenciais-da-hotmart')
    return situacaoDaVoomp(getDb(env.DB))
  },
)

export const usarVoompFn = createServerFn({ method: 'POST' })
  .validator(z.object({ ligada: z.boolean() }))
  .handler(async ({ data }) => {
    const sessao = await exigirPermissaoNaSessao('gerir-credenciais-da-hotmart')
    await definirVoompLigada(getDb(env.DB), agora, data.ligada, sessao.user.id)
  })
