import { env } from 'cloudflare:workers'
import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { getDb } from '#/db/index'
import {
  exigirPermissaoNaSessao,
  pessoaLogadaNaSessao,
} from '#/lib/autorizacao'
import { fimDoDiaEmBrasilia, inicioDoDiaEmBrasilia } from '#/lib/datas'
import { agora } from '#/lib/relogio'
import { chaveDeImagemValida } from '#/regras/arquivos-de-conteudo'
import {
  criarBanner,
  editarBanner,
  excluirBanner,
  listarBannersDoPainel,
  pausarOuAtivar,
  registrarClique,
  registrarExibicao,
  reordenarBanners,
} from '#/regras/banners'
import { listarCursos } from '#/regras/conteudo'
import {
  LIMITE_DO_LINK_DO_BANNER,
  LIMITE_DO_TITULO_DO_BANNER,
} from '#/regras/formulario-do-banner'
import type { Banco } from '#/regras/tipos'

const id = z.string().min(1).max(100)
const data = z.string().max(10).optional()
const imagem = z
  .string()
  .max(300)
  .refine(chaveDeImagemValida, 'Imagem inválida.')

const dadosDoBanner = z.object({
  titulo: z.string().max(LIMITE_DO_TITULO_DO_BANNER),
  imagemComputador: imagem,
  imagemCelular: imagem.nullish(),
  link: z.string().max(LIMITE_DO_LINK_DO_BANNER).nullish(),
  publico: z.enum(['todos', 'com_matricula', 'sem_matricula']),
  cursoIds: z.array(id).max(200),
  ativo: z.boolean(),
  inicio: data,
  fim: data,
})

function paraARegra(d: z.infer<typeof dadosDoBanner>) {
  return {
    ...d,
    inicio: inicioDoDiaEmBrasilia(d.inicio),
    fim: fimDoDiaEmBrasilia(d.fim),
  }
}

// ---------- Aluno ----------

export const registrarExibicaoDoBannerFn = createServerFn({ method: 'POST' })
  .validator(z.object({ id }))
  .handler(async ({ data }) => {
    ;(await pessoaLogadaNaSessao()).id
    await registrarExibicao(getDb(env.DB), data.id)
  })

export const registrarCliqueDoBannerFn = createServerFn({ method: 'POST' })
  .validator(z.object({ id }))
  .handler(async ({ data }) => {
    ;(await pessoaLogadaNaSessao()).id
    await registrarClique(getDb(env.DB), data.id)
  })

// ---------- Painel da Equipe ----------

// Os banners e a lista de cursos não dependem um do outro: vão juntos (exportada para o teste de idas).
export async function carregarPainelDeBanners(db: Banco) {
  const [banners, cursos] = await Promise.all([
    listarBannersDoPainel(db, agora),
    listarCursos(db),
  ])
  return {
    banners,
    cursos: cursos.map((c) => ({ id: c.id, nome: c.nome })),
  }
}

export const painelDeBannersFn = createServerFn({ method: 'GET' }).handler(
  async () => {
    await exigirPermissaoNaSessao('usar-estudio')
    return carregarPainelDeBanners(getDb(env.DB))
  },
)

export const criarBannerFn = createServerFn({ method: 'POST' })
  .validator(dadosDoBanner)
  .handler(async ({ data }) => {
    await exigirPermissaoNaSessao('usar-estudio')
    await criarBanner(getDb(env.DB), paraARegra(data))
  })

export const editarBannerFn = createServerFn({ method: 'POST' })
  .validator(dadosDoBanner.extend({ id }))
  .handler(async ({ data: { id: bannerId, ...dados } }) => {
    await exigirPermissaoNaSessao('usar-estudio')
    await editarBanner(getDb(env.DB), bannerId, paraARegra(dados))
  })

export const pausarOuAtivarBannerFn = createServerFn({ method: 'POST' })
  .validator(z.object({ id, ativo: z.boolean() }))
  .handler(async ({ data }) => {
    await exigirPermissaoNaSessao('usar-estudio')
    await pausarOuAtivar(getDb(env.DB), data.id, data.ativo)
  })

export const excluirBannerFn = createServerFn({ method: 'POST' })
  .validator(z.object({ id }))
  .handler(async ({ data }) => {
    await exigirPermissaoNaSessao('usar-estudio')
    await excluirBanner(getDb(env.DB), agora, data.id)
  })

export const reordenarBannersFn = createServerFn({ method: 'POST' })
  .validator(z.object({ ids: z.array(id).max(500) }))
  .handler(async ({ data }) => {
    await exigirPermissaoNaSessao('usar-estudio')
    await reordenarBanners(getDb(env.DB), data.ids)
  })
