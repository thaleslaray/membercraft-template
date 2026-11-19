import { describe, expect, it } from 'vitest'
import { limparHtml, textoSemConteudo } from '#/regras/html-seguro'

describe('limparHtml', () => {
  it('mantém a formatação permitida', () => {
    const html =
      '<h2>Título</h2><p>Texto com <strong>força</strong> e <em>ênfase</em>.</p><ul><li>um</li></ul>'
    expect(limparHtml(html)).toBe(html)
  })

  it('remove script e style junto com o conteúdo', () => {
    expect(
      limparHtml('<p>oi</p><script>alert(1)</script><style>p{}</style>'),
    ).toBe('<p>oi</p>')
  })

  it('tira atributos de evento e de estilo', () => {
    expect(limparHtml('<p onclick="x()" style="color:red">oi</p>')).toBe(
      '<p>oi</p>',
    )
    expect(limparHtml('<img src="https://a.com/x.png" onerror="x()">')).toBe(
      '<img src="https://a.com/x.png" alt="" loading="lazy">',
    )
  })

  it('bloqueia link javascript: e deixa os seguros abrirem fora', () => {
    expect(limparHtml('<a href="javascript:alert(1)">x</a>')).toBe('<a>x</a>')
    expect(limparHtml('<a href="java\tscript:alert(1)">x</a>')).toBe('<a>x</a>')
    expect(limparHtml('<a href="https://helena.com">x</a>')).toBe(
      '<a href="https://helena.com" target="_blank" rel="noopener noreferrer">x</a>',
    )
  })

  it('descarta marcações fora da lista, mantendo o texto', () => {
    expect(
      limparHtml('<div><iframe src="https://x.com"></iframe>oi</div>'),
    ).toBe('oi')
  })

  it('só aceita imagem https', () => {
    expect(limparHtml('<img src="data:text/html;base64,AAA">')).toBe('')
    expect(limparHtml('<img src="http://a.com/x.png">')).toBe('')
  })

  describe('iframe', () => {
    const youtube = (src: string) =>
      limparHtml(
        `<iframe src="${src}" width="1" onload="x()" style="a:b"></iframe>`,
        { embeds: true },
      )
    const ESPERADO_YOUTUBE =
      '<iframe src="https://www.youtube-nocookie.com/embed/6HAD7LOSESI" title="Vídeo do YouTube" class="embed-youtube" loading="lazy" allow="accelerometer; encrypted-media; gyroscope; picture-in-picture" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>'

    it('aceita o embed do YouTube e normaliza para youtube-nocookie', () => {
      for (const src of [
        'https://www.youtube.com/embed/6HAD7LOSESI',
        'https://youtube.com/embed/6HAD7LOSESI?rel=0&start=3',
        'https://www.youtube-nocookie.com/embed/6HAD7LOSESI',
      ]) {
        expect(youtube(src)).toBe(ESPERADO_YOUTUBE)
      }
    })

    it('aceita o Typebot e descarta a consulta e os atributos extras', () => {
      expect(
        limparHtml(
          '<iframe id="x" allowfullscreen="true" style="border:0" src="https://bot.typebot.io/my-typebot-7-dkhjrmwv?name={{ first_name }}"></iframe>',
          { embeds: true },
        ),
      ).toBe(
        '<iframe src="https://bot.typebot.io/my-typebot-7-dkhjrmwv" title="Formulário interativo" class="embed-typebot" loading="lazy" allow="clipboard-write" referrerpolicy="strict-origin-when-cross-origin"></iframe>',
      )
    })

    it('aceita o TED, com ou sem idioma, e descarta a consulta', () => {
      const ted = (src: string) => youtube(src)
      const esperado = (src: string) =>
        `<iframe src="${src}" title="Vídeo do TED" class="embed-ted" loading="lazy" allow="accelerometer; encrypted-media; gyroscope; picture-in-picture" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>`
      expect(
        ted(
          'https://embed.ted.com/talks/martin_seligman_on_the_state_of_psychology?x=1',
        ),
      ).toBe(
        esperado(
          'https://embed.ted.com/talks/martin_seligman_on_the_state_of_psychology',
        ),
      )
      expect(
        ted('https://embed.ted.com/talks/lang/pt-br/martin_seligman'),
      ).toBe(esperado('https://embed.ted.com/talks/lang/pt-br/martin_seligman'))
    })

    it('TED sem embeds (texto da comunidade) é descartado', () => {
      expect(
        limparHtml('<iframe src="https://embed.ted.com/talks/abc"></iframe>'),
      ).toBe('')
    })

    it('recusa TED com caminho estranho, http ou host parecido', () => {
      for (const src of [
        'https://embed.ted.com/',
        'https://embed.ted.com/talks',
        'https://embed.ted.com/talks/a/b',
        'https://embed.ted.com/talks/lang/x',
        'https://embed.ted.com/outro/abc',
        'https://embed.ted.com:8443/talks/abc',
        'http://embed.ted.com/talks/abc',
        'https://embed.ted.com.evil.test/talks/abc',
        'https://user@embed.ted.com/talks/abc',
      ]) {
        expect(youtube(src)).toBe('')
      }
    })

    it('recusa qualquer outro host', () => {
      for (const src of [
        'https://evil.com/embed/6HAD7LOSESI',
        'https://www.youtube.com.evil.com/embed/6HAD7LOSESI',
        'https://evil.com/bot.typebot.io/abc',
        'https://bot.typebot.io.evil.com/abc',
        'https://user@bot.typebot.io/abc',
        'https://www.youtube.com/watch?v=6HAD7LOSESI',
        'https://www.youtube.com/embed/curto',
      ]) {
        expect(youtube(src)).toBe('')
      }
    })

    it('recusa javascript:, data: e http', () => {
      for (const src of [
        'javascript:alert(1)',
        'java\tscript:alert(1)',
        'data:text/html;base64,AAA',
        'http://www.youtube.com/embed/6HAD7LOSESI',
        '//www.youtube.com/embed/6HAD7LOSESI',
        'http://bot.typebot.io/abc',
      ]) {
        expect(youtube(src)).toBe('')
      }
      expect(limparHtml('<iframe></iframe>', { embeds: true })).toBe('')
    })

    it('tira atributos de evento e mantém o resto do texto', () => {
      const saida = limparHtml(
        '<p>antes</p><iframe src="https://www.youtube.com/embed/6HAD7LOSESI" onload="alert(1)" onerror="x()" srcdoc="<script>"></iframe><p>depois</p>',
        { embeds: true },
      )
      expect(saida).toBe(`<p>antes</p>${ESPERADO_YOUTUBE}<p>depois</p>`)
      expect(saida).not.toMatch(/onload|onerror|srcdoc/)
    })

    it('um marcador falso no texto não vira iframe', () => {
      expect(limparHtml('<p>\uE0000\uE000</p>', { embeds: true })).toBe(
        '<p>0</p>',
      )
    })

    it('sem embeds (texto da comunidade), descarta até YouTube e Typebot', () => {
      expect(
        limparHtml(
          '<p>a</p><iframe src="https://www.youtube.com/embed/6HAD7LOSESI"></iframe><iframe src="https://bot.typebot.io/abc"></iframe>',
        ),
      ).toBe('<p>a</p>')
    })
  })
})

