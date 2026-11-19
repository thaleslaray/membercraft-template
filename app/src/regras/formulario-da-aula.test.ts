import { describe, expect, it } from 'vitest'
import { validarAula } from '#/regras/formulario-da-aula'
import { temErros } from '#/regras/painel'

describe('formulário da aula', () => {
  it('título e vídeo válidos não têm erro', () => {
    expect(
      temErros(
        validarAula({ titulo: 'Aula 1', video: 'https://vimeo.com/123456' }),
      ),
    ).toBe(false)
    expect(
      temErros(validarAula({ titulo: 'Aula só de texto', video: '' })),
    ).toBe(false)
  })

  it('título vazio ou longo demais', () => {
    expect(validarAula({ titulo: '   ', video: '' }).titulo).toBe(
      'Informe o título da aula.',
    )
    expect(validarAula({ titulo: 'a'.repeat(201), video: '' }).titulo).toMatch(
      /no máximo 200/,
    )
  })

  it('vídeo que não é do Vimeo', () => {
    expect(
      validarAula({ titulo: 'Aula', video: 'youtube.com/x' }).video,
    ).toMatch(/Vimeo/)
  })
})
