import { describe, expect, it } from 'vitest'
import { formaDoDestaque, themeIds, themes } from '#/config/themes'

describe('formaDoDestaque', () => {
  it('o Luz de janela e o Ateliê têm o destaque amplo', () => {
    expect(formaDoDestaque('janela')).toBe('amplo')
    expect(formaDoDestaque('atelie')).toBe('amplo')
  })

  it('os outros temas ficam com o destaque em cartão', () => {
    for (const id of themeIds.filter((t) => t !== 'janela' && t !== 'atelie')) {
      expect(formaDoDestaque(id)).toBe('cartao')
    }
  })

  it('todo tema do registro declara a forma', () => {
    for (const t of themes) expect(['cartao', 'amplo']).toContain(t.destaque)
  })
})