describe('limparHtml: botão', () => {
  const saida =
    '<a href="https://exemplo.com/x" target="_blank" rel="noopener noreferrer" class="botao">ENTRAR</a>'
  const com = { embeds: true }
  it('data-botao vira botão com embeds', () => {
    expect(
      limparHtml('<a data-botao href="https://exemplo.com/x">ENTRAR</a>', com),
    ).toBe(saida)
    expect(
      limparHtml(
        '<a data-botao="1" href="https://exemplo.com/x">ENTRAR</a>',
        com,
      ),
    ).toBe(saida)
  })
  it('class="botao" também', () => {
    expect(
      limparHtml(
        '<a class="x botao" href="https://exemplo.com/x">ENTRAR</a>',
        com,
      ),
    ).toBe(saida)
  })
  it('sem embeds vira link comum', () => {
    expect(
      limparHtml('<a data-botao href="https://exemplo.com/x">ENTRAR</a>'),
    ).toBe(
      '<a href="https://exemplo.com/x" target="_blank" rel="noopener noreferrer">ENTRAR</a>',
    )
  })
  it('http e javascript: não viram botão', () => {
    expect(
      limparHtml('<a data-botao href="http://exemplo.com">E</a>', com),
    ).not.toContain('botao')
    const js = limparHtml(
      '<a class="botao" href="javascript:alert(1)">E</a>',
      com,
    )
    expect(js).not.toContain('botao')
    expect(js).not.toContain('javascript')
  })
  it('sem href com marca de botão é link comum', () => {
    expect(limparHtml('<a data-botao>E</a>', com)).toBe('<a>E</a>')
  })
  it('descarta atributos extras', () => {
    const r = limparHtml(
      '<a data-botao style="color:red" onclick="x()" href="https://exemplo.com/x">ENTRAR</a>',
      com,
    )
    expect(r).toBe(saida)
  })
})

describe('limparHtml: sem emenda de tags', () => {
  const perigos = (saida: string) => {
    // `onerror` como texto é inofensivo: o que não pode existir é a tag de verdade.
    expect(saida).not.toMatch(/<(img|script|iframe)/i)
    expect(saida).not.toMatch(/<[^>]*onerror/i)
  }

  it('apagar uma tag não cola o "<" anterior no texto seguinte', () => {
    const saida = limparHtml('<<x>img src=x onerror=alert(1)>')
    perigos(saida)
    expect(saida).toBe('&lt;img src=x onerror=alert(1)&gt;')
  })

  it('não forma iframe nem script por emenda', () => {
    perigos(limparHtml('<<b>iframe src="https://example.com">'))
    perigos(limparHtml('<scr<x>ipt>alert(1)</scr<x>ipt>'))
    perigos(limparHtml('<<x><x>img src=x onerror=alert(1)>', { embeds: true }))
  })

  it('aninhados repetidos continuam inofensivos', () => {
    perigos(limparHtml('<<<x>x>x>img src=x onerror=alert(1)>'))
    perigos(limparHtml('<<x><<x>script>alert(1)<</x>/script>'))
  })

  it('o marcador privado vindo da entrada é descartado', () => {
    expect(limparHtml('a\uE0010\uE001b')).toBe('a0b')
  })
})

describe('textoSemConteudo', () => {
  it('marcações vazias e espaços contam como sem conteúdo', () => {
    expect(textoSemConteudo('')).toBe(true)
    expect(textoSemConteudo('<p><p></p></p>')).toBe(true)
    expect(textoSemConteudo('<p>&nbsp;</p> <br>')).toBe(true)
  })

  it('texto, imagem ou embed contam como conteúdo', () => {
    expect(textoSemConteudo('<p>oi</p>')).toBe(false)
    expect(textoSemConteudo('<img src="https://a.com/x.png" alt="">')).toBe(
      false,
    )
    expect(
      textoSemConteudo(
        '<iframe src="https://www.youtube-nocookie.com/embed/6HAD7LOSESI"></iframe>',
      ),
    ).toBe(false)
  })
})
