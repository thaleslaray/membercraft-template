// Leitor de legendas SRT e VTT. Devolve as falas com o segundo em que cada uma começa, já
// agrupadas em trechos maiores: a busca compara palavras dentro de um trecho, e uma frase dita
// entre duas legendas curtas não acharia nada se cada legenda fosse um trecho.

export interface Fala {
  /** Segundo do vídeo em que a fala começa. */
  inicio: number
  texto: string
}

/** Até quantos segundos e caracteres um trecho junta antes de abrir outro. */
const SEGUNDOS_POR_TRECHO = 15
const CARACTERES_POR_TRECHO = 240

// 00:01:02,500 · 00:01:02.500 · 01:02.500 (o VTT pode omitir as horas).
const TEMPO = /(?:(\d{1,3}):)?(\d{1,2}):(\d{2})(?:[.,](\d{1,3}))?/
const LINHA_DE_TEMPO = new RegExp(`^\\s*${TEMPO.source}\\s*-->`)

function segundos(linha: string): number | null {
  const m = LINHA_DE_TEMPO.exec(linha)
  if (!m) return null
  return Number(m[1] ?? 0) * 3600 + Number(m[2]) * 60 + Number(m[3])
}

function limpar(texto: string): string {
  return texto
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Cada legenda do arquivo, na ordem. Ignora cabeçalho, notas, estilos, números e ajustes. */
export function lerLegendas(conteudo: string): Fala[] {
  const blocos = conteudo
    .replace(/^﻿/, '')
    .replace(/\r\n?/g, '\n')
    .split(/\n{2,}/)
  const falas: Fala[] = []
  for (const bloco of blocos) {
    const linhas = bloco.split('\n')
    const posicao = linhas.findIndex((l) => segundos(l) !== null)
    if (posicao < 0) continue
    const inicio = segundos(linhas[posicao])
    if (inicio === null) continue
    const texto = limpar(linhas.slice(posicao + 1).join(' '))
    if (texto) falas.push({ inicio, texto })
  }
  return falas
}

/** Junta legendas vizinhas em trechos de poucos segundos, cada um com o início da primeira. */
export function agruparEmTrechos(falas: Fala[]): Fala[] {
  const trechos: Fala[] = []
  let atual: Fala | null = null
  for (const fala of falas) {
    if (
      atual &&
      fala.inicio - atual.inicio < SEGUNDOS_POR_TRECHO &&
      atual.texto.length < CARACTERES_POR_TRECHO
    ) {
      atual.texto = `${atual.texto} ${fala.texto}`
    } else {
      atual = { ...fala }
      trechos.push(atual)
    }
  }
  return trechos
}

/** Trechos pesquisáveis de um arquivo SRT ou VTT. */
export function trechosDaLegenda(conteudo: string): Fala[] {
  return agruparEmTrechos(lerLegendas(conteudo))
}
