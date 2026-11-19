import { describe, expect, it } from 'vitest'
import {
  chaveDasImagensDoTexto,
  chaveDoEnvio,
  ErroDeAnexo,
  LIMITE_DO_ANEXO,
  limparTextoDaPublicacao,
  textoPuro,
  validarAnexos,
  validarEnvioDaComunidade,
} from '#/regras/anexos-da-comunidade'

const anexo = (chave: string, tamanho = 1000) => ({
  chave,
  nome: 'a.pdf',
  tipo: 'application/pdf',
  tamanho,
})

describe('envio de arquivos da comunidade', () => {
  it('aceita qualquer tipo de anexo até 10 MB e recusa o que passa disso ou está vazio', () => {
    expect(
      validarEnvioDaComunidade('anexo', {
        tipo: 'application/zip',
        tamanho: LIMITE_DO_ANEXO,
      }),
    ).toBeNull()
    expect(
      validarEnvioDaComunidade('anexo', {
        tipo: 'application/zip',
        tamanho: LIMITE_DO_ANEXO + 1,
      }),
    ).toMatch(/10 MB/)
    expect(
      validarEnvioDaComunidade('anexo', { tipo: 'x/y', tamanho: 0 }),
    ).toMatch(/vazio/)
  })

  it('imagens do texto só aceitam JPG, PNG, WebP e GIF (SVG fica de fora)', () => {
    expect(
      validarEnvioDaComunidade('imagem', { tipo: 'image/png', tamanho: 10 }),
    ).toBeNull()
    expect(
      validarEnvioDaComunidade('imagem', {
        tipo: 'image/svg+xml',
        tamanho: 10,
      }),
    ).toMatch(/imagem/)
  })

  it('a chave do anexo leva o id de quem enviou e um nome sem caminho', () => {
    const chave = chaveDoEnvio('anexo', 'ana', '../../etc/passwd', 'abc')
    expect(chave).toBe('comunidade/anexos/ana/abc/passwd')
  })
})

describe('validarAnexos', () => {
  it('aceita até 3 anexos da pasta de quem envia', () => {
    const lista = [1, 2, 3].map((n) =>
      anexo(`comunidade/anexos/ana/${n}/a.pdf`),
    )
    expect(validarAnexos('ana', lista)).toHaveLength(3)
  })

  it('recusa o quarto anexo', () => {
    const lista = [1, 2, 3, 4].map((n) =>
      anexo(`comunidade/anexos/ana/${n}/a.pdf`),
    )
    expect(() => validarAnexos('ana', lista)).toThrow(ErroDeAnexo)
  })

  it('recusa anexo acima de 10 MB e chave que não é de quem envia', () => {
    expect(() =>
      validarAnexos('ana', [
        anexo('comunidade/anexos/ana/1/a.pdf', LIMITE_DO_ANEXO + 1),
      ]),
    ).toThrow(/10 MB/)
    expect(() =>
      validarAnexos('ana', [anexo('comunidade/anexos/bia/1/a.pdf')]),
    ).toThrow(/inválido/)
    expect(() =>
      validarAnexos('ana', [anexo('comunidade/anexos/ana/../bia/1/a.pdf')]),
    ).toThrow(/inválido/)
  })

  it('a equipe pode manter um anexo que já era da publicação, mesmo de outra pessoa', () => {
    const chave = 'comunidade/anexos/ana/1/a.pdf'
    expect(validarAnexos('eq', [anexo(chave)], [chave])).toHaveLength(1)
  })

  it('recusa o mesmo anexo duas vezes', () => {
    const chave = 'comunidade/anexos/ana/1/a.pdf'
    expect(() => validarAnexos('ana', [anexo(chave), anexo(chave)])).toThrow(
      /já está/,
    )
  })
})

describe('limparTextoDaPublicacao', () => {
  it('tira script e eventos, mas guarda a formatação', () => {
    const html = limparTextoDaPublicacao(
      '<p onclick="x()">Oi <strong>tudo</strong></p><script>alert(1)</script>',
    )
    expect(html).toBe('<p>Oi <strong>tudo</strong></p>')
  })

  it('guarda só as imagens da própria comunidade', () => {
    const html = limparTextoDaPublicacao(
      [
        '<img src="/api/comunidade/imagens/u1/foto.png" alt="ok">',
        '<img src="https://rastreio.example/pixel.gif">',
        '<img src="/api/auth/sign-out">',
        '<img src="/api/comunidade/imagens/../../x">',
      ].join(''),
    )
    expect(html).toContain('/api/comunidade/imagens/u1/foto.png')
    expect(html).not.toContain('rastreio')
    expect(html).not.toContain('sign-out')
    expect(html).not.toContain('..')
  })

  it('textoPuro devolve só o texto, sem marcação', () => {
    expect(textoPuro('<p>Olá&nbsp;<b>mundo</b> &amp; todos</p>')).toBe(
      'Olá mundo & todos',
    )
  })
})

describe('imagens do texto da publicação', () => {
  it('acha as chaves do R2 das imagens, sem repetir e sem pegar imagem de fora', () => {
    const html =
      '<p>oi</p><img src="/api/comunidade/imagens/abc/foto.png" alt=""><img src="/api/comunidade/imagens/abc/foto.png"><img src="/api/comunidade/imagens/x%20y/outra.jpg"><img src="https://outro.site/a.png">'
    expect(chaveDasImagensDoTexto(html)).toEqual([
      'comunidade/imagens/abc/foto.png',
      'comunidade/imagens/x y/outra.jpg',
    ])
    expect(chaveDasImagensDoTexto('<p>sem imagem</p>')).toEqual([])
  })
})
