import { describe, expect, it } from 'vitest'
import { gerarCsv } from '#/regras/csv'

describe('gerarCsv', () => {
  it('separa por ponto e vírgula, com BOM e CRLF', () => {
    expect(gerarCsv(['a', 'b'], [['x', 2]])).toBe('﻿a;b\r\nx;2\r\n')
  })

  it('protege aspas, quebras de linha e separador dentro do texto', () => {
    const csv = gerarCsv(['t'], [['diz "oi"; tchau\nfim']])
    expect(csv).toBe('﻿t\r\n"diz ""oi""; tchau\nfim"\r\n')
  })

  it('neutraliza texto que parece fórmula, mas não números negativos', () => {
    const csv = gerarCsv(['t', 'n'], [['=SOMA(A1)', -20]])
    expect(csv).toBe("﻿t;n\r\n'=SOMA(A1);-20\r\n")
  })

  it('escreve vazio, booleano e data', () => {
    const csv = gerarCsv(
      ['a', 'b', 'c'],
      [[null, true, new Date('2026-06-01T12:00:00Z')]],
    )
    expect(csv).toBe('﻿a;b;c\r\n;sim;2026-06-01T12:00:00.000Z\r\n')
  })
})
