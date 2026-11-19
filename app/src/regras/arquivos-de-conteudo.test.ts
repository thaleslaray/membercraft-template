import { describe, expect, it } from 'vitest'
import {
  cabecalhoDeDownload,
  chaveDeImagemValida,
  chaveDeMaterialValida,
  chaveDoArquivo,
  LIMITE_DA_IMAGEM,
  nomeSeguroDoArquivo,
  validarEnvio,
} from '#/regras/arquivos-de-conteudo'

describe('arquivos de conteúdo', () => {
  it('limpa o nome do arquivo e tira caminhos', () => {
    expect(nomeSeguroDoArquivo('../../Guia de Estilo (final).pdf')).toBe(
      'Guia-de-Estilo-final.pdf',
    )
    expect(nomeSeguroDoArquivo('Apostila Coloração.pdf')).toBe(
      'Apostila-Coloracao.pdf',
    )
    expect(nomeSeguroDoArquivo('???')).toBe('arquivo')
  })

  it('monta a chave por finalidade', () => {
    expect(chaveDoArquivo('imagem', 'capa.png', 'abc')).toBe(
      'conteudo/imagens/abc/capa.png',
    )
    expect(chaveDoArquivo('material', 'guia.pdf', 'xyz')).toBe(
      'conteudo/materiais/xyz/guia.pdf',
    )
  })

  it('só aceita imagem comum e até 8 MB nas capas', () => {
    expect(
      validarEnvio('imagem', { tipo: 'image/png', tamanho: 100 }),
    ).toBeNull()
    expect(
      validarEnvio('imagem', { tipo: 'image/svg+xml', tamanho: 100 }),
    ).toMatch(/JPG, PNG/)
    expect(
      validarEnvio('imagem', {
        tipo: 'image/png',
        tamanho: LIMITE_DA_IMAGEM + 1,
      }),
    ).toMatch(/8 MB/)
    expect(
      validarEnvio('material', { tipo: 'application/pdf', tamanho: 0 }),
    ).toMatch(/vazio/)
    expect(
      validarEnvio('material', { tipo: 'application/pdf', tamanho: 5_000_000 }),
    ).toBeNull()
  })

  it('não deixa uma chave escapar do prefixo', () => {
    expect(chaveDeImagemValida('conteudo/imagens/a/b.png')).toBe(true)
    expect(chaveDeImagemValida('conteudo/materiais/a/b.pdf')).toBe(false)
    expect(chaveDeImagemValida('conteudo/imagens/../materiais/a.pdf')).toBe(
      false,
    )
    expect(chaveDeMaterialValida('conteudo/materiais/a/b.pdf')).toBe(true)
    expect(chaveDeMaterialValida('backups/d1.sql')).toBe(false)
  })

  it('o download sai como anexo, com o nome certo', () => {
    expect(cabecalhoDeDownload('Guia de Coloração.pdf')).toBe(
      `attachment; filename="Guia-de-Coloracao.pdf"; filename*=UTF-8''Guia%20de%20Colora%C3%A7%C3%A3o.pdf`,
    )
  })

  it('com `naTela`, imagem e PDF abrem na tela (inline), com o mesmo nome', () => {
    expect(cabecalhoDeDownload('Guia de Coloração.pdf', true)).toBe(
      `inline; filename="Guia-de-Coloracao.pdf"; filename*=UTF-8''Guia%20de%20Colora%C3%A7%C3%A3o.pdf`,
    )
  })
})
