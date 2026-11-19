import { env } from 'cloudflare:workers'
import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { getDb } from '#/db/index'
import { exigirPermissaoNaSessao, type PessoaLogada } from '#/lib/autorizacao'
import { paraATela, situacoesDaPessoa } from '#/lib/liberacao'
import { agora } from '#/lib/relogio'
import { semOcultos } from '#/regras/acesso'
import { acessoDaPessoa, podeAcessarCurso } from '#/regras/acesso-ao-curso'
import {
  chaveDeImagemValida,
  chaveDeMaterialValida,
} from '#/regras/arquivos-de-conteudo'
import { LIBERADO } from '#/regras/cadeado'
import {
  agruparVitrine,
  anexarMaterial,
  carregarDadosDaVitrine,
  criarAula,
  criarCategoria,
  criarCurso,
  criarModulo,
  editarAula,
  editarCategoria,
  editarCurso,
  editarModulo,
  excluirAula,
  excluirCategoria,
  excluirCurso,
  excluirMaterial,
  excluirModulo,
  listarCategorias,
  listarCursos,
  obterAula,
  obterCurso,
  obterIndiceDoCurso,
  reordenar,
} from '#/regras/conteudo'
import {
  LIMITE_DA_CARGA_HORARIA,
  LIMITE_DO_NOME,
} from '#/regras/formulario-do-curso'
import type { Banco } from '#/regras/tipos'

const id = z.string().min(1).max(100)
const imagem = z
  .string()
  .max(300)
  .nullish()
  .refine((v) => !v || chaveDeImagemValida(v), 'Imagem inválida.')

// ---------- Aluno (e Equipe lendo como aluno) ----------

// Os carregadores abaixo são o miolo das server functions do aluno; a página de cada tela
// (`paginas-fns.ts`) os reaproveita para trazer tudo em UM pedido, sem repetir regra de acesso.

export async function carregarVitrine(db: Banco, pessoa: PessoaLogada) {
  // O acesso da pessoa (uma consulta, com os cursos de matrícula expirada, que aparecem com o
  // cadeado "acesso expirado") e o que a vitrine lê do banco vão juntos.
  const [{ acessiveis, expirados }, dados] = await Promise.all([
    acessoDaPessoa(db, agora, pessoa),
    carregarDadosDaVitrine(db),
  ])
  return agruparVitrine(dados, acessiveis, expirados)
}

// O curso com o cadeado de cada módulo e aula; o oculto sai da lista. `como` (turma) é o "ver como
// aluno" da equipe. Devolve também o mapa de situações cru (a página do curso o usa para o botão
// "Continuar" sem consultar de novo).
export async function carregarCurso(
  db: Banco,
  pessoa: PessoaLogada,
  data: { id: string; como?: string },
) {
  // Acesso, curso e situações só dependem do id: vão juntos, não em fila.
  const [pode, completo, mapa] = await Promise.all([
    podeAcessarCurso(db, agora, pessoa, data.id),
    obterIndiceDoCurso(db, data.id),
    situacoesDaPessoa(db, agora, pessoa, [data.id], data.como),
  ])
  if (!pode || !completo) return null
  return {
    mapa,
    curso: {
      ...completo,
      modulos: semOcultos(completo.modulos, mapa),
      situacoes: paraATela(mapa),
    },
  }
}

// A aula travada chega sem vídeo, texto nem materiais: só o motivo do cadeado. A oculta não existe.
export async function carregarAula(
  db: Banco,
  pessoa: PessoaLogada,
  data: { id: string; como?: string },
) {
  const encontrada = await obterAula(db, data.id)
  if (!encontrada) return null
  const [pode, mapa] = await Promise.all([
    podeAcessarCurso(db, agora, pessoa, encontrada.curso.id),
    situacoesDaPessoa(db, agora, pessoa, [encontrada.curso.id], data.como),
  ])
  if (!pode) return null
  const situacao = mapa.aulas.get(data.id) ?? LIBERADO
  if (situacao.tipo === 'oculto') return null
  const modulos = semOcultos(encontrada.modulos, mapa)
  const visiveis = new Set(modulos.flatMap((m) => m.aulas.map((a) => a.id)))
  const sequencia = encontrada.sequencia.filter(
    (a) => visiveis.has(a.id) || a.id === data.id,
  )
  const i = sequencia.findIndex((a) => a.id === data.id)
  const travada = situacao.tipo === 'cadeado'
  return {
    mapa,
    aula: {
      ...encontrada,
      aula: travada
        ? { ...encontrada.aula, vimeoId: null, vimeoHash: null, textoHtml: '' }
        : encontrada.aula,
      materiais: travada ? [] : encontrada.materiais,
      modulos,
      sequencia,
      anterior: i > 0 ? sequencia[i - 1] : null,
      proxima: i >= 0 && i < sequencia.length - 1 ? sequencia[i + 1] : null,
      situacao,
      situacoes: paraATela(mapa),
    },
  }
}

// ---------- Painel da Equipe ----------

// As categorias e os cursos não dependem uns dos outros: vão juntos (exportada para o teste de idas).
export async function carregarPainelDeConteudo(db: Banco) {
  const [categorias, cursos] = await Promise.all([
    listarCategorias(db),
    listarCursos(db),
  ])
  return { categorias, cursos }
}

export const painelDeConteudoFn = createServerFn({ method: 'GET' }).handler(
  async () => {
    await exigirPermissaoNaSessao('usar-estudio')
    return carregarPainelDeConteudo(getDb(env.DB))
  },
)

