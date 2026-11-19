import { describe, expect, it } from 'vitest'
import {
  destinatarioLiberado,
  interpretarListaLiberada,
} from '#/regras/lista-liberada'

describe('lista liberada do ambiente de testes', () => {
  it('lê e-mails separados por vírgula, espaço ou ponto e vírgula', () => {
    expect(interpretarListaLiberada(' A@x.com, b@x.com;c@x.com ')).toEqual([
      'a@x.com',
      'b@x.com',
      'c@x.com',
    ])
    expect(interpretarListaLiberada(undefined)).toEqual([])
  })

  it('no ambiente de testes só vai para quem está na lista (sem diferenciar maiúsculas)', () => {
    expect(destinatarioLiberado('teste', 'ana@x.com', 'Ana@X.com')).toBe(true)
    expect(destinatarioLiberado('teste', 'ana@x.com', 'bia@x.com')).toBe(false)
  })

  it('no ambiente de testes sem lista ninguém é liberado', () => {
    expect(destinatarioLiberado('teste', undefined, 'ana@x.com')).toBe(false)
  })

  it('fora do ambiente de testes não há restrição', () => {
    expect(destinatarioLiberado('producao', '', 'qualquer@x.com')).toBe(true)
    expect(destinatarioLiberado(undefined, undefined, 'qualquer@x.com')).toBe(
      true,
    )
  })
})
