import { describe, expect, it } from 'vitest'
import {
  nomeDoArquivo,
  tipoDoArquivo,
  validarImagem,
} from '#/regras/aparencia-imagem'

describe('imagens da aparência', () => {
  it('aceita imagem até 5 MB e recusa o resto', () => {
    expect(validarImagem({ tipo: 'image/png', tamanho: 1024 })).toBeNull()
    expect(
      validarImagem({ tipo: 'image/svg+xml', tamanho: 5 * 1024 * 1024 }),
    ).toBeNull()
    expect(validarImagem({ tipo: 'application/pdf', tamanho: 10 })).toMatch(
      /imagem/i,
    )
    expect(
      validarImagem({ tipo: 'image/png', tamanho: 5 * 1024 * 1024 + 1 }),
    ).toMatch(/5 MB/)
  })

  it('nomeia o arquivo pelo campo, pelo instante e pela extensão do tipo, e serve com o mesmo tipo', () => {
    const relogio = () => new Date(1_700_000_000_000)
    const nome = nomeDoArquivo('fundoDoMenuUrl', 'image/jpeg', relogio)
    expect(nome).toBe('fundodomenu-1700000000000.jpg')
    expect(tipoDoArquivo(nome)).toBe('image/jpeg')
    expect(tipoDoArquivo('x.txt')).toBe('application/octet-stream')
  })
})
