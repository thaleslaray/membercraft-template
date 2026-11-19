import { describe, expect, it } from 'vitest'
import {
  ErroDeEmail,
  listaDeCursos,
  MODELOS_DE_EMAIL,
  modeloDe,
  montarEmail,
  previaDoEmail,
  primeiroNome,
  tipoDoEmailDeLiberacao,
  validarTexto,
  variaveisUsadas,
} from '#/regras/email-modelos'

describe('registro de e-mails', () => {
  it('tem os 12 e-mails do aluno e os 2 da equipe, sem tipo repetido', () => {
    expect(MODELOS_DE_EMAIL.filter((m) => m.destino === 'aluno')).toHaveLength(
      12,
    )
    expect(MODELOS_DE_EMAIL.filter((m) => m.destino === 'equipe')).toHaveLength(
      2,
    )
    const tipos = MODELOS_DE_EMAIL.map((m) => m.tipo)
    expect(new Set(tipos).size).toBe(tipos.length)
  })

  it('só Sentimos sua falta, Acesso expirando e Resposta ao comentário têm descadastro', () => {
    expect(
      MODELOS_DE_EMAIL.filter((m) => m.descadastro).map((m) => m.tipo),
    ).toEqual([
      'sentimos-sua-falta',
      'acesso-expirando',
      'resposta-ao-comentario',
    ])
  })

  it('só o código é travado', () => {
    expect(
      MODELOS_DE_EMAIL.filter((m) => !m.editavel).map((m) => m.tipo),
    ).toEqual(['codigo'])
  })

  it('o texto padrão de cada e-mail só usa as variáveis dele', () => {
    for (const m of MODELOS_DE_EMAIL) {
      for (const v of variaveisUsadas(`${m.assunto}\n${m.corpo}`)) {
        expect(Object.keys(m.variaveis), `${m.tipo}: ${v}`).toContain(v)
      }
    }
  })

  it('tipo desconhecido é erro', () => {
    expect(() => modeloDe('nao-existe')).toThrow(ErroDeEmail)
  })
})

describe('validarTexto', () => {
  const modelo = modeloDe('curso-liberado')

  it('aceita texto com variáveis do e-mail', () => {
    expect(
      validarTexto(modelo, {
        assunto: ' Oi {{nome}} ',
        corpo: 'Entre: {{link}}',
      }),
    ).toEqual({ assunto: 'Oi {{nome}}', corpo: 'Entre: {{link}}' })
  })

  it('recusa variável que o e-mail não tem', () => {
    expect(() =>
      validarTexto(modelo, { assunto: 'x', corpo: '{{link}} {{cpf}}' }),
    ).toThrow(/\{\{cpf\}\}/)
  })

  it('recusa assunto ou texto vazio', () => {
    expect(() =>
      validarTexto(modelo, { assunto: ' ', corpo: '{{link}}' }),
    ).toThrow(/assunto/)
    expect(() => validarTexto(modelo, { assunto: 'x', corpo: ' ' })).toThrow(
      /texto/,
    )
  })

  it('o e-mail com link de entrada precisa ter {{link}} no texto, e nunca no assunto', () => {
    expect(() =>
      validarTexto(modelo, { assunto: 'x', corpo: 'sem link' }),
    ).toThrow(/\{\{link\}\}/)
    expect(() =>
      validarTexto(modelo, { assunto: '{{link}}', corpo: '{{link}}' }),
    ).toThrow(/assunto/)
  })

  it('o código de acesso não aceita edição', () => {
    expect(() =>
      validarTexto(modeloDe('codigo'), { assunto: 'x', corpo: 'y' }),
    ).toThrow(/travado/)
  })
})

describe('montarEmail', () => {
  const modelo = modeloDe('curso-liberado')
  const valores = {
    nome: 'Ana',
    curso: 'Estilo <b>',
    link: 'https://x.com/entrar?t=1&a=2',
  }

  it('preenche as variáveis no assunto, no texto puro e no HTML (escapando o HTML)', () => {
    const { subject, text, html } = montarEmail(modelo, undefined, valores)
    expect(subject).toBe('Seu acesso a Estilo <b> está liberado')
    expect(text).toContain('Oi, Ana!')
    expect(text).toContain('https://x.com/entrar?t=1&a=2')
    expect(html).toContain('Estilo &lt;b&gt;')
    expect(html).not.toContain('Estilo <b>')
    expect(html).toContain('href="https://x.com/entrar?t=1&amp;a=2"')
  })

  it('usa o texto editado no lugar do padrão', () => {
    const { subject, text } = montarEmail(
      modelo,
      { assunto: 'Bem-vinda, {{nome}}', corpo: 'Vem: {{link}}' },
      valores,
    )
    expect(subject).toBe('Bem-vinda, Ana')
    expect(text).toContain('Vem: https://x.com/entrar?t=1&a=2')
  })

  it('o rodapé de descadastro só aparece nos e-mails marcados', () => {
    const marcado = montarEmail(
      modeloDe('sentimos-sua-falta'),
      undefined,
      { nome: 'Ana' },
      { linkDeDescadastro: 'https://x.com/descadastrar?u=1' },
    )
    expect(marcado.text).toContain('https://x.com/descadastrar?u=1')
    expect(marcado.html).toContain('https://x.com/descadastrar?u=1')
    const livre = montarEmail(modelo, undefined, valores, {
      linkDeDescadastro: 'https://x.com/descadastrar?u=1',
    })
    expect(livre.text).not.toContain('descadastrar')
    expect(livre.html).not.toContain('descadastrar')
  })

  it('a prévia usa os valores de exemplo', () => {
    const previa = previaDoEmail(modelo)
    expect(previa.subject).toBe('Seu acesso a Estilo na prática está liberado')
    expect(previa.text).toContain('Oi, Marina!')
  })
})

describe('primeiroNome', () => {
  it('pega só o primeiro nome e tem um jeito para quem ainda não informou', () => {
    expect(primeiroNome('  Marina Souza Lima ')).toBe('Marina')
    expect(primeiroNome('')).toBe('aluno(a)')
    expect(primeiroNome(undefined)).toBe('aluno(a)')
  })
})

describe('cursos liberados numa compra', () => {
  it('1 curso usa "curso-liberado"; 2 ou mais usam "cursos-liberados"', () => {
    expect(tipoDoEmailDeLiberacao(1)).toBe('curso-liberado')
    expect(tipoDoEmailDeLiberacao(2)).toBe('cursos-liberados')
    expect(tipoDoEmailDeLiberacao(7)).toBe('cursos-liberados')
  })

  it('o modelo mostra a lista de cursos, um por linha com "• "', () => {
    const modelo = modeloDe('cursos-liberados')
    expect(modelo.nome).toBe('Cursos liberados')
    const montado = montarEmail(modelo, undefined, {
      nome: 'Ana',
      cursos: listaDeCursos(['Coloração', 'Corte']),
      link: 'https://x.test/entrar',
    })
    expect(montado.subject).toBe('Seu acesso está liberado')
    expect(montado.text).toContain(
      'Sua compra liberou estes cursos:\n\n• Coloração\n• Corte\n\nClique',
    )
    expect(montado.html).toContain('• Coloração<br>• Corte')
  })
})
