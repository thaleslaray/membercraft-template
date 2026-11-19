import { describe, expect, it } from 'vitest'
import {
  LIMITE_DO_TITULO_DO_BANNER,
  validarBanner,
} from '#/regras/formulario-do-banner'
import { temErros } from '#/regras/painel'

const valido = {
  titulo: 'Oferta',
  imagemComputador: 'imagens/pc.png',
  publico: 'todos',
  cursoIds: [],
  inicio: '',
  fim: '',
}

describe('formulário do banner', () => {
  it('banner completo não tem erro', () => {
    expect(temErros(validarBanner(valido))).toBe(false)
  })

  it('título e imagem são obrigatórios, no próprio campo', () => {
    const erros = validarBanner({
      ...valido,
      titulo: ' ',
      imagemComputador: null,
    })
    expect(erros.titulo).toBe('Informe o título do banner.')
    expect(erros.imagemComputador).toBe('Envie a imagem para computador.')
    expect(
      validarBanner({
        ...valido,
        titulo: 'a'.repeat(LIMITE_DO_TITULO_DO_BANNER + 1),
      }).titulo,
    ).toMatch(/no máximo 200/)
  })

  it('público por curso exige ao menos um curso', () => {
    expect(
      validarBanner({ ...valido, publico: 'com_matricula' }).cursoIds,
    ).toMatch(/pelo menos um curso/)
    expect(
      validarBanner({ ...valido, publico: 'com_matricula', cursoIds: ['c1'] })
        .cursoIds,
    ).toBeUndefined()
  })

  it('o fim não pode ser antes do início', () => {
    expect(
      validarBanner({ ...valido, inicio: '2026-12-10', fim: '2026-12-01' }).fim,
    ).toMatch(/antes da de início/)
  })
})
