import { describe, expect, it } from 'vitest'
import {
  type CampoDoModelo,
  LARGURA_DA_PAGINA,
} from '#/regras/certificado-modelo'
import {
  ajustarTextoDoCampo,
  larguraDisponivelDoCampo,
  medidaAproximada,
} from '#/regras/certificado-texto'

// Medida fictícia de 10 pt por letra a 20 pt de fonte (0,5 em por letra): fácil de conferir à mão.
const medir = (texto: string, tamanho: number) => texto.length * tamanho * 0.5

const campo = (parcial: Partial<CampoDoModelo> = {}): CampoDoModelo => ({
  campo: 'curso',
  lado: 'frente',
  x: 0.5,
  y: 0.5,
  tamanho: 20,
  fonte: 'helvetica',
  negrito: false,
  cor: '#000000',
  alinhamento: 'centro',
  ...parcial,
})

describe('largura disponível do campo', () => {
  it('centralizado: o dobro da menor distância até a borda, menos a margem dos dois lados', () => {
    const margem = LARGURA_DA_PAGINA * 0.05
    expect(larguraDisponivelDoCampo(campo({ x: 0.5 }))).toBeCloseTo(
      LARGURA_DA_PAGINA - 2 * margem,
    )
    expect(larguraDisponivelDoCampo(campo({ x: 0.25 }))).toBeCloseTo(
      LARGURA_DA_PAGINA * 0.5 - 2 * margem,
    )
  })
  it('à esquerda vai até a borda direita; à direita, até a esquerda', () => {
    const margem = LARGURA_DA_PAGINA * 0.05
    expect(
      larguraDisponivelDoCampo(campo({ alinhamento: 'esquerda', x: 0.1 })),
    ).toBeCloseTo(LARGURA_DA_PAGINA * 0.9 - margem)
    expect(
      larguraDisponivelDoCampo(campo({ alinhamento: 'direita', x: 0.9 })),
    ).toBeCloseTo(LARGURA_DA_PAGINA * 0.9 - margem)
  })
})

describe('ajuste do texto do campo', () => {
  it('texto curto não muda', () => {
    expect(ajustarTextoDoCampo('Maria', 20, 500, medir)).toEqual({
      linhas: ['Maria'],
      tamanho: 20,
    })
  })

  it('texto médio diminui a fonte até caber, sem passar de 30% de redução', () => {
    // 60 letras a 20 pt = 600 pt; a caixa tem 500 pt: cabe a 500/600 do tamanho (16,67 pt).
    const r = ajustarTextoDoCampo('a'.repeat(60), 20, 500, medir)
    expect(r.linhas).toHaveLength(1)
    expect(r.tamanho).toBeCloseTo(16.666, 2)
    expect(r.tamanho).toBeGreaterThanOrEqual(14)
    expect(medir(r.linhas[0], r.tamanho)).toBeLessThanOrEqual(500.001)
  })

  it('texto enorme quebra em 2 linhas no tamanho mínimo (70%), na fronteira de uma palavra', () => {
    const texto =
      'Formação completa em coloração avançada mechas e técnicas de platinado para salões'
    const r = ajustarTextoDoCampo(texto, 20, 500, medir)
    expect(texto.length * 20 * 0.5).toBeGreaterThan(500 / 0.7)
    expect(r.tamanho).toBe(14)
    expect(r.linhas).toHaveLength(2)
    expect(r.linhas.join(' ')).toBe(texto)
    for (const l of r.linhas) {
      expect(medir(l, r.tamanho)).toBeLessThanOrEqual(500)
    }
  })

  it('uma palavra gigante sem espaço nunca é cortada: a fonte cai abaixo do mínimo para caber', () => {
    const r = ajustarTextoDoCampo('x'.repeat(200), 20, 500, medir)
    expect(r.linhas).toEqual(['x'.repeat(200)])
    expect(r.tamanho).toBeLessThan(14)
    expect(medir(r.linhas[0], r.tamanho)).toBeLessThanOrEqual(500.001)
  })

  it('texto vazio devolve uma linha vazia no tamanho do modelo', () => {
    expect(ajustarTextoDoCampo('', 20, 500, medir)).toEqual({
      linhas: [''],
      tamanho: 20,
    })
  })
})

describe('medida aproximada (prévia)', () => {
  it('a fonte monoespaçada mede 0,6 em por letra e o negrito mede mais que o normal', () => {
    expect(medidaAproximada('abcd', 10, 'courier', false)).toBeCloseTo(24)
    expect(medidaAproximada('abcd', 10, 'helvetica', true)).toBeGreaterThan(
      medidaAproximada('abcd', 10, 'helvetica', false),
    )
  })
})