export const salvarCategoriaFn = createServerFn({ method: 'POST' })
  .validator(
    z.object({ id: id.optional(), nome: z.string().max(LIMITE_DO_NOME) }),
  )
  .handler(async ({ data }) => {
    await exigirPermissaoNaSessao('usar-estudio')
    const db = getDb(env.DB)
    if (data.id) await editarCategoria(db, data.id, { nome: data.nome })
    else await criarCategoria(db, { nome: data.nome })
  })

export const excluirCategoriaFn = createServerFn({ method: 'POST' })
  .validator(z.object({ id }))
  .handler(async ({ data }) => {
    await exigirPermissaoNaSessao('usar-estudio')
    await excluirCategoria(getDb(env.DB), agora, data.id)
  })

const dadosDoCurso = z.object({
  nome: z.string().max(LIMITE_DO_NOME),
  descricao: z.string().max(5000).optional(),
  categoriaId: z.string().max(100).nullish(),
  cargaHoraria: z.number().int().min(0).max(LIMITE_DA_CARGA_HORARIA).nullish(),
  capaHorizontal: imagem,
  capaVertical: imagem,
  imagemDestaque: imagem,
  mostrarATodos: z.boolean().optional(),
  urlDeVendas: z.string().max(500).nullish(),
  geraPedidoDoMec: z.boolean().optional(),
})

export const salvarCursoFn = createServerFn({ method: 'POST' })
  .validator(dadosDoCurso.extend({ id: id.optional() }))
  .handler(async ({ data }) => {
    await exigirPermissaoNaSessao('usar-estudio')
    const db = getDb(env.DB)
    const { id: cursoId, ...dados } = data
    if (cursoId) {
      await editarCurso(db, cursoId, dados)
      return cursoId
    }
    return criarCurso(db, dados)
  })

export const excluirCursoFn = createServerFn({ method: 'POST' })
  .validator(z.object({ id }))
  .handler(async ({ data }) => {
    await exigirPermissaoNaSessao('usar-estudio')
    await excluirCurso(getDb(env.DB), agora, data.id)
  })

// O curso e as categorias não dependem um do outro: vão juntos (exportada para o teste de idas).
export async function carregarCursoDoPainel(db: Banco, id: string) {
  const [completo, categorias] = await Promise.all([
    obterCurso(db, id),
    listarCategorias(db),
  ])
  return { completo, categorias }
}

export const salvarModuloFn = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      id: id.optional(),
      cursoId: id,
      nome: z.string().max(LIMITE_DO_NOME),
      capa: imagem,
    }),
  )
  .handler(async ({ data }) => {
    await exigirPermissaoNaSessao('usar-estudio')
    const db = getDb(env.DB)
    const dados = { nome: data.nome, capa: data.capa }
    if (data.id) await editarModulo(db, data.id, dados)
    else await criarModulo(db, data.cursoId, dados)
  })

export const excluirModuloFn = createServerFn({ method: 'POST' })
  .validator(z.object({ id }))
  .handler(async ({ data }) => {
    await exigirPermissaoNaSessao('usar-estudio')
    await excluirModulo(getDb(env.DB), agora, data.id)
  })

const dadosDaAula = z.object({
  titulo: z.string().max(200),
  video: z.string().max(1000).optional(),
  textoHtml: z.string().max(200_000).optional(),
  miniatura: imagem,
})

export const salvarAulaFn = createServerFn({ method: 'POST' })
  .validator(dadosDaAula.extend({ id: id.optional(), moduloId: id.optional() }))
  .handler(async ({ data }) => {
    await exigirPermissaoNaSessao('usar-estudio')
    const db = getDb(env.DB)
    const { id: aulaId, moduloId, ...dados } = data
    if (aulaId) {
      await editarAula(db, aulaId, dados)
      return aulaId
    }
    if (!moduloId) throw new Error('Escolha o módulo da aula.')
    return criarAula(db, moduloId, dados)
  })

export const excluirAulaFn = createServerFn({ method: 'POST' })
  .validator(z.object({ id }))
  .handler(async ({ data }) => {
    await exigirPermissaoNaSessao('usar-estudio')
    await excluirAula(getDb(env.DB), agora, data.id)
  })

export const aulaDoPainelFn = createServerFn({ method: 'GET' })
  .validator(z.object({ id }))
  .handler(async ({ data }) => {
    await exigirPermissaoNaSessao('usar-estudio')
    return obterAula(getDb(env.DB), data.id)
  })

export const anexarMaterialFn = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      aulaId: id,
      nome: z.string().max(LIMITE_DO_NOME),
      chave: z
        .string()
        .max(300)
        .refine(chaveDeMaterialValida, 'Arquivo inválido.'),
      tipo: z.string().max(200),
      tamanho: z.number().int().positive(),
    }),
  )
  .handler(async ({ data }) => {
    await exigirPermissaoNaSessao('usar-estudio')
    const { aulaId, ...material } = data
    await anexarMaterial(getDb(env.DB), aulaId, material)
  })

export const excluirMaterialFn = createServerFn({ method: 'POST' })
  .validator(z.object({ id }))
  .handler(async ({ data }) => {
    await exigirPermissaoNaSessao('usar-estudio')
    await excluirMaterial(getDb(env.DB), agora, data.id)
  })

export const reordenarFn = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      entidade: z.enum(['categoria', 'curso', 'modulo', 'aula', 'material']),
      ids: z.array(id).max(500),
    }),
  )
  .handler(async ({ data }) => {
    await exigirPermissaoNaSessao('usar-estudio')
    await reordenar(getDb(env.DB), data.entidade, data.ids)
  })
