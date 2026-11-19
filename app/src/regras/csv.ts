// CSV para abrir no Excel em português: separador `;`, UTF-8 com BOM e fim de linha CRLF.
// Texto que começaria como fórmula (`=`, `+`, `-`, `@`) ganha um apóstrofo na frente, para a
// planilha não executá-lo; números não sofrem isso.

export type Celula = string | number | boolean | Date | null | undefined

const BOM = '﻿'

function textoDaCelula(valor: Celula): string {
  if (valor === null || valor === undefined) return ''
  if (typeof valor === 'number')
    return Number.isFinite(valor) ? String(valor) : ''
  if (typeof valor === 'boolean') return valor ? 'sim' : 'não'
  let texto = valor instanceof Date ? valor.toISOString() : valor
  if (/^[=+\-@\t\r]/.test(texto)) texto = `'${texto}`
  return /[;"\r\n]/.test(texto) ? `"${texto.replaceAll('"', '""')}"` : texto
}

export function gerarCsv(cabecalho: string[], linhas: Celula[][]): string {
  const todas = [cabecalho, ...linhas]
  return `${BOM}${todas.map((l) => l.map(textoDaCelula).join(';')).join('\r\n')}\r\n`
}
