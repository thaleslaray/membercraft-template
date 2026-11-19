import { env } from 'cloudflare:workers'
import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { getDb } from '#/db/index'
import {
  exigirPermissaoNaSessao,
  pessoaLogadaNaSessao,
} from '#/lib/autorizacao'
import { ganchosDaMelhorRespostaComCertificado } from '#/lib/certificados-cola'
import { escritaLimitada, MENSAGEM_DE_ESCRITA_LIMITADA } from '#/lib/rate-limit'
import { agora } from '#/lib/relogio'
import { LIMITE_DO_ANEXO } from '#/regras/anexos-da-comunidade'
import {
  CORES_DA_COMUNIDADE,
  comunidadesVisiveis,
  contarPublicacoesPorComunidade,
  criarComunidade,
  ErroDeComunidade,
  editarComunidade,
  excluirComunidade,
  ICONES_DA_COMUNIDADE,
  listarComunidades,
  podePublicar,
} from '#/regras/comunidades'
import { listarTurmas } from '#/regras/matricula'
import {
  bloquearComentarios,
  comentar,
  contarNaoLidas,
  criarPublicacao,
  definirSeguidor,
  desfazerMelhorResposta,
  editarComentario,
  editarPublicacao,
  escolherMelhorResposta,
  estornarMelhoresRespostasDaComunidade,
  excluirComentario,
  excluirPublicacao,
  fixarPublicacao,
  listarAguardandoResposta,
  listarComentariosRecentes,
  listarPublicacoes,
  marcarComoVista,
  obterPublicacao,
} from '#/regras/publicacoes'
import type { Banco } from '#/regras/tipos'

const id = z.string().min(1).max(100)
const chaveDeEnvio = z.string().min(8).max(100)

const anexo = z.object({
  chave: z.string().min(1).max(300),
  nome: z.string().min(1).max(300),
  tipo: z.string().max(200),
  tamanho: z
    .number()
    .int()
    .min(0)
    .max(LIMITE_DO_ANEXO * 2),
})
type AnexoDoPedido = z.infer<typeof anexo>

// O tamanho e o tipo vêm do que o R2 guardou, não do que a tela disse. Anexo que não existe no R2
// (ou que passa de 10 MB) é recusado pela regra.
async function anexosConferidos(anexos: AnexoDoPedido[]) {
  return Promise.all(
    anexos.map(async (a) => {
      const objeto = await env.BUCKET.head(a.chave)
      return {
        ...a,
        tamanho: objeto?.size ?? 0,
        tipo: objeto?.httpMetadata?.contentType ?? a.tipo,
      }
    }),
  )
}

// ---------- Aluno (e Equipe lendo e participando) ----------

// As comunidades que a pessoa enxerga, para o menu lateral, e o que ela pode fazer.
export const comunidadesFn = createServerFn({ method: 'GET' }).handler(
  async () => {
    const pessoa = await pessoaLogadaNaSessao()
    const db = getDb(env.DB)
    const [comunidades, naoLidas] = await Promise.all([
      comunidadesVisiveis(db, agora, pessoa),
      contarNaoLidas(db, agora, pessoa),
    ])
    return {
      naoLidas,
      comunidades: comunidades.map((c) => ({
        ...c,
        podePublicar: podePublicar(pessoa, c),
      })),
    }
  },
)

const filtros = z.object({
  visao: z.enum(['inicio', 'nao-lidas', 'minhas']),
  comunidadeId: id.optional(),
  status: z.enum(['todas', 'em-aberto', 'sem-resposta', 'resolvidas']),
  ordem: z.enum(['mais-ativas', 'mais-recentes']),
  busca: z.string().max(100).optional(),
  pagina: z.number().int().min(1).max(10_000),
})

export const publicacoesFn = createServerFn({ method: 'GET' })
  .validator(filtros)
  .handler(async ({ data }) => {
    const pessoa = await pessoaLogadaNaSessao()
    return listarPublicacoes(getDb(env.DB), agora, pessoa, data)
  })

