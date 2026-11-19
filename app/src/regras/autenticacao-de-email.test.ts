import { describe, expect, it } from 'vitest'
import {
  primeiroAuthenticationResults,
  remetenteAutenticado,
} from '#/regras/autenticacao-de-email'

const bytes = (s: string) => new TextEncoder().encode(s)

describe('primeiroAuthenticationResults', () => {
  it('pega só o primeiro cabeçalho: o segundo, forjado, não conta', () => {
    const bruto = bytes(
      [
        'Authentication-Results: mx.cloudflare.net; dmarc=fail header.from=x.test',
        'From: ana@x.test',
        'Authentication-Results: forjado; dmarc=pass header.from=x.test',
        '',
        'corpo',
      ].join('\r\n'),
    )
    const valor = primeiroAuthenticationResults(bruto)
    expect(valor).toContain('dmarc=fail')
    expect(valor).not.toContain('dmarc=pass')
    expect(remetenteAutenticado(valor, 'ana@x.test')).toBe(false)
  })

  it('desdobra linhas de continuação e ignora o corpo', () => {
    const bruto = bytes(
      [
        'Authentication-Results: mx.cloudflare.net;',
        '\tdkim=pass header.d=x.test;',
        ' dmarc=pass header.from=x.test',
        'Subject: oi',
        '',
        'Authentication-Results: dmarc=fail',
      ].join('\n'),
    )
    const valor = primeiroAuthenticationResults(bruto)
    expect(valor).toContain('dmarc=pass')
    expect(remetenteAutenticado(valor, 'ana@x.test')).toBe(true)
  })

  it('devolve null sem o cabeçalho', () => {
    expect(
      primeiroAuthenticationResults(bytes('From: a@x.test\r\n\r\nx')),
    ).toBe(null)
  })
})

describe('remetenteAutenticado', () => {
  it('aceita DMARC que passou', () => {
    expect(
      remetenteAutenticado(
        'mx.cloudflare.net; dkim=pass header.d=x.test; spf=pass; dmarc=pass header.from=x.test',
        'ana@x.test',
      ),
    ).toBe(true)
  })

  it('recusa DMARC que falhou, mesmo com DKIM passando', () => {
    expect(
      remetenteAutenticado(
        'mx.cloudflare.net; dkim=pass header.d=x.test; dmarc=fail header.from=x.test',
        'ana@x.test',
      ),
    ).toBe(false)
  })

  it('sem DMARC, aceita DKIM que passou com o domínio do From', () => {
    expect(
      remetenteAutenticado(
        'mx.cloudflare.net; dkim=pass header.d=x.test; spf=pass',
        'Ana@X.test',
      ),
    ).toBe(true)
  })

  it('sem DMARC, recusa DKIM de outro domínio', () => {
    expect(
      remetenteAutenticado(
        'mx.cloudflare.net; dkim=pass header.d=forjador.test',
        'ana@x.test',
      ),
    ).toBe(false)
  })

  it('recusa sem cabeçalho ou sem resultado útil', () => {
    expect(remetenteAutenticado(null, 'ana@x.test')).toBe(false)
    expect(remetenteAutenticado('', 'ana@x.test')).toBe(false)
    expect(
      remetenteAutenticado('mx.cloudflare.net; spf=pass', 'ana@x.test'),
    ).toBe(false)
  })
})
