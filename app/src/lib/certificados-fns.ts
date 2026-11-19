import { env } from 'cloudflare:workers'
import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { getDb } from '#/db/index'
import {
  exigirPermissaoNaSessao,
  pessoaLogadaNaSessao,
} from '#/lib/autorizacao'
import {
  confirmarNomeEEmitir,
  emitirRetroativoDoCurso,
  enfileirarPdf,
} from '#/lib/certificados-cola'
import { agora } from '#/lib/relogio'
import { podeAcessarCurso } from '#/regras/acesso-ao-curso'
import {
  caminhoDoCertificado,
  certificadoDoCurso,
  certificadosDoAluno,
  certificadosParaAEquipe,
  corrigirNomeEReemitir,
  LIMITE_DO_MOTIVO,
  lerModelo,
  nomeParaConfirmar,
  pedirNovoPdf,
  pendentesDoAluno,
  revogarCertificado,
  salvarModelo,
  validarCodigo,
} from '#/regras/certificados'

const id = z.string().min(1).max(100)

// ---------- Aluno ----------

// Tela Certificados: os certificados dele (baixa mesmo com o acesso expirado) e o nome a confirmar.
export const meusCertificadosFn = createServerFn({ method: 'GET' }).handler(
  async () => {
    const { id: userId } = await pessoaLogadaNaSessao()
    const db = getDb(env.DB)
    const [certificados, nome, pendentes] = await Promise.all([
      certificadosDoAluno(db, userId),
      nomeParaConfirmar(db, userId),
      pendentesDoAluno(db, userId),
    ])
    return { certificados, nome, aguardandoNome: pendentes.length > 0 }
  },
)

export const confirmarNomeFn = createServerFn({ method: 'POST' })
  .validator(z.object({ nome: z.string().max(300) }))
  .handler(async ({ data }) => {
    const { id: userId } = await pessoaLogadaNaSessao()
    return { emitidos: await confirmarNomeEEmitir(env, userId, data.nome) }
  })

// O que a página do curso mostra: "Faltam 3 aulas, o quiz X e 1.200 pontos", o PDF ou o pedido do nome.
export const certificadoDoCursoFn = createServerFn({ method: 'GET' })
  .validator(z.object({ cursoId: id }))
  .handler(async ({ data }) => {
    const pessoa = await pessoaLogadaNaSessao()
    const db = getDb(env.DB)
    // Acesso e certificado só dependem do id do curso: vão juntos.
    const [pode, certificado] = await Promise.all([
      podeAcessarCurso(db, agora, pessoa, data.cursoId),
      certificadoDoCurso(db, pessoa.id, data.cursoId),
    ])
    return pode ? certificado : { tipo: 'sem-certificado' as const }
  })

// O painel "Caminho do certificado": pontos da aluna no curso e cada exercício, obrigatório ou não.
export const caminhoDoCertificadoFn = createServerFn({ method: 'GET' })
  .validator(z.object({ cursoId: id }))
  .handler(async ({ data }) => {
    const pessoa = await pessoaLogadaNaSessao()
    const db = getDb(env.DB)
    const [pode, caminho] = await Promise.all([
      podeAcessarCurso(db, agora, pessoa, data.cursoId),
      caminhoDoCertificado(db, pessoa.id, data.cursoId),
    ])
    return pode ? caminho : null
  })

// ---------- Público ----------

// Página /validar/<código>: não exige sessão e só devolve nome, curso, data e se vale.
export const validarCertificadoFn = createServerFn({ method: 'GET' })
  .validator(z.object({ codigo: z.string().max(40) }))
  .handler(async ({ data }) => validarCodigo(getDb(env.DB), data.codigo))

// ---------- Painel ----------

export const modeloDeCertificadoFn = createServerFn({ method: 'GET' })
  .validator(z.object({ cursoId: id }))
  .handler(async ({ data }) => {
    await exigirPermissaoNaSessao('usar-estudio')
    return lerModelo(getDb(env.DB), data.cursoId)
  })

const campoDoModelo = z.object({
  campo: z.string().max(20),
  lado: z.string().max(10),
  x: z.number(),
  y: z.number(),
  tamanho: z.number(),
  fonte: z.string().max(20),
  negrito: z.boolean(),
  cor: z.string().max(7),
  alinhamento: z.string().max(10),
})

// Salva o modelo e as exigências e, com o modelo ativo, emite para quem já cumpre (retroativo).
export const salvarModeloFn = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      cursoId: id,
      ativo: z.boolean(),
      frente: z.string().max(300).nullable(),
      verso: z.string().max(300).nullable(),
      campos: z.array(campoDoModelo).max(20),
      todasAsAulas: z.boolean(),
      pontosMinimos: z.number().int().min(0).max(1_000_000),
    }),
  )
  .handler(async ({ data }) => {
    await exigirPermissaoNaSessao('usar-estudio')
    const { cursoId, ...entrada } = data
    await salvarModelo(getDb(env.DB), agora, cursoId, entrada)
    if (!data.ativo) return { emitidos: 0, aguardandoNome: 0 }
    const r = await emitirRetroativoDoCurso(env, cursoId)
    return {
      emitidos: r.emitidos.length,
      aguardandoNome: r.aguardandoNome.length,
    }
  })

export const certificadosDoAlunoNoPainelFn = createServerFn({ method: 'GET' })
  .validator(z.object({ alunoId: id }))
  .handler(async ({ data }) => {
    await exigirPermissaoNaSessao('usar-estudio')
    return certificadosParaAEquipe(getDb(env.DB), data.alunoId)
  })

// Só o Proprietário revoga, com motivo.
export const revogarCertificadoFn = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      certificadoId: id,
      motivo: z.string().max(LIMITE_DO_MOTIVO + 100),
    }),
  )
  .handler(async ({ data }) => {
    const { id: autorId, perfil } = await pessoaLogadaNaSessao({
      semCache: true,
    })
    await revogarCertificado(getDb(env.DB), agora, { perfil, autorId, ...data })
    return true
  })

export const corrigirNomeDoCertificadoFn = createServerFn({ method: 'POST' })
  .validator(z.object({ certificadoId: id, nome: z.string().max(300) }))
  .handler(async ({ data }) => {
    const { id: autorId, perfil } = await pessoaLogadaNaSessao({
      semCache: true,
    })
    await corrigirNomeEReemitir(getDb(env.DB), agora, {
      perfil,
      autorId,
      ...data,
    })
    await enfileirarPdf(env, data.certificadoId)
    return true
  })

export const regenerarPdfFn = createServerFn({ method: 'POST' })
  .validator(z.object({ certificadoId: id }))
  .handler(async ({ data }) => {
    const { perfil } = await pessoaLogadaNaSessao({ semCache: true })
    await pedirNovoPdf(getDb(env.DB), perfil, data.certificadoId)
    await enfileirarPdf(env, data.certificadoId)
    return true
  })