// Abrir a publicação marca como lida (a contagem de "Não lidas" cai).
export const publicacaoFn = createServerFn({ method: 'GET' })
  .validator(z.object({ id, pagina: z.number().int().min(1).max(10_000) }))
  .handler(async ({ data }) => {
    const pessoa = await pessoaLogadaNaSessao()
    const db = getDb(env.DB)
    const publicacao = await obterPublicacao(
      db,
      agora,
      pessoa,
      data.id,
      data.pagina,
    )
    if (publicacao) await marcarComoVista(db, agora, pessoa.id, data.id)
    return publicacao
  })

async function exigirEscritaLivre(userId: string): Promise<void> {
  if (await escritaLimitada(userId)) {
    throw new ErroDeComunidade(MENSAGEM_DE_ESCRITA_LIMITADA)
  }
}

export const criarPublicacaoFn = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      comunidadeId: id,
      titulo: z.string().max(500),
      textoHtml: z.string().max(100_000),
      anexos: z.array(anexo).max(10),
      chaveDeEnvio,
    }),
  )
  .handler(async ({ data }) => {
    const pessoa = await pessoaLogadaNaSessao()
    await exigirEscritaLivre(pessoa.id)
    return criarPublicacao(getDb(env.DB), agora, pessoa, {
      ...data,
      anexos: await anexosConferidos(data.anexos),
    })
  })

export const editarPublicacaoFn = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      id,
      titulo: z.string().max(500),
      textoHtml: z.string().max(100_000),
      anexos: z.array(anexo).max(10),
    }),
  )
  .handler(async ({ data }) => {
    const pessoa = await pessoaLogadaNaSessao()
    const { id: publicacaoId, ...resto } = data
    await editarPublicacao(getDb(env.DB), agora, pessoa, publicacaoId, {
      ...resto,
      anexos: await anexosConferidos(resto.anexos),
    })
  })

export const excluirPublicacaoFn = createServerFn({ method: 'POST' })
  .validator(z.object({ id }))
  .handler(async ({ data }) => {
    const pessoa = await pessoaLogadaNaSessao()
    await excluirPublicacao(
      getDb(env.DB),
      agora,
      pessoa,
      data.id,
      ganchosDaMelhorRespostaComCertificado,
    )
  })

export const fixarPublicacaoFn = createServerFn({ method: 'POST' })
  .validator(z.object({ id, fixada: z.boolean() }))
  .handler(async ({ data }) => {
    const pessoa = await pessoaLogadaNaSessao()
    await fixarPublicacao(getDb(env.DB), agora, pessoa, data.id, data.fixada)
  })

export const bloquearComentariosFn = createServerFn({ method: 'POST' })
  .validator(z.object({ id, bloqueados: z.boolean() }))
  .handler(async ({ data }) => {
    const pessoa = await pessoaLogadaNaSessao()
    await bloquearComentarios(
      getDb(env.DB),
      agora,
      pessoa,
      data.id,
      data.bloqueados,
    )
  })

export const comentarFn = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      publicacaoId: id,
      paiId: id.nullish(),
      texto: z.string().max(10_000),
      chaveDeEnvio,
    }),
  )
  .handler(async ({ data }) => {
    const pessoa = await pessoaLogadaNaSessao()
    await exigirEscritaLivre(pessoa.id)
    return comentar(getDb(env.DB), agora, pessoa, data)
  })

export const editarComentarioFn = createServerFn({ method: 'POST' })
  .validator(z.object({ id, texto: z.string().max(10_000) }))
  .handler(async ({ data }) => {
    const pessoa = await pessoaLogadaNaSessao()
    await editarComentario(getDb(env.DB), agora, pessoa, data.id, data.texto)
  })

export const excluirComentarioFn = createServerFn({ method: 'POST' })
  .validator(z.object({ id }))
  .handler(async ({ data }) => {
    const pessoa = await pessoaLogadaNaSessao()
    await excluirComentario(
      getDb(env.DB),
      agora,
      pessoa,
      data.id,
      ganchosDaMelhorRespostaComCertificado,
    )
  })

