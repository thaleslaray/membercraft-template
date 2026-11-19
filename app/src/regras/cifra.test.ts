import { describe, expect, it } from 'vitest'

import { cifrar, decifrar, ErroDeCifra } from '#/regras/cifra'

const CHAVE = 'chave-de-teste-com-mais-de-trinta-e-dois-caracteres'

describe('cifra dos segredos', () => {
  it('devolve o texto original e não deixa o segredo à vista', async () => {
    const cifrado = await cifrar('meu-segredo', CHAVE)
    expect(cifrado).not.toContain('meu-segredo')
    expect(await decifrar(cifrado, CHAVE)).toBe('meu-segredo')
  })

  it('o mesmo texto cifra diferente a cada vez (IV novo)', async () => {
    expect(await cifrar('x', CHAVE)).not.toBe(await cifrar('x', CHAVE))
  })

  it('chave errada ou valor adulterado não decifra', async () => {
    const cifrado = await cifrar('meu-segredo', CHAVE)
    await expect(decifrar(cifrado, `${CHAVE}-outra`)).rejects.toThrow(
      ErroDeCifra,
    )
    await expect(decifrar(`${cifrado}A`, CHAVE)).rejects.toThrow(ErroDeCifra)
    await expect(decifrar('lixo', CHAVE)).rejects.toThrow(ErroDeCifra)
  })

  it('recusa chave ausente ou curta demais', async () => {
    await expect(cifrar('x', undefined)).rejects.toThrow(ErroDeCifra)
    await expect(cifrar('x', 'curta')).rejects.toThrow(ErroDeCifra)
  })
})
