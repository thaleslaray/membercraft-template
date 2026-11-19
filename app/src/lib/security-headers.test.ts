import { describe, expect, it } from 'vitest'

import {
  criarNonce,
  montarCsp,
  SECURITY_HEADERS,
  withSecurityHeaders,
} from '#/lib/security-headers'

const http = new Request('http://localhost:3040/')
const https = new Request('https://app.exemplo.com/')

describe('withSecurityHeaders', () => {
  it('adiciona os cabeçalhos de segurança', () => {
    const res = withSecurityHeaders(new Response('ok'), http)
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
      expect(res.headers.get(name)).toBe(value)
    }
  })

  it('envia HSTS só em https', () => {
    expect(
      withSecurityHeaders(new Response('ok'), http).headers.get(
        'strict-transport-security',
      ),
    ).toBeNull()
    expect(
      withSecurityHeaders(new Response('ok'), https).headers.get(
        'strict-transport-security',
      ),
    ).toContain('max-age=')
  })

  it('mantém os demais cabeçalhos da resposta original', () => {
    const res = withSecurityHeaders(
      new Response('ok', { headers: { 'x-custom': 'sim' } }),
      http,
    )
    expect(res.headers.get('x-custom')).toBe('sim')
  })

  it('não sobrescreve um cabeçalho que a resposta já trazia', () => {
    const res = withSecurityHeaders(
      new Response('ok', { headers: { 'x-frame-options': 'SAMEORIGIN' } }),
      http,
    )
    expect(res.headers.get('x-frame-options')).toBe('SAMEORIGIN')
  })

  it('preserva status, statusText e corpo', async () => {
    const res = withSecurityHeaders(
      new Response('quebrou', { status: 418, statusText: 'Bule' }),
      http,
    )
    expect(res.status).toBe(418)
    expect(res.statusText).toBe('Bule')
    expect(await res.text()).toBe('quebrou')
  })
})

// O Vimeo só libera o embed por domínio se receber o Referer da página.
// `no-referrer` e `same-origin` não mandam Referer ao Vimeo (outra origem) e quebram o player.
describe('Referrer-Policy compatível com o Vimeo', () => {
  const quebram = ['no-referrer', 'same-origin']

  it('no Worker não é no-referrer nem same-origin', () => {
    expect(quebram).not.toContain(SECURITY_HEADERS['Referrer-Policy'])
  })

  it('em public/_headers é igual à do Worker', async () => {
    const { readFileSync } = await import('node:fs')
    const arquivo = readFileSync(
      new URL('../../public/_headers', import.meta.url),
      'utf8',
    )
    const match = /Referrer-Policy:\s*(\S+)/.exec(arquivo)
    expect(match?.[1]).toBe(SECURITY_HEADERS['Referrer-Policy'])
    expect(quebram).not.toContain(match?.[1])
  })
})

describe('Content-Security-Policy', () => {
  const diretivas = (csp: string) =>
    Object.fromEntries(
      csp.split(';').map((d) => {
        const [nome, ...valores] = d.trim().split(/\s+/)
        return [nome, valores]
      }),
    )
  const csp = diretivas(
    montarCsp('abc123', 'https://conta.r2.cloudflarestorage.com'),
  )

  it('scripts só da própria origem e do nonce da resposta, sem unsafe-inline nem terceiros', () => {
    expect(csp['script-src']).toEqual(["'self'", "'nonce-abc123'"])
    expect(csp['script-src']).not.toContain("'unsafe-inline'")
    expect(csp['script-src'].some((v) => v.startsWith('http'))).toBe(false)
  })

  it('a própria origem (PDF entregue), o Vimeo, o YouTube (sem cookies), o Typebot e o TED podem ser embutidos', () => {
    expect(csp['frame-src']).toEqual([
      "'self'",
      'https://player.vimeo.com',
      'https://www.youtube-nocookie.com',
      'https://bot.typebot.io',
      'https://embed.ted.com',
    ])
    expect(csp['frame-ancestors']).toEqual(["'none'"])
  })

  it('o navegador só fala com a própria origem e com o R2 do upload assinado', () => {
    expect(csp['connect-src']).toEqual([
      "'self'",
      'https://conta.r2.cloudflarestorage.com',
    ])
  })

  it('imagens: própria origem, data/blob e https (o HTML da aula pode trazer imagem externa)', () => {
    expect(csp['img-src']).toEqual(["'self'", 'data:', 'blob:', 'https:'])
  })

  it('fecha o resto: sem object, base e form fora da origem', () => {
    expect(csp['default-src']).toEqual(["'self'"])
    expect(csp['object-src']).toEqual(["'none'"])
    expect(csp['base-uri']).toEqual(["'self'"])
    expect(csp['form-action']).toEqual(["'self'"])
  })

  it('sem a conta do R2 conhecida, libera só os endereços do R2', () => {
    expect(diretivas(montarCsp('n'))['connect-src']).toEqual([
      "'self'",
      'https://*.r2.cloudflarestorage.com',
    ])
  })

  it('o nonce é novo a cada resposta e não adivinhável', () => {
    const a = criarNonce()
    expect(a).not.toBe(criarNonce())
    expect(a).toMatch(/^[A-Za-z0-9+/=_-]{22,}$/)
  })

  it('withSecurityHeaders põe a política só quando recebe o nonce', () => {
    expect(
      withSecurityHeaders(new Response('ok'), http).headers.get(
        'content-security-policy',
      ),
    ).toBeNull()
    const res = withSecurityHeaders(new Response('ok'), http, {
      nonce: 'xyz',
    })
    expect(res.headers.get('content-security-policy')).toContain("'nonce-xyz'")
  })
})
