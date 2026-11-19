import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  contraste,
  corDaBarra,
  extrairCartela,
  TRILHOS_DA_BARRA,
} from '#/lib/cartela'

describe('contraste', () => {
  it('preto sobre branco é 21 para 1', () => {
    expect(contraste('#000000', '#ffffff')).toBeCloseTo(21, 5)
  })
  it('cor igual não tem contraste', () => {
    expect(contraste('#336699', '#336699')).toBeCloseTo(1, 5)
  })
})

describe('corDaBarra', () => {
  const TRILHO_CLARO = '#f1f5f9'
  const TRILHO_ESCURO = '#1f232a'
  const CORES = [
    '#fde68a', // amarelo claro
    '#f9a8d4', // rosa claro
    '#c81e3c',
    '#1e5ac8',
    '#0b1b3a', // azul quase preto
    '#222831',
    '#7fbf9c',
    '#ffffff',
    '#000000',
  ]

  it('garante 3:1 contra o trilho no modo claro', () => {
    for (const cor of CORES) {
      const final = corDaBarra(cor, TRILHO_CLARO, 'claro')
      expect(
        contraste(final, TRILHO_CLARO),
        `${cor} -> ${final}`,
      ).toBeGreaterThanOrEqual(3)
    }
  })

  it('garante 3:1 contra o trilho no modo escuro', () => {
    for (const cor of CORES) {
      const final = corDaBarra(cor, TRILHO_ESCURO, 'escuro')
      expect(
        contraste(final, TRILHO_ESCURO),
        `${cor} -> ${final}`,
      ).toBeGreaterThanOrEqual(3)
    }
  })

  it('não mexe numa cor que já passa', () => {
    expect(corDaBarra('#c81e3c', TRILHO_CLARO, 'claro')).toBe('#c81e3c')
    expect(corDaBarra('#7fbf9c', TRILHO_ESCURO, 'escuro')).toBe('#7fbf9c')
  })

  it('escurece no claro e clareia no escuro, mantendo o tom', () => {
    const noClaro = corDaBarra('#fde68a', TRILHO_CLARO, 'claro')
    expect(noClaro).not.toBe('#fde68a')
    const r = Number.parseInt(noClaro.slice(1, 3), 16)
    const b = Number.parseInt(noClaro.slice(5, 7), 16)
    expect(r).toBeGreaterThan(b)
    const noEscuro = corDaBarra('#0b1b3a', TRILHO_ESCURO, 'escuro')
    expect(Number.parseInt(noEscuro.slice(5, 7), 16)).toBeGreaterThan(0x3a)
  })
})

/** Monta pixels RGBA com `n` pixels de cada cor. */
function pixels(
  ...grupos: [number, number, number, number][]
): Uint8ClampedArray {
  const lista: number[] = []
  for (const [r, g, b, n] of grupos) {
    for (let i = 0; i < n; i++) lista.push(r, g, b, 255)
  }
  return new Uint8ClampedArray(lista)
}

describe('extrairCartela', () => {
  it('põe a cor mais presente e saturada primeiro', () => {
    const cores = extrairCartela(pixels([200, 30, 60, 50], [30, 90, 200, 20]))
    expect(cores[0]).toBe('#c81e3c')
    expect(cores[1]).toBe('#1e5ac8')
  })

  it('deixa o fundo branco e o texto preto para trás das cores da capa', () => {
    const cores = extrairCartela(
      pixels([255, 255, 255, 500], [0, 0, 0, 200], [210, 120, 40, 30]),
    )
    expect(cores[0]).toBe('#d27828')
  })

  it('não repete cores quase iguais', () => {
    const cores = extrairCartela(
      pixels([200, 30, 60, 50], [205, 35, 62, 40], [30, 90, 200, 10]),
    )
    expect(cores).toHaveLength(2)
  })

  it('escurece a cor muito clara para ela aparecer sobre o fundo', () => {
    const [cor] = extrairCartela(pixels([250, 230, 240, 10]))
    const r = Number.parseInt(cor.slice(1, 3), 16)
    expect(r).toBeLessThan(250)
  })

  it('ignora pixels transparentes e devolve no máximo `quantas` cores', () => {
    const transparente = new Uint8ClampedArray([255, 0, 0, 0, 255, 0, 0, 0])
    expect(extrairCartela(transparente)).toEqual([])
    const muitas = extrairCartela(
      pixels(
        [200, 30, 60, 10],
        [30, 90, 200, 10],
        [30, 160, 60, 10],
        [220, 200, 30, 10],
        [120, 40, 160, 10],
        [20, 160, 170, 10],
      ),
      3,
    )
    expect(muitas).toHaveLength(3)
  })
})

describe('TRILHOS_DA_BARRA', () => {
  it('o trilho do módulo acompanha o token --muted do tema padrão, nos dois modos', () => {
    const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8')
    const muted = (seletor: string) =>
      new RegExp(`^${seletor} \\{[^}]*?--muted: (#[0-9a-f]{6});`, 'ms').exec(
        css,
      )?.[1]
    expect(muted(':root')).toBe(TRILHOS_DA_BARRA.modulo.claro)
    expect(muted('\\.dark')).toBe(TRILHOS_DA_BARRA.modulo.escuro)
  })
})
