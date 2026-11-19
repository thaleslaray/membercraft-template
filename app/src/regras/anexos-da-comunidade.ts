// Regras dos arquivos e do texto das publicações da comunidade: até 3 anexos de 10 MB, imagens no
// texto e a limpeza do HTML. Quem escreve é o aluno, então o texto é tratado como não confiável.

import { limparHtml } from '#/regras/html-seguro'

export const LIMITE_DE_ANEXOS = 3
export const LIMITE_DO_ANEXO = 10 * 1024 * 1024
export const LIMITE_DA_IMAGEM_DA_COMUNIDADE = 8 * 1024 * 1024
export const LIMITE_DO_TEXTO_DA_PUBLICACAO = 20_000

export const PREFIXO_DOS_ANEXOS = 'comunidade/anexos/'
export const PREFIXO_DAS_IMAGENS_DA_COMUNIDADE = 'comunidade/imagens/'
/** Endereço (com sessão) das imagens do texto; o resto da chave vem depois. */
export const URL_DAS_IMAGENS_DA_COMUNIDADE = '/api/comunidade/imagens/'

const TIPOS_DE_IMAGEM = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']

export interface AnexoEnviado {
  chave: string
  nome: string
  tipo: string
  tamanho: number
}

export type FinalidadeDoEnvio = 'imagem' | 'anexo'

function nomeSeguro(nome: string): string {
  const base = nome.split(/[\\/]/).pop() ?? ''
  const limpo = base
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+\./g, '.')
    .replace(/^[-.]+|[-.]+$/g, '')
    .slice(-80)
  return limpo || 'arquivo'
}

/** Chave no R2. O anexo leva o id de quem enviou: só essa pessoa pode anexá-lo a uma publicação. */
export function chaveDoEnvio(
  finalidade: FinalidadeDoEnvio,
  userId: string,
  nome: string,
  id: string,
): string {
  return finalidade === 'imagem'
    ? `${PREFIXO_DAS_IMAGENS_DA_COMUNIDADE}${id}/${nomeSeguro(nome)}`
    : `${PREFIXO_DOS_ANEXOS}${userId}/${id}/${nomeSeguro(nome)}`
}

/** Erro em texto (para mostrar a quem enviou) ou null se o arquivo pode subir. */
export function validarEnvioDaComunidade(
  finalidade: FinalidadeDoEnvio,
  arquivo: { tipo: string; tamanho: number },
): string | null {
  if (arquivo.tamanho <= 0) return 'O arquivo está vazio.'
  if (finalidade === 'imagem') {
    if (!TIPOS_DE_IMAGEM.includes(arquivo.tipo)) {
      return 'Envie uma imagem JPG, PNG, WebP ou GIF.'
    }
    if (arquivo.tamanho > LIMITE_DA_IMAGEM_DA_COMUNIDADE) {
      return 'A imagem passa de 8 MB.'
    }
    return null
  }
  if (arquivo.tamanho > LIMITE_DO_ANEXO) return 'O anexo passa de 10 MB.'
  return null
}

/** Chaves do R2 das imagens que o texto (HTML) de uma publicação mostra, para apagar junto com ela. */
export function chaveDasImagensDoTexto(html: string): string[] {
  const chaves = new Set<string>()
  const padrao = new RegExp(
    `${URL_DAS_IMAGENS_DA_COMUNIDADE.replaceAll('/', '\\/')}([^"'\\s)>]+)`,
    'g',
  )
  for (const [, resto] of html.matchAll(padrao)) {
    try {
      chaves.add(
        `${PREFIXO_DAS_IMAGENS_DA_COMUNIDADE}${decodeURIComponent(resto)}`,
      )
    } catch {
      // endereço malformado não aponta para nenhum objeto
    }
  }
  return [...chaves]
}

const semEscape = (chave: string) =>
  !chave.includes('..') && !chave.includes('//')

export function chaveDeImagemDaComunidadeValida(chave: string): boolean {
  return chave.startsWith(PREFIXO_DAS_IMAGENS_DA_COMUNIDADE) && semEscape(chave)
}

/** O anexo só vale se a chave está na pasta de quem o envia (ou já era da publicação). */
export function chaveDeAnexoValida(userId: string, chave: string): boolean {
  return chave.startsWith(`${PREFIXO_DOS_ANEXOS}${userId}/`) && semEscape(chave)
}

export class ErroDeAnexo extends Error {
  constructor(mensagem: string) {
    super(mensagem)
    this.name = 'ErroDeAnexo'
  }
}

/**
 * Confere a lista de anexos de uma publicação: no máximo 3, até 10 MB cada, sem repetir, e cada
 * chave ou é da pasta de quem envia ou já fazia parte da publicação (`jaDaPublicacao`).
 */
export function validarAnexos(
  userId: string,
  anexos: AnexoEnviado[],
  jaDaPublicacao: readonly string[] = [],
): AnexoEnviado[] {
  if (anexos.length > LIMITE_DE_ANEXOS) {
    throw new ErroDeAnexo(`Use no máximo ${LIMITE_DE_ANEXOS} anexos.`)
  }
  if (new Set(anexos.map((a) => a.chave)).size !== anexos.length) {
    throw new ErroDeAnexo('Esse anexo já está na publicação.')
  }
  return anexos.map((a) => {
    if (
      !jaDaPublicacao.includes(a.chave) &&
      !chaveDeAnexoValida(userId, a.chave)
    ) {
      throw new ErroDeAnexo('Anexo inválido. Envie o arquivo de novo.')
    }
    if (a.tamanho <= 0 || a.tamanho > LIMITE_DO_ANEXO) {
      throw new ErroDeAnexo('Cada anexo pode ter até 10 MB.')
    }
    return {
      chave: a.chave,
      nome: a.nome.trim().slice(0, 200) || 'arquivo',
      tipo: a.tipo.trim().slice(0, 100) || 'application/octet-stream',
      tamanho: a.tamanho,
    }
  })
}

/**
 * Limpa o HTML do texto: marcações permitidas por `limparHtml` e, das imagens, só as que a própria
 * comunidade guardou (uma imagem de fora ou um caminho qualquer da área é descartado).
 */
export function limparTextoDaPublicacao(entrada: string): string {
  return limparHtml(entrada).replace(/<img\b[^>]*>/gi, (marca) => {
    const src = /\ssrc="([^"]*)"/i.exec(marca)?.[1] ?? ''
    const chave = src.startsWith(URL_DAS_IMAGENS_DA_COMUNIDADE)
      ? `${PREFIXO_DAS_IMAGENS_DA_COMUNIDADE}${src.slice(URL_DAS_IMAGENS_DA_COMUNIDADE.length)}`
      : ''
    return chaveDeImagemDaComunidadeValida(chave) ? marca : ''
  })
}

/** O texto sem marcação, para o resumo da lista e para saber se há algo escrito. */
export function textoPuro(html: string): string {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}