export const melhorRespostaFn = createServerFn({ method: 'POST' })
  .validator(z.object({ publicacaoId: id, comentarioId: id.nullable() }))
  .handler(async ({ data }) => {
    const pessoa = await pessoaLogadaNaSessao()
    const db = getDb(env.DB)
    if (data.comentarioId) {
      await escolherMelhorResposta(
        db,
        agora,
        pessoa,
        data.publicacaoId,
        data.comentarioId,
        ganchosDaMelhorRespostaComCertificado,
      )
    } else {
      await desfazerMelhorResposta(
        db,
        agora,
        pessoa,
        data.publicacaoId,
        ganchosDaMelhorRespostaComCertificado,
      )
    }
  })

export const seguirPublicacaoFn = createServerFn({ method: 'POST' })
  .validator(z.object({ id, situacao: z.enum(['seguindo', 'silenciada']) }))
  .handler(async ({ data }) => {
    const pessoa = await pessoaLogadaNaSessao()
    await definirSeguidor(getDb(env.DB), agora, pessoa, data.id, data.situacao)
  })

// ---------- Painel da Equipe ----------

const entradaDaComunidade = z.object({
  nome: z.string().max(200),
  descricao: z.string().max(1000).nullish(),
  icone: z.enum(ICONES_DA_COMUNIDADE),
  cor: z.enum(CORES_DA_COMUNIDADE),
  soEquipePublica: z.boolean(),
  turmaIds: z.array(id).max(200),
})

// Comunidades, contagens e turmas não dependem umas das outras: vão juntas (exportada para o teste de idas).
export async function carregarPainelDeComunidades(db: Banco) {
  const [comunidades, publicacoes, turmas] = await Promise.all([
    listarComunidades(db),
    contarPublicacoesPorComunidade(db),
    listarTurmas(db),
  ])
  return {
    comunidades: comunidades.map((c) => ({
      ...c,
      publicacoes: publicacoes[c.id] ?? 0,
    })),
    turmas: turmas.map((t) => ({
      id: t.id,
      nome: t.nome,
      cursoNome: t.cursoNome,
    })),
  }
}

export const painelDeComunidadesFn = createServerFn({ method: 'GET' }).handler(
  async () => {
    await exigirPermissaoNaSessao('usar-estudio')
    return carregarPainelDeComunidades(getDb(env.DB))
  },
)

export const salvarComunidadeFn = createServerFn({ method: 'POST' })
  .validator(z.object({ id: id.nullable(), dados: entradaDaComunidade }))
  .handler(async ({ data }) => {
    await exigirPermissaoNaSessao('usar-estudio')
    const db = getDb(env.DB)
    if (data.id) await editarComunidade(db, data.id, data.dados)
    else await criarComunidade(db, data.dados)
  })

export const excluirComunidadeFn = createServerFn({ method: 'POST' })
  .validator(z.object({ id }))
  .handler(async ({ data }) => {
    await exigirPermissaoNaSessao('usar-estudio')
    const db = getDb(env.DB)
    // Primeiro os pontos das melhores respostas, enquanto as publicações ainda existem.
    await estornarMelhoresRespostasDaComunidade(
      db,
      agora,
      data.id,
      ganchosDaMelhorRespostaComCertificado,
    )
    await excluirComunidade(db, agora, data.id)
  })

const pagina = z.object({ pagina: z.number().int().min(1).max(10_000) })

export const aguardandoRespostaFn = createServerFn({ method: 'GET' })
  .validator(pagina)
  .handler(async ({ data }) => {
    await exigirPermissaoNaSessao('usar-estudio')
    return listarAguardandoResposta(getDb(env.DB), data.pagina)
  })

export const comentariosRecentesFn = createServerFn({ method: 'GET' })
  .validator(pagina)
  .handler(async ({ data }) => {
    await exigirPermissaoNaSessao('usar-estudio')
    return listarComentariosRecentes(getDb(env.DB), data.pagina)
  })
