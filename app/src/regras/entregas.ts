// Regras dos arquivos que o aluno entrega no quiz (#52): até 3 por pergunta, de qualquer tipo, até
// 500 MB cada, guardados no R2 sob a pasta do próprio aluno.
//
// Dois caminhos de envio:
// - remoto: URL assinada (S3 do R2), o navegador manda o arquivo direto ao R2, sem passar pelo
//   Worker (o corpo de uma requisição ao Worker tem teto de 100 MB);
// - local (`npm run dev`, e2e): o R2 local não tem endpoint S3, então o arquivo passa pelo Worker,
//   com o limite menor `LIMITE_DO_ENVIO_PELO_WORKER`.

import type { ConfigR2 } from '#/lib/r2-presign'
import { nomeSeguroDoArquivo } from '#/regras/arquivos-de-conteudo'

/** Texto livre e envio de arquivo: sem alternativas, corrigidos pela Equipe. */
export const TIPOS_ABERTOS = ['texto_livre', 'arquivo']
export const ehAberta = (tipo: string) => TIPOS_ABERTOS.includes(tipo)

/**
 * Escolha sem alternativa correta: a aluna marca, mas quem corrige é a Equipe (como numa resposta
 * aberta). Vale para a pergunta definida e para a cópia guardada na tentativa.
 */
export const ehEscolhaSemGabarito = (p: {
  tipo: string
  alternativas: { correta: boolean }[]
}) => !ehAberta(p.tipo) && p.alternativas.every((a) => !a.correta)

/** Passa pela fila da Equipe: texto livre, arquivo e escolha sem gabarito. */
export const passaPelaEquipe = (p: {
  tipo: string
  alternativas: { correta: boolean }[]
}) => ehAberta(p.tipo) || ehEscolhaSemGabarito(p)

/** Id da alternativa "Outro:" (o texto digitado vai à parte). */
export const ID_DO_OUTRO = 'outro'

export const TEXTO_DO_GRUPO = 'Responda pelo menos um: link ou arquivo'

/**
 * Ids das perguntas que ficaram sem resposta. Obrigatória (padrão) sem resposta falta; as de um
 * mesmo `grupoUmDe` só faltam se nenhuma do grupo foi respondida; opcional nunca falta.
 */
export function perguntasSemResposta(
  perguntas: {
    id: string
    obrigatoria?: boolean
    grupoUmDe?: string | null
  }[],
  respondida: (id: string) => boolean,
): string[] {
  const grupos = new Map<string, string[]>()
  const faltam = new Set<string>()
  for (const p of perguntas) {
    if (p.grupoUmDe) {
      grupos.set(p.grupoUmDe, [...(grupos.get(p.grupoUmDe) ?? []), p.id])
    } else if (p.obrigatoria !== false && !respondida(p.id)) {
      faltam.add(p.id)
    }
  }
  for (const ids of grupos.values()) {
    if (!ids.some(respondida)) for (const id of ids) faltam.add(id)
  }
  return perguntas.filter((p) => faltam.has(p.id)).map((p) => p.id)
}

/** O que uma pergunta de arquivo aceita. `qualquer` é o padrão (e o de pergunta antiga sem o campo). */
export const TIPOS_ACEITOS = [
  'qualquer',
  'imagem',
  'pdf',
  'audio',
  'video',
] as const
export type TipoAceito = (typeof TIPOS_ACEITOS)[number]

export const ehTipoAceito = (v: unknown): v is TipoAceito =>
  typeof v === 'string' && (TIPOS_ACEITOS as readonly string[]).includes(v)

/** Rótulos do editor da Equipe. */
export const ROTULO_DO_TIPO_ACEITO: Record<TipoAceito, string> = {
  qualquer: 'Qualquer arquivo',
  imagem: 'Foto (imagem)',
  pdf: 'PDF',
  audio: 'Áudio',
  video: 'Vídeo',
}

const EXTENSOES: Record<Exclude<TipoAceito, 'qualquer'>, string[]> = {
  imagem: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'heif', 'avif', 'bmp'],
  pdf: ['pdf'],
  audio: ['mp3', 'm4a', 'wav', 'ogg', 'oga', 'aac', 'opus', 'weba', 'flac'],
  video: ['mp4', 'mov', 'webm', 'm4v', 'mkv', 'avi'],
}

/**
 * O arquivo serve para a pergunta? Vale o MIME (HEIC/HEIF contam como imagem); sem MIME (alguns
 * navegadores não o informam para HEIC) vale a extensão do nome.
 */
