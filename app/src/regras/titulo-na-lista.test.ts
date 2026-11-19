import { describe, expect, it } from 'vitest'
import { tituloNaLista } from '#/regras/aula-nova'

describe('tituloNaLista', () => {
  it('tira o código e a etiqueta de exercício', () => {
    expect(
      tituloNaLista('A101 - [EXERCÍCIO] Elaborar o exercício de exemplo'),
    ).toEqual({ titulo: 'Elaborar o exercício de exemplo', exercicio: true })
  })
  it('aceita sem código e sem acento', () => {
    expect(tituloNaLista('[Exercicio] Cronograma')).toEqual({
      titulo: 'Cronograma',
      exercicio: true,
    })
  })
  it('deixa os outros títulos como estão', () => {
    expect(tituloNaLista('1ª Etapa - Encontro com a Cliente')).toEqual({
      titulo: '1ª Etapa - Encontro com a Cliente',
      exercicio: false,
    })
    expect(tituloNaLista('[EXERCÍCIO]')).toEqual({
      titulo: '[EXERCÍCIO]',
      exercicio: false,
    })
  })
})
