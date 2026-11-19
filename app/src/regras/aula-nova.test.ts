import { describe, expect, it } from 'vitest'
import {
  listaAbertaInicial,
  marcoAoConcluir,
  rotuloDoModulo,
  situacaoDoModulo,
} from '#/regras/aula-nova'

describe('listaAbertaInicial', () => {
  it('lembra o que a aluna deixou neste aparelho', () => {
    expect(listaAbertaInicial('aberta', 800)).toBe(true)
    expect(listaAbertaInicial('fechada', 2000)).toBe(false)
  })
  it('sem lembrança, abre só em tela bem larga', () => {
    expect(listaAbertaInicial(null, 1440)).toBe(false)
    expect(listaAbertaInicial(null, 1920)).toBe(true)
  })
})

const modulos = [
  {
    id: 'm1',
    nome: 'Cores',
    aulas: [{ id: 'a1' }, { id: 'a2' }, { id: 'a3' }],
  },
  { id: 'm2', nome: 'Formas', aulas: [{ id: 'b1' }, { id: 'b2' }] },
]

describe('situacaoDoModulo', () => {
  it('diz quantas aulas faltam para fechar o módulo', () => {
    expect(situacaoDoModulo(modulos[0].aulas, ['a1'])).toEqual({
      feitas: 1,
      total: 3,
      faltam: 2,
      texto: 'faltam 2 aulas para fechar o módulo',
    })
  })
  it('usa o singular quando falta uma', () => {
    expect(situacaoDoModulo(modulos[0].aulas, ['a1', 'a2']).texto).toBe(
      'falta 1 aula para fechar o módulo',
    )
  })
  it('diz que o módulo está concluído quando nada falta', () => {
    expect(situacaoDoModulo(modulos[1].aulas, ['b1', 'b2']).texto).toBe(
      'módulo concluído',
    )
  })
  it('módulo vazio não diz nada', () => {
    expect(situacaoDoModulo([], []).texto).toBe('')
  })
})

describe('marcoAoConcluir', () => {
  it('é nulo quando a aula já estava concluída', () => {
    expect(marcoAoConcluir(modulos, ['a1'], 'a1', 'm1')).toBeNull()
  })
  it('é nulo quando o módulo ainda não fecha', () => {
    expect(marcoAoConcluir(modulos, ['a1'], 'a2', 'm1')).toBeNull()
  })
  it('fecha o módulo e diz quantas faltam no curso', () => {
    const r = marcoAoConcluir(modulos, ['a1', 'a2'], 'a3', 'm1')
    expect(r?.marco).toEqual({ tipo: 'modulo', moduloNome: 'Cores', faltam: 2 })
    expect(r?.anel).toEqual([
      { total: 3, feitas: 3 },
      { total: 2, feitas: 0 },
    ])
    expect(r?.percentual).toBe(60)
  })
  it('fecha o curso quando era a última', () => {
    const r = marcoAoConcluir(modulos, ['a1', 'a2', 'a3', 'b1'], 'b2', 'm2')
    expect(r?.marco).toEqual({ tipo: 'curso' })
    expect(r?.percentual).toBe(100)
  })
  it('módulo de uma aula só não ganha tela', () => {
    const so = [{ id: 'm', nome: 'FAQ', aulas: [{ id: 'x' }] }, modulos[0]]
    expect(marcoAoConcluir(so, [], 'x', 'm')).toBeNull()
  })
})

describe('rotuloDoModulo', () => {
  it('põe o número na frente de um nome comum', () => {
    expect(rotuloDoModulo(2, 'Primeiros passos')).toBe(
      'Módulo 2: Primeiros passos',
    )
  })
  it('não repete o prefixo quando o nome já começa com "Módulo N"', () => {
    expect(rotuloDoModulo(1, 'Módulo 1')).toBe('Módulo 1')
    expect(rotuloDoModulo(3, 'módulo 3: Pintura')).toBe('módulo 3: Pintura')
    expect(rotuloDoModulo(1, 'Modulo 1 - Início')).toBe('Modulo 1 - Início')
  })
  it('"Módulos" ou "Módulo" sem número não contam como prefixo', () => {
    expect(rotuloDoModulo(1, 'Módulo de bônus')).toBe(
      'Módulo 1: Módulo de bônus',
    )
  })
})