export function arquivoAceito(
  aceita: string | null | undefined,
  mime: string,
  nome = '',
): boolean {
  if (!aceita || aceita === 'qualquer') return true
  if (!ehTipoAceito(aceita) || aceita === 'qualquer') return true
  const tipo = mime.trim().toLowerCase().split(';')[0] ?? ''
  if (tipo && tipo !== 'application/octet-stream') {
    if (aceita === 'imagem') return tipo.startsWith('image/')
    if (aceita === 'pdf') return tipo === 'application/pdf'
    if (aceita === 'audio') return tipo.startsWith('audio/')
    return tipo.startsWith('video/')
  }
  const ext = nome.toLowerCase().split('.').pop() ?? ''
  return nome.includes('.') && EXTENSOES[aceita].includes(ext)
}

/** Valor do `accept` do input de arquivo. */
export const ACCEPT_DO_TIPO: Record<TipoAceito, string | undefined> = {
  qualquer: undefined,
  imagem: 'image/*,.heic,.heif',
  pdf: 'application/pdf',
  audio: 'audio/*',
  video: 'video/*',
}

export function textoDeAjudaDoArquivo(aceita: string | null | undefined) {
  switch (aceita) {
    case 'imagem':
      return `Envie de 1 a ${MAXIMO_DE_ARQUIVOS} fotos.`
    case 'pdf':
      return 'Envie o PDF.'
    case 'audio':
      return 'Envie o áudio.'
    case 'video':
      return 'Envie o vídeo.'
    default:
      return `Envie de 1 a ${MAXIMO_DE_ARQUIVOS} arquivos (foto, PDF, áudio ou vídeo, até 500 MB cada).`
  }
}

/** Mensagem de recusa para o tipo errado; nula se o tipo não restringe. */
export function erroDeTipoDeArquivo(aceita: string | null | undefined): string {
  switch (aceita) {
    case 'imagem':
      return 'Esta pergunta pede foto. Envie uma imagem (JPG, PNG…).'
    case 'pdf':
      return 'Esta pergunta pede um PDF. Envie um arquivo PDF.'
    case 'audio':
      return 'Esta pergunta pede um áudio. Envie um arquivo de áudio (MP3, M4A…).'
    case 'video':
      return 'Esta pergunta pede um vídeo. Envie um arquivo de vídeo (MP4, MOV…).'
    default:
      return 'Arquivo não aceito nesta pergunta.'
  }
}

export const MAXIMO_DE_ARQUIVOS = 3
export const LIMITE_DO_ARQUIVO = 500 * 1024 * 1024
export const LIMITE_DO_ENVIO_PELO_WORKER = 90 * 1024 * 1024
export const LIMITE_DO_TEXTO_LIVRE = 5000
export const PREFIXO_DAS_ENTREGAS = 'quiz/entregas/'

export interface ArquivoEntregue {
  chave: string
  nome: string
  tipo: string
}

/** Pasta do aluno no R2: só ele (e a Equipe, pela rota de download) chega aos arquivos dela. */
export const pastaDeEntregasDoAluno = (userId: string) =>
  `${PREFIXO_DAS_ENTREGAS}${userId}/`

export function chaveDeEntrega(
  userId: string,
  nome: string,
  id: string,
): string {
  return `${pastaDeEntregasDoAluno(userId)}${id}/${nomeSeguroDoArquivo(nome)}`
}

/** A chave tem que estar na pasta do próprio aluno e não pode escapar dela. */
export function chaveDeEntregaDoAluno(chave: string, userId: string): boolean {
  return (
    chave.startsWith(pastaDeEntregasDoAluno(userId)) &&
    chave.length <= 300 &&
    !chave.includes('..') &&
    !chave.includes('//')
  )
}

/** Erro em texto ou null se o arquivo pode ser entregue. `modo` define o limite de tamanho. */
export function validarArquivoDeEntrega(
  arquivo: { tamanho: number },
  modo: 'direto' | 'worker',
): string | null {
  if (!Number.isFinite(arquivo.tamanho) || arquivo.tamanho <= 0) {
    return 'O arquivo está vazio.'
  }
  if (arquivo.tamanho > LIMITE_DO_ARQUIVO) return 'O arquivo passa de 500 MB.'
  if (modo === 'worker' && arquivo.tamanho > LIMITE_DO_ENVIO_PELO_WORKER) {
    return 'Neste ambiente de testes o arquivo pode ter até 90 MB.'
  }
  return null
}

/** Credenciais S3 do R2, se existirem (só no ambiente remoto); senão nulo e o envio é pelo Worker. */
export function configDoR2(env: {
  R2_ACCOUNT_ID?: string
  R2_ACCESS_KEY_ID?: string
  R2_SECRET_ACCESS_KEY?: string
  R2_BUCKET_NAME?: string
}): ConfigR2 | null {
  if (
    !env.R2_ACCOUNT_ID ||
    !env.R2_ACCESS_KEY_ID ||
    !env.R2_SECRET_ACCESS_KEY ||
    !env.R2_BUCKET_NAME
  ) {
    return null
  }
  return {
    accountId: env.R2_ACCOUNT_ID,
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    bucket: env.R2_BUCKET_NAME,
  }
}
