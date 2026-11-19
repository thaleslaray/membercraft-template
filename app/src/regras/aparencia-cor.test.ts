import { describe, expect, it } from 'vitest'
import {
  avaliarCorDaMarca,
  contraste,
  corSobre,
  cssDaMarca,
} from '#/regras/aparencia-cor'

describe('contraste da cor da marca', () => {
  it('calcula a razão WCAG entre duas cores', () => {
    expect(contraste('#000000', '#ffffff')).toBeCloseTo(21, 1)
    expect(contraste('#1f4d3a', '#ffffff')).toBeCloseTo(9.63, 1)
  })

  it('o verde do Estúdio passa sem aviso, com texto branco por cima', () => {
    const avaliacao = avaliarCorDaMarca('#1f4d3a', 'estudio')
    expect(avaliacao.avisos).toEqual([])
    expect(avaliacao.textoSobreAMarca).toBe('#ffffff')
  })

  it('um cinza médio avisa que o texto sobre a marca fica fraco', () => {
    const avaliacao = avaliarCorDaMarca('#7a7a7a', 'estudio')
    expect(avaliacao.avisos).toHaveLength(1)
    expect(avaliacao.avisos[0]).toMatch(/texto/i)
  })

  it('uma cor quase branca avisa que some sobre o fundo claro', () => {
    const avaliacao = avaliarCorDaMarca('#f7f5f0', 'estudio')
    expect(avaliacao.avisos.some((a) => /fundo claro/i.test(a))).toBe(true)
  })

  it('no modo escuro, uma marca escura ganha um tom mais claro que contrasta com o fundo', () => {
    const avaliacao = avaliarCorDaMarca('#1f4d3a', 'estudio')
    expect(avaliacao.corNoEscuro).toBe('#4c7161')
    expect(contraste(avaliacao.corNoEscuro, '#141311')).toBeGreaterThanOrEqual(
      3,
    )
    // Uma marca já clara fica como está.
    expect(avaliarCorDaMarca('#f4ce23', 'brutal').corNoEscuro).toBe('#f4ce23')
  })

  it('o CSS da marca só sobrescreve tokens, com a face clara e a escura', () => {
    const css = cssDaMarca('#1f4d3a', 'estudio')
    expect(css).toContain('html[data-theme]')
    expect(css).toContain('html.dark[data-theme]')
    expect(css).toContain('--primary: #1f4d3a')
    expect(css).toContain('--primary-foreground: #ffffff')
    expect(css).toContain('--brand: #4c7161')
  })
})

describe('corSobre', () => {
  it('branco sobre fundo escuro, quase preto sobre fundo claro', () => {
    expect(corSobre('#2563eb')).toBe('#ffffff')
    expect(corSobre('#1f4d3a')).toBe('#ffffff')
    expect(corSobre('#facc15')).toBe('#111111')
    expect(corSobre('#ffffff')).toBe('#111111')
    expect(corSobre('#000000')).toBe('#ffffff')
  })

  it('cor inválida cai no branco', () => {
    expect(corSobre('azul')).toBe('#ffffff')
    expect(corSobre('')).toBe('#ffffff')
  })
})
