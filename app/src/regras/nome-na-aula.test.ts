import { describe, expect, it } from 'vitest'
import {
  personalizarMensagem,
  personalizarTexto,
  primeiroNome,
} from '#/regras/nome-na-aula'

describe('primeiroNome', () => {
  it('pega só a primeira palavra', () => {
    expect(primeiroNome('  Maria da Silva ')).toBe('Maria')
  })

  it('devolve vazio sem nome', () => {
    expect(primeiroNome(null)).toBe('')
    expect(primeiroNome('   ')).toBe('')
  })
})

describe('personalizarTexto', () => {
  it('troca a variável pelo primeiro nome', () => {
    expect(
      personalizarTexto(
        '<p>Seja muito bem vinda {{ first_name }}!</p>',
        'Ana Lima',
      ),
    ).toBe('<p>Seja muito bem vinda Ana!</p>')
  })

  it('aceita chaves com ou sem espaços', () => {
    expect(
      personalizarTexto('Oi {{first_name}} e {{  first_name  }}', 'Ana'),
    ).toBe('Oi Ana e Ana')
  })

  it('mantém a vírgula depois do nome', () => {
    expect(personalizarTexto('Olá {{ first_name }}, tudo bem?', 'Ana')).toBe(
      'Olá Ana, tudo bem?',
    )
  })

  it('escapa o nome como HTML', () => {
    expect(personalizarTexto('Oi {{ first_name }}', '<b>"X"</b> Y')).toBe(
      'Oi &lt;b&gt;&quot;X&quot;&lt;/b&gt;',
    )
  })

  it('sem nome, a variável some sem espaço duplo nem sobra', () => {
    expect(personalizarTexto('Seja bem vinda {{ first_name }}!', null)).toBe(
      'Seja bem vinda!',
    )
    expect(personalizarTexto('Olá {{ first_name }}, tudo bem?', '')).toBe(
      'Olá, tudo bem?',
    )
    expect(personalizarTexto('<p>{{ first_name }}, bem-vinda</p>', null)).toBe(
      '<p>bem-vinda</p>',
    )
  })

  it('não mexe em outras variáveis nem em texto sem variável', () => {
    expect(personalizarTexto('{{ last_name }} {{ first_name }}', 'Ana')).toBe(
      '{{ last_name }} Ana',
    )
    expect(personalizarTexto('<p>Nada</p>', 'Ana')).toBe('<p>Nada</p>')
  })
})

describe('personalizarMensagem', () => {
  it('troca {{name}} e {{ first_name }} pelo primeiro nome, sem escapar', () => {
    expect(personalizarMensagem('Oi {{name}}!', 'Maria Souza')).toBe(
      'Oi Maria!',
    )
    expect(personalizarMensagem('Oi {{ first_name }}!', 'Ana & Cia')).toBe(
      'Oi Ana!',
    )
    expect(personalizarMensagem('{{name}}, e aí?', "D'Ávila")).toBe(
      "D'Ávila, e aí?",
    )
  })

  it('sem nome, tira a variável e põe maiúscula no início', () => {
    expect(personalizarMensagem('Oi {{name}}!', null)).toBe('Oi!')
    expect(personalizarMensagem('{{name}}, me conta tudo', '')).toBe(
      'Me conta tudo',
    )
  })
})

describe('personalizarTexto com {{name}}', () => {
  it('também troca {{name}}', () => {
    expect(personalizarTexto('<p>Oi {{name}}</p>', 'Bia')).toBe('<p>Oi Bia</p>')
  })
})
