import { describe, expect, it } from 'vitest'

import { chaveValida, urlAssinadaUpload } from '#/lib/r2-presign'

const cfg = {
  accountId: 'conta-ficticia',
  accessKeyId: 'AKIAFICTICIO',
  secretAccessKey: 'segredo-ficticio',
  bucket: 'escola-arquivos',
}

describe('urlAssinadaUpload', () => {
  it('gera URL S3 do R2 assinada na query, com expiração', async () => {
    const url = new URL(
      await urlAssinadaUpload(cfg, 'aulas/modulo 1/video.mp4', 1234, 900),
    )
    expect(url.host).toBe('conta-ficticia.r2.cloudflarestorage.com')
    expect(url.pathname).toBe('/escola-arquivos/aulas/modulo%201/video.mp4')
    expect(url.searchParams.get('X-Amz-Expires')).toBe('900')
    expect(url.searchParams.get('X-Amz-SignedHeaders')).toBe(
      'content-length;host',
    )
    expect(url.searchParams.get('X-Amz-Algorithm')).toBe('AWS4-HMAC-SHA256')
    expect(url.searchParams.get('X-Amz-Signature')).toMatch(/^[0-9a-f]{64}$/)
    expect(url.searchParams.get('X-Amz-Credential')).toContain('AKIAFICTICIO/')
    expect(url.searchParams.get('X-Amz-Credential')).toContain(
      '/auto/s3/aws4_request',
    )
  })
})

describe('urlAssinadaUpload: validade e tamanho', () => {
  it('vale 15 minutos por padrão e o tamanho muda a assinatura', async () => {
    const a = new URL(await urlAssinadaUpload(cfg, 'k.bin', 10))
    const b = new URL(await urlAssinadaUpload(cfg, 'k.bin', 20))
    expect(a.searchParams.get('X-Amz-Expires')).toBe('900')
    expect(a.searchParams.get('X-Amz-Signature')).not.toBe(
      b.searchParams.get('X-Amz-Signature'),
    )
  })
})

describe('chaveValida', () => {
  it('aceita caminhos comuns e recusa travessia', () => {
    expect(chaveValida('aulas/a1.mp4')).toBe(true)
    for (const k of [
      '',
      '/x',
      '../x',
      'a/../b',
      'a//b',
      'a?b',
      'x'.repeat(201),
    ]) {
      expect(chaveValida(k)).toBe(false)
    }
  })
})
