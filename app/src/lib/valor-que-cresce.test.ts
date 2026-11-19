import { describe, expect, it } from 'vitest'
import {
  chaveGuardada,
  curvaDeSaida,
  lerValorGuardado,
  pontoDePartida,
  valorNoQuadro,
} from '#/lib/valor-que-cresce'

describe('pontoDePartida', () => {
  it('sem valor guardado, o número aparece direto', () => {
    expect(
      pontoDePartida({ de: null, para: 120, menosMovimento: false }),
    ).toBeNull()
  })

  it('valor igual ao já visto não anima', () => {
    expect(
      pontoDePartida({ de: 120, para: 120, menosMovimento: false }),
    ).toBeNull()
  })

  it('valor que mudou parte do último visto', () => {
    expect(pontoDePartida({ de: 80, para: 120, menosMovimento: false })).toBe(
      80,
    )
    expect(pontoDePartida({ de: 120, para: 90, menosMovimento: false })).toBe(
      120,
    )
  })

  it('com menos movimento, vai direto ao valor final', () => {
    expect(
      pontoDePartida({ de: 80, para: 120, menosMovimento: true }),
    ).toBeNull()
  })

  it('ignora partida que não é número finito', () => {
    expect(
      pontoDePartida({ de: Number.NaN, para: 5, menosMovimento: false }),
    ).toBeNull()
  })
})

describe('curvaDeSaida', () => {
  it('começa em 0, termina em 1 e nunca passa de 1 (sem quique)', () => {
    expect(curvaDeSaida(0)).toBe(0)
    expect(curvaDeSaida(1)).toBe(1)
    for (let t = 0; t <= 1; t += 0.05) {
      expect(curvaDeSaida(t)).toBeLessThanOrEqual(1)
      expect(curvaDeSaida(t)).toBeGreaterThanOrEqual(0)
    }
  })

  it('sai rápido: no primeiro terço já passou da metade', () => {
    expect(curvaDeSaida(0.33)).toBeGreaterThan(0.5)
  })

  it('só cresce', () => {
    let anterior = 0
    for (let t = 0.01; t <= 1; t += 0.01) {
      const v = curvaDeSaida(t)
      expect(v).toBeGreaterThanOrEqual(anterior)
      anterior = v
    }
  })
})

describe('valorNoQuadro', () => {
  it('no início está no valor de partida', () => {
    expect(valorNoQuadro(100, 200, 0, 380)).toBe(100)
  })

  it('no último quadro (ou depois) está exatamente no valor final', () => {
    expect(valorNoQuadro(100, 200, 380, 380)).toBe(200)
    expect(valorNoQuadro(100, 200, 900, 380)).toBe(200)
  })

  it('no meio é um inteiro entre os dois valores', () => {
    const v = valorNoQuadro(100, 200, 100, 380)
    expect(Number.isInteger(v)).toBe(true)
    expect(v).toBeGreaterThan(100)
    expect(v).toBeLessThan(200)
  })

  it('também conta para baixo', () => {
    const v = valorNoQuadro(200, 100, 100, 380)
    expect(v).toBeLessThan(200)
    expect(v).toBeGreaterThan(100)
  })

  it('duração zero vai direto ao final', () => {
    expect(valorNoQuadro(1, 9, 0, 0)).toBe(9)
  })
})

describe('lerValorGuardado', () => {
  it('lê inteiros guardados', () => {
    expect(lerValorGuardado('1250')).toBe(1250)
    expect(lerValorGuardado('-30')).toBe(-30)
  })

  it('texto vazio, ausente ou estragado vira nulo', () => {
    expect(lerValorGuardado(null)).toBeNull()
    expect(lerValorGuardado('')).toBeNull()
    expect(lerValorGuardado('abc')).toBeNull()
    expect(lerValorGuardado('Infinity')).toBeNull()
  })
})

describe('chaveGuardada', () => {
  it('é por usuário e por lugar', () => {
    expect(chaveGuardada('u1', 'ranking-pontos:geral')).toBe(
      'mk:valor:u1:ranking-pontos:geral',
    )
    expect(chaveGuardada('u2', 'ranking-pontos:geral')).not.toBe(
      chaveGuardada('u1', 'ranking-pontos:geral'),
    )
    expect(chaveGuardada('u1', 'pontos-total')).not.toBe(
      chaveGuardada('u1', 'ranking-pontos:geral'),
    )
  })
})
