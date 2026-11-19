import { describe, expect, it } from 'vitest'
import {
  arquivoAceito,
  chaveDeEntrega,
  chaveDeEntregaDoAluno,
  configDoR2,
  LIMITE_DO_ARQUIVO,
  LIMITE_DO_ENVIO_PELO_WORKER,
  validarArquivoDeEntrega,
} from '#/regras/entregas'

describe('arquivos de entrega do quiz', () => {
  it('a chave fica na pasta do aluno e usa nome seguro', () => {
    const chave = chaveDeEntrega('ana', 'Vídeo do exercício (1).mp4', 'u1')
    expect(chave).toBe('quiz/entregas/ana/u1/Video-do-exercicio-1.mp4')
    expect(chaveDeEntregaDoAluno(chave, 'ana')).toBe(true)
  })

  it('recusa chave de outro aluno, fora da pasta ou com ..', () => {
    expect(chaveDeEntregaDoAluno('quiz/entregas/bia/u1/a.pdf', 'ana')).toBe(
      false,
    )
    expect(chaveDeEntregaDoAluno('conteudo/materiais/a.pdf', 'ana')).toBe(false)
    expect(chaveDeEntregaDoAluno('quiz/entregas/ana/../bia/a.pdf', 'ana')).toBe(
      false,
    )
    // Prefixo parecido não vale: "ana" não é "ana2".
    expect(chaveDeEntregaDoAluno('quiz/entregas/ana2/u1/a.pdf', 'ana')).toBe(
      false,
    )
  })

  it('aceita até 500 MB direto no R2 e recusa vazio ou maior', () => {
    expect(
      validarArquivoDeEntrega({ tamanho: LIMITE_DO_ARQUIVO }, 'direto'),
    ).toBe(null)
    expect(validarArquivoDeEntrega({ tamanho: 0 }, 'direto')).toMatch(/vazio/)
    expect(
      validarArquivoDeEntrega({ tamanho: LIMITE_DO_ARQUIVO + 1 }, 'direto'),
    ).toMatch(/500 MB/)
  })

  it('pelo Worker (dev e e2e) o limite é menor', () => {
    expect(
      validarArquivoDeEntrega(
        { tamanho: LIMITE_DO_ENVIO_PELO_WORKER },
        'worker',
      ),
    ).toBe(null)
    expect(
      validarArquivoDeEntrega(
        { tamanho: LIMITE_DO_ENVIO_PELO_WORKER + 1 },
        'worker',
      ),
    ).toMatch(/90 MB/)
  })

  it('sem as credenciais do R2 o envio cai para o Worker', () => {
    expect(configDoR2({ R2_BUCKET_NAME: 'b' })).toBeNull()
    expect(
      configDoR2({
        R2_ACCOUNT_ID: 'a',
        R2_ACCESS_KEY_ID: 'k',
        R2_SECRET_ACCESS_KEY: 's',
        R2_BUCKET_NAME: 'b',
      }),
    ).toEqual({
      accountId: 'a',
      accessKeyId: 'k',
      secretAccessKey: 's',
      bucket: 'b',
    })
  })
})

describe('arquivoAceito', () => {
  it('qualquer, vazio e valor desconhecido aceitam tudo', () => {
    expect(arquivoAceito('qualquer', 'application/zip')).toBe(true)
    expect(arquivoAceito(undefined, 'application/zip')).toBe(true)
    expect(arquivoAceito('', 'video/mp4')).toBe(true)
  })

  it('imagem aceita image/* (HEIC e HEIF inclusos) e recusa PDF', () => {
    expect(arquivoAceito('imagem', 'image/png')).toBe(true)
    expect(arquivoAceito('imagem', 'image/heic')).toBe(true)
    expect(arquivoAceito('imagem', 'image/heif')).toBe(true)
    expect(arquivoAceito('imagem', 'application/pdf')).toBe(false)
    expect(arquivoAceito('imagem', 'video/mp4')).toBe(false)
  })

  it('pdf, audio e video aceitam só o seu tipo', () => {
    expect(arquivoAceito('pdf', 'application/pdf')).toBe(true)
    expect(arquivoAceito('pdf', 'image/png')).toBe(false)
    expect(arquivoAceito('audio', 'audio/mpeg')).toBe(true)
    expect(arquivoAceito('audio', 'video/mp4')).toBe(false)
    expect(arquivoAceito('video', 'video/quicktime')).toBe(true)
    expect(arquivoAceito('video', 'audio/mpeg')).toBe(false)
  })

  it('sem MIME vale a extensão do nome', () => {
    expect(arquivoAceito('imagem', '', 'IMG_1.HEIC')).toBe(true)
    expect(arquivoAceito('imagem', 'application/octet-stream', 'a.pdf')).toBe(
      false,
    )
    expect(arquivoAceito('pdf', '', 'a.pdf')).toBe(true)
    expect(arquivoAceito('pdf', '', 'semextensao')).toBe(false)
  })

  it('o MIME vale mais que o nome', () => {
    expect(arquivoAceito('imagem', 'application/pdf', 'foto.jpg')).toBe(false)
  })
})
