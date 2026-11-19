import { env } from 'cloudflare:workers'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  guardarNoBucket,
  receberArquivo,
  servirDoBucket,
} from '#/lib/arquivos-http'

function bucketCom(objetos: Record<string, { tipo?: string; corpo: string }>) {
  const guardados: { chave: string; tipo?: string }[] = []
  return {
    guardados,
    bucket: {
      get: vi.fn(async (chave: string) => {
        const o = objetos[chave]
        if (!o) return null
        return {
          body: new Blob([o.corpo]).stream(),
          size: o.corpo.length,
          httpMetadata: o.tipo ? { contentType: o.tipo } : undefined,
        }
      }),
      put: vi.fn(
        async (
          chave: string,
          _corpo: unknown,
          opcoes?: { httpMetadata?: { contentType?: string } },
        ) => {
          guardados.push({ chave, tipo: opcoes?.httpMetadata?.contentType })
        },
      ),
    },
  }
}

const stubEnv = env as unknown as Record<string, unknown>

beforeEach(() => {
  for (const k of Object.keys(stubEnv)) delete stubEnv[k]
})

describe('servirDoBucket', () => {
  it('responde 404 com o texto da rota quando o objeto não existe', async () => {
    Object.assign(env, { BUCKET: bucketCom({}).bucket })
    const res = await servirDoBucket('x', {
      naoEncontrado: 'Imagem não encontrada.',
      cache: 'private',
    })
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ erro: 'Imagem não encontrada.' })
  })

  it('usa o tipo do R2, depois o de reserva, depois octet-stream', async () => {
    Object.assign(env, {
      BUCKET: bucketCom({
        a: { tipo: 'image/png', corpo: 'a' },
        b: { corpo: 'b' },
      }).bucket,
    })
    const base = { naoEncontrado: 'x', cache: 'private, max-age=3600' }
    expect((await servirDoBucket('a', base)).headers.get('content-type')).toBe(
      'image/png',
    )
    expect(
      (
        await servirDoBucket('b', { ...base, tipoDeReserva: 'image/jpeg' })
      ).headers.get('content-type'),
    ).toBe('image/jpeg')
    expect((await servirDoBucket('b', base)).headers.get('content-type')).toBe(
      'application/octet-stream',
    )
  })

  it('com nome de download manda o arquivo como anexo, sem cache', async () => {
    Object.assign(env, {
      BUCKET: bucketCom({ m: { tipo: 'application/pdf', corpo: 'pdf!' } })
        .bucket,
    })
    const res = await servirDoBucket('m', {
      naoEncontrado: 'x',
      cache: 'private, no-store',
      tipo: 'application/pdf',
      nomeDoDownload: 'aula 1.pdf',
      cabecalhos: { 'x-content-type-options': 'nosniff' },
    })
    expect(res.headers.get('content-disposition')).toContain('attachment')
    expect(res.headers.get('content-length')).toBe('4')
    expect(res.headers.get('cache-control')).toBe('private, no-store')
    expect(res.headers.get('x-content-type-options')).toBe('nosniff')
  })
})

function pedidoComTamanho(corpo: FormData, tamanho?: string): Request {
  return new Request('http://x/', {
    method: 'POST',
    body: corpo,
    headers: tamanho ? { 'content-length': tamanho } : {},
  })
}

describe('upload', () => {
  it('recusa com 413 sem Content-Length ou acima do teto, antes de ler o corpo', async () => {
    const formulario = new FormData()
    formulario.set('arquivo', new File(['oi'], 'a.txt'))
    for (const tamanho of [undefined, String(1000 + 1024 * 1024 + 1), 'x']) {
      const r = await receberArquivo(
        pedidoComTamanho(formulario, tamanho),
        1000,
      )
      expect('erro' in r && r.erro.status).toBe(413)
    }
    const limite = await receberArquivo(
      pedidoComTamanho(formulario, String(1000 + 1024 * 1024)),
      1000,
    )
    expect('erro' in limite).toBe(false)
  })

  it('receberArquivo devolve o arquivo e o formulário, ou o 400 da rota', async () => {
    const formulario = new FormData()
    formulario.set('arquivo', new File(['oi'], 'a.txt', { type: 'text/plain' }))
    formulario.set('finalidade', 'anexo')
    const ok = await receberArquivo(pedidoComTamanho(formulario, '300'), 1000)
    expect('erro' in ok).toBe(false)
    if ('erro' in ok) return
    expect(ok.arquivo.name).toBe('a.txt')
    expect(ok.formulario.get('finalidade')).toBe('anexo')

    const sem = await receberArquivo(
      pedidoComTamanho(new FormData(), '100'),
      1000,
      'Escolha uma imagem.',
    )
    expect('erro' in sem && sem.erro.status).toBe(400)
    if ('erro' in sem) {
      expect(await sem.erro.json()).toEqual({ erro: 'Escolha uma imagem.' })
    }
  })

  it('guardarNoBucket grava com o tipo do arquivo (ou octet-stream) e devolve o tipo', async () => {
    const { bucket, guardados } = bucketCom({})
    Object.assign(env, { BUCKET: bucket })
    expect(
      await guardarNoBucket(
        'k1',
        new File(['x'], 'a.png', { type: 'image/png' }),
      ),
    ).toBe('image/png')
    expect(await guardarNoBucket('k2', new File(['x'], 'sem-tipo'))).toBe(
      'application/octet-stream',
    )
    expect(guardados).toEqual([
      { chave: 'k1', tipo: 'image/png' },
      { chave: 'k2', tipo: 'application/octet-stream' },
    ])
  })
})
