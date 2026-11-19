import { env } from 'cloudflare:workers'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { sendEmail, sendEmailSafely } from '#/lib/email'

const params = {
  to: 'ana@exemplo.com',
  subject: 'Olá',
  html: '<p>Oi</p>',
  text: 'Oi',
}

const stubEnv = env as unknown as Record<string, unknown>

beforeEach(() => {
  for (const key of Object.keys(stubEnv)) delete stubEnv[key]
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('sendEmail', () => {
  it('sem provedor configurado imprime no console e não envia', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const result = await sendEmail(params)
    expect(result).toEqual({ sent: false, provider: 'console' })
    expect(log).toHaveBeenCalledOnce()
  })

  it('trata chave vazia como ausente', async () => {
    Object.assign(stubEnv, { RESEND_API_KEY: '   ' })
    vi.spyOn(console, 'log').mockImplementation(() => {})
    const result = await sendEmail(params)
    expect(result.provider).toBe('console')
  })

  it('com RESEND_API_KEY faz POST na API do Resend com Bearer', async () => {
    Object.assign(stubEnv, { RESEND_API_KEY: 're_teste' })
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ id: 'abc123' }), { status: 200 }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const result = await sendEmail(params)

    expect(result).toEqual({ sent: true, provider: 'resend', id: 'abc123' })
    expect(fetchMock).toHaveBeenCalledOnce()
    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ]
    expect(url).toBe('https://api.resend.com/emails')
    expect(init.method).toBe('POST')
    expect((init.headers as Record<string, string>).Authorization).toBe(
      'Bearer re_teste',
    )
    const body = JSON.parse(init.body as string)
    expect(body.to).toBe(params.to)
    expect(body.subject).toBe(params.subject)
  })

  it('erro HTTP do Resend lança com o status', async () => {
    Object.assign(stubEnv, { RESEND_API_KEY: 're_teste' })
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('chave inválida', { status: 401 })),
    )
    await expect(sendEmail(params)).rejects.toThrow(/401/)
  })

  it('com binding EMAIL e EMAIL_FROM (sem Resend) usa o Cloudflare', async () => {
    const send = vi.fn(async () => ({ messageId: 'cf-1' }))
    Object.assign(stubEnv, {
      EMAIL: { send },
      EMAIL_FROM: 'App <oi@exemplo.com>',
    })

    const result = await sendEmail(params)

    expect(result).toEqual({ sent: true, provider: 'cloudflare', id: 'cf-1' })
    expect(send).toHaveBeenCalledOnce()
  })

  it('erro do binding do Cloudflare lança com mensagem em pt-BR', async () => {
    Object.assign(stubEnv, {
      EMAIL: {
        send: vi.fn(async () => {
          throw Object.assign(new Error('falhou'), { code: 'E_X' })
        }),
      },
      EMAIL_FROM: 'oi@exemplo.com',
    })
    await expect(sendEmail(params)).rejects.toThrow(
      /Cloudflare Email Service \(E_X\)/,
    )
  })
})

describe('camada de envio trocável', () => {
  const fetchOk = () =>
    vi.fn(
      async () => new Response(JSON.stringify({ id: 'rs-1' }), { status: 200 }),
    )

  it('com os dois configurados, o Email Service vem primeiro e o Resend não é chamado', async () => {
    const send = vi.fn(async () => ({ messageId: 'cf-1' }))
    const fetchMock = fetchOk()
    vi.stubGlobal('fetch', fetchMock)
    Object.assign(stubEnv, {
      EMAIL: { send },
      EMAIL_FROM: 'Helena Duarte <escola@minhaescola.example>',
      RESEND_API_KEY: 're_teste',
    })

    const result = await sendEmail(params)

    expect(result.provider).toBe('cloudflare')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('se o Email Service falha, o Resend é o plano B', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const send = vi.fn(async () => {
      throw new Error('cota estourada')
    })
    vi.stubGlobal('fetch', fetchOk())
    Object.assign(stubEnv, {
      EMAIL: { send },
      EMAIL_FROM: 'Helena Duarte <escola@minhaescola.example>',
      RESEND_API_KEY: 're_teste',
    })

    const result = await sendEmail(params)

    expect(result).toEqual({ sent: true, provider: 'resend', id: 'rs-1' })
    expect(send).toHaveBeenCalledOnce()
  })

  it('se os dois falham, o erro diz os dois motivos', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('x', { status: 500 })),
    )
    Object.assign(stubEnv, {
      EMAIL: {
        send: vi.fn(async () => {
          throw new Error('cota')
        }),
      },
      EMAIL_FROM: 'oi@exemplo.com',
      RESEND_API_KEY: 're_teste',
    })
    await expect(sendEmail(params)).rejects.toThrow(
      /Cloudflare.*cota.*Resend.*500/,
    )
  })

  it('sem EMAIL_FROM o remetente é "Helena Duarte" de @minhaescola.example, com Reply-To no suporte', async () => {
    const fetchMock = fetchOk()
    vi.stubGlobal('fetch', fetchMock)
    Object.assign(stubEnv, { RESEND_API_KEY: 're_teste' })

    await sendEmail(params)

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(JSON.parse(init.body as string)).toMatchObject({
      from: 'Helena Duarte <escola@minhaescola.example>',
      reply_to: 'suporte@minhaescola.example',
    })
  })

  it('o binding sai com o Reply-To no suporte', async () => {
    const send = vi.fn(async () => ({ messageId: 'cf-1' }))
    Object.assign(stubEnv, {
      EMAIL: { send },
      EMAIL_FROM: 'Helena Duarte <escola@minhaescola.example>',
    })

    await sendEmail(params)

    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({ replyTo: 'suporte@minhaescola.example' }),
    )
  })
})

describe('ambiente de testes', () => {
  it('só envia para a lista liberada', async () => {
    const send = vi.fn(async () => ({ messageId: 'cf-1' }))
    vi.spyOn(console, 'log').mockImplementation(() => {})
    Object.assign(stubEnv, {
      AMBIENTE: 'teste',
      EMAIL_LISTA_LIBERADA: 'ana@exemplo.com',
      EMAIL_FROM: 'oi@exemplo.com',
      EMAIL: { send },
    })

    expect((await sendEmail(params)).provider).toBe('cloudflare')
    const bloqueado = await sendEmail({
      ...params,
      to: 'aluna-de-verdade@exemplo.com',
    })
    expect(bloqueado).toEqual({ sent: false, provider: 'bloqueado' })
    expect(send).toHaveBeenCalledOnce()
  })
})

describe('sendEmailSafely', () => {
  it('engole o erro e só registra no console', async () => {
    Object.assign(stubEnv, { RESEND_API_KEY: 're_teste' })
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('erro', { status: 500 })),
    )
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})

    await expect(sendEmailSafely(params)).resolves.toBeUndefined()
    expect(error).toHaveBeenCalledOnce()
  })
})
