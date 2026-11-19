import { describe, expect, it } from 'vitest'
import { tiposDaTroca } from '#/lib/troca-de-tela'

describe('tiposDaTroca', () => {
  it('entre os dois destinos do topo só esmaece', () => {
    expect(tiposDaTroca('/', '/comunidades')).toEqual(['esmaecer'])
    expect(tiposDaTroca('/comunidades', '/')).toEqual(['esmaecer'])
  })
  it('entrar num item vem da direita', () => {
    expect(tiposDaTroca('/', '/cursos/abc')).toEqual(['avancar'])
    expect(tiposDaTroca('/comunidades', '/comunidades/publicacoes/p1')).toEqual(
      ['avancar'],
    )
  })
  it('entre itens do mesmo nível só esmaece', () => {
    expect(tiposDaTroca('/cursos/abc', '/aulas/a1')).toEqual(['esmaecer'])
  })
  it('voltar sai para a direita', () => {
    expect(tiposDaTroca('/cursos/abc', '/')).toEqual(['voltar'])
    expect(tiposDaTroca('/comunidades/publicacoes/p1', '/comunidades')).toEqual(
      ['voltar'],
    )
  })
  it('sem troca de caminho (só busca ou âncora) não faz transição', () => {
    expect(tiposDaTroca('/cursos/abc', '/cursos/abc')).toBe(false)
  })
  it('primeira navegação, sem origem, não faz transição', () => {
    expect(tiposDaTroca(undefined, '/cursos/abc')).toBe(false)
  })
  it('barra final não conta como outro nível', () => {
    expect(tiposDaTroca('/cursos/abc/', '/')).toEqual(['voltar'])
  })
})
