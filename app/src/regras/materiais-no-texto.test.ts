import { describe, expect, it } from 'vitest'
import { materiaisForaDoTexto } from '#/regras/materiais-no-texto'

const lista = [{ id: 'a1' }, { id: 'b2' }, { id: 'c-3' }]

describe('materiaisForaDoTexto', () => {
  it('sem link no texto, mantém todos', () => {
    expect(materiaisForaDoTexto(lista, '<p>oi</p>')).toEqual(lista)
    expect(materiaisForaDoTexto(lista, null)).toEqual(lista)
  })
  it('tira o citado por link relativo', () => {
    const html = '<a href="/api/materiais/b2">baixe</a>'
    expect(materiaisForaDoTexto(lista, html).map((m) => m.id)).toEqual([
      'a1',
      'c-3',
    ])
  })
  it('tira o citado por link absoluto', () => {
    const html =
      '<a href="https://escola.exemplo.com/api/materiais/c-3?x=1">baixe</a>'
    expect(materiaisForaDoTexto(lista, html).map((m) => m.id)).toEqual([
      'a1',
      'b2',
    ])
  })
  it('sobra zero quando todos são citados', () => {
    const html = '/api/materiais/a1 /api/materiais/b2 /api/materiais/c-3'
    expect(materiaisForaDoTexto(lista, html)).toEqual([])
  })
  it('não confunde id que é prefixo de outro', () => {
    const outros = [{ id: 'a1' }, { id: 'a12' }]
    expect(
      materiaisForaDoTexto(outros, '<a href="/api/materiais/a12">x</a>').map(
        (m) => m.id,
      ),
    ).toEqual(['a1'])
  })
})
