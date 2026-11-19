import { env } from 'cloudflare:workers'
import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { getDb } from '#/db/index'
import {
  exigirPermissaoNaSessao,
  pessoaLogadaNaSessao,
} from '#/lib/autorizacao'
import { ganchosDoQuizComPontosECertificado } from '#/lib/certificados-cola'
import { aulaEstaLiberada } from '#/lib/liberacao'
import { urlAssinadaUpload } from '#/lib/r2-presign'
import { agora } from '#/lib/relogio'
import { podeAcessarCurso } from '#/regras/acesso-ao-curso'
import { chaveDeImagemValida } from '#/regras/arquivos-de-conteudo'
import {
  chaveDeEntrega,
  configDoR2,
  ehTipoAceito,
  LIMITE_DO_TEXTO_LIVRE,
  MAXIMO_DE_ARQUIVOS,
  validarArquivoDeEntrega,
} from '#/regras/entregas'
import { cursoDaAula } from '#/regras/progresso'
import {
  ErroDeQuiz,
  enviarTentativa,
  MAXIMO_DE_TENTATIVAS_LIMITE,
  obterQuizDoPainel,
  removerQuiz,
  salvarQuiz,
} from '#/regras/quiz'

const id = z.string().min(1).max(100)

// Autentica e confere o acesso ao curso da aula. Quem não tem acesso vê "aula não encontrada".
async function alunoComAcessoA(aulaId: string) {
  const pessoa = await pessoaLogadaNaSessao()
  const db = getDb(env.DB)
  // Acesso ao curso e liberação da aula (regras de liberação, #42) só dependem do id da aula: vão
  // juntos. Aula oculta ou com cadeado não recebe resposta nem avaliação.
  const [acesso, liberada] = await Promise.all([
    cursoDaAula(db, aulaId).then(
      (cursoId) =>
        cursoId !== null && podeAcessarCurso(db, agora, pessoa, cursoId),
    ),
    aulaEstaLiberada(db, agora, pessoa, aulaId),
  ])
  if (!acesso || !liberada) throw new ErroDeQuiz('Aula não encontrada.')
  return { db, userId: pessoa.id }
}

const arquivoEntregue = z.object({
  chave: z.string().min(1).max(300),
  nome: z.string().min(1).max(200),
  tipo: z.string().max(100),
})

export const enviarTentativaFn = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      aulaId: id,
      respostas: z.record(z.string().max(100), z.array(id).max(50)),
      // Perguntas abertas (#52): o texto e os arquivos já enviados ao R2.
      textos: z
        .record(
          z.string().max(100),
          z.string().max(LIMITE_DO_TEXTO_LIVRE + 100),
        )
        .optional(),
      arquivos: z
        .record(
          z.string().max(100),
          z.array(arquivoEntregue).max(MAXIMO_DE_ARQUIVOS + 1),
        )
        .optional(),
    }),
  )
  .handler(async ({ data }) => {
    const { db, userId } = await alunoComAcessoA(data.aulaId)
    // Os pontos (#54) e o certificado (#55) entram em `aoAprovarPelaPrimeiraVez`.
    return enviarTentativa(
      db,
      agora,
      userId,
      data.aulaId,
      data.respostas,
      ganchosDoQuizComPontosECertificado,
      { textos: data.textos, arquivos: data.arquivos },
      {
        // O tamanho que vale é o que o R2 guardou, não o que o navegador disse.
        tamanhoDoObjeto: async (chave) =>
          (await env.BUCKET.head(chave))?.size ?? null,
      },
    )
  })

export type PreparoDoEnvio =
  | { modo: 'direto'; chave: string; url: string }
  | { modo: 'worker' }

// Antes de enviar um arquivo da entrega: confere o tamanho e diz por onde ele vai. Com as
// credenciais S3 do R2 (ambiente remoto) devolve a URL assinada e o navegador manda o arquivo
// direto ao R2; sem elas (dev e e2e local) o envio é pelo Worker, com limite menor.
export const prepararEnvioDeArquivoFn = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      aulaId: id,
      nome: z.string().min(1).max(200),
      tamanho: z.number(),
    }),
  )
  .handler(async ({ data }): Promise<PreparoDoEnvio> => {
    const { userId } = await alunoComAcessoA(data.aulaId)
    const config = configDoR2(env)
    const modo = config ? 'direto' : 'worker'
    const erro = validarArquivoDeEntrega({ tamanho: data.tamanho }, modo)
    if (erro) throw new ErroDeQuiz(erro)
    if (!config) return { modo: 'worker' }
    const chave = chaveDeEntrega(userId, data.nome, crypto.randomUUID())
    return {
      modo: 'direto',
      chave,
      url: await urlAssinadaUpload(config, chave, data.tamanho),
    }
  })

// ---------- Painel da Equipe ----------

const alternativa = z.object({
  texto: z.string().max(500),
  correta: z.boolean(),
  comentario: z.string().max(1000).nullish(),
  imagem: z
    .string()
    .max(300)
    .nullish()
    .refine((v) => !v || chaveDeImagemValida(v), 'Imagem inválida.'),
})

const pergunta = z.object({
  tipo: z.string().max(30),
  aceita: z
    .string()
    .refine(ehTipoAceito, 'Tipo de arquivo inválido.')
    .optional(),
  enunciado: z.string().max(2000),
  obrigatoria: z.boolean().optional(),
  grupoUmDe: z.string().max(100).nullish(),
  outro: z.boolean().optional(),
  imagem: z
    .string()
    .max(300)
    .nullish()
    .refine((v) => !v || chaveDeImagemValida(v), 'Imagem inválida.'),
  alternativas: z.array(alternativa).max(12),
})

export const quizDoPainelFn = createServerFn({ method: 'GET' })
  .validator(z.object({ aulaId: id }))
  .handler(async ({ data }) => {
    await exigirPermissaoNaSessao('usar-estudio')
    return obterQuizDoPainel(getDb(env.DB), data.aulaId)
  })

export const salvarQuizFn = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      aulaId: id,
      soQuiz: z.boolean(),
      obrigatorio: z.boolean(),
      obrigatorioParaCertificado: z.boolean(),
      minimoDeAcertos: z.number().int().min(0).max(100),
      maximoDeTentativas: z
        .number()
        .int()
        .min(1)
        .max(MAXIMO_DE_TENTATIVAS_LIMITE)
        .nullable(),
      pontos: z.number().int().min(0).max(100_000),
      semCorrecao: z.boolean().optional(),
      formato: z.enum(['lista', 'conversa']).optional(),
      abertura: z.string().max(3000).nullish(),
      fecho: z.string().max(1000).nullish(),
      perguntas: z.array(pergunta).max(100),
    }),
  )
  .handler(async ({ data }) => {
    await exigirPermissaoNaSessao('usar-estudio')
    const { aulaId, ...definicao } = data
    await salvarQuiz(getDb(env.DB), aulaId, definicao)
  })

export const removerQuizFn = createServerFn({ method: 'POST' })
  .validator(z.object({ aulaId: id }))
  .handler(async ({ data }) => {
    await exigirPermissaoNaSessao('usar-estudio')
    await removerQuiz(getDb(env.DB), () => new Date(), data.aulaId)
  })
