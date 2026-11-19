import { describe, expect, it } from 'vitest'
import { interpretarVimeo, urlDoPlayer } from '#/regras/vimeo'

describe('interpretarVimeo', () => {
  it('lê só o número', () => {
    expect(interpretarVimeo('76979871')).toEqual({ id: '76979871', hash: null })
  })
  it('lê a URL da página, com hash de não listado', () => {
    expect(interpretarVimeo('https://vimeo.com/76979871/a1b2c3d4e5')).toEqual({
      id: '76979871',
      hash: 'a1b2c3d4e5',
    })
  })
  it('lê a URL pública sem hash', () => {
    expect(interpretarVimeo('https://vimeo.com/76979871')).toEqual({
      id: '76979871',
      hash: null,
    })
  })
  it('lê a URL do player e o iframe colado', () => {
    expect(
      interpretarVimeo(
        '<iframe src="https://player.vimeo.com/video/76979871?h=a1b2c3d4e5&badge=0"></iframe>',
      ),
    ).toEqual({ id: '76979871', hash: 'a1b2c3d4e5' })
  })
  it('devolve null quando não acha um vídeo', () => {
    expect(interpretarVimeo('https://youtube.com/watch?v=abc')).toBeNull()
    expect(interpretarVimeo('')).toBeNull()
  })
  it('monta o endereço do player', () => {
    expect(urlDoPlayer('123', null)).toBe('https://player.vimeo.com/video/123')
    expect(urlDoPlayer('123', 'abc')).toBe(
      'https://player.vimeo.com/video/123?h=abc',
    )
  })
})
