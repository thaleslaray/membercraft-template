import { describe, expect, it } from 'vitest'
import {
  assinarDescadastro,
  descadastroValido,
  linkDeDescadastro,
} from '#/regras/descadastro'

describe('link de descadastro', () => {
  it('a assinatura do próprio par aluno+tipo vale', async () => {
    const s = await assinarDescadastro('segredo', 'u1', 'sentimos-sua-falta')
    expect(
      await descadastroValido('segredo', 'u1', 'sentimos-sua-falta', s),
    ).toBe(true)
  })

  it('não vale para outro aluno, outro tipo ou outro segredo', async () => {
    const s = await assinarDescadastro('segredo', 'u1', 'sentimos-sua-falta')
    expect(
      await descadastroValido('segredo', 'u2', 'sentimos-sua-falta', s),
    ).toBe(false)
    expect(
      await descadastroValido('segredo', 'u1', 'acesso-expirando', s),
    ).toBe(false)
    expect(
      await descadastroValido('outro', 'u1', 'sentimos-sua-falta', s),
    ).toBe(false)
    expect(
      await descadastroValido('segredo', 'u1', 'sentimos-sua-falta', 'x'),
    ).toBe(false)
  })

  it('o link leva aluno, tipo e assinatura', async () => {
    const link = await linkDeDescadastro(
      'https://escola.exemplo.com/',
      'segredo',
      'u1',
      'acesso-expirando',
    )
    const url = new URL(link)
    expect(url.pathname).toBe('/descadastrar')
    expect(url.searchParams.get('u')).toBe('u1')
    expect(url.searchParams.get('t')).toBe('acesso-expirando')
    expect(
      await descadastroValido(
        'segredo',
        'u1',
        'acesso-expirando',
        url.searchParams.get('s') ?? '',
      ),
    ).toBe(true)
  })
})
