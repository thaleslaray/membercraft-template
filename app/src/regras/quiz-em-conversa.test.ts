import { describe, expect, it } from 'vitest'
import {
  lerRascunho,
  mensagensDeAbertura,
  pedeCampoLongo,
  quizEmConversa,
  respondida,
  textoDaResposta,
} from '#/regras/quiz-em-conversa'

const p = (tipo: string, extra = {}) => ({
  id: 'p',
  tipo,
  outro: false,
  grupoUmDe: null,
  ...extra,
})

describe('quizEmConversa', () => {
  it('vale só com formato conversa e perguntas que cabem', () => {
    expect(
      quizEmConversa({
        formato: 'conversa',
        perguntas: [p('unica'), p('texto_livre')],
      }),
    ).toBe(true)
    expect(quizEmConversa({ formato: 'lista', perguntas: [p('unica')] })).toBe(
      false,
    )
  })
  it('arquivo, Outro e grupo caem na lista', () => {
    expect(
      quizEmConversa({ formato: 'conversa', perguntas: [p('arquivo')] }),
    ).toBe(false)
    expect(
      quizEmConversa({
        formato: 'conversa',
        perguntas: [p('unica', { outro: true })],
      }),
    ).toBe(false)
    expect(
      quizEmConversa({
        formato: 'conversa',
        perguntas: [p('texto_livre', { grupoUmDe: 'g' })],
      }),
    ).toBe(false)
  })
})

describe('mensagensDeAbertura', () => {
  it('uma por linha, sem vazias', () => {
    expect(mensagensDeAbertura(' Oi \n\n  Tudo bem?  \n')).toEqual([
      'Oi',
      'Tudo bem?',
    ])
    expect(mensagensDeAbertura(null)).toEqual([])
  })
})

describe('pedeCampoLongo', () => {
  it('passa de 80 caracteres', () => {
    expect(pedeCampoLongo('a'.repeat(80))).toBe(false)
    expect(pedeCampoLongo('a'.repeat(81))).toBe(true)
  })
})

describe('textoDaResposta e respondida', () => {
  const escolha = {
    tipo: 'multipla',
    alternativas: [
      { id: 'a', texto: 'Sim' },
      { id: 'b', texto: 'Não' },
      { id: 'c', texto: 'Talvez' },
    ],
  }
  it('junta as alternativas marcadas', () => {
    expect(textoDaResposta(escolha, ['a', 'c'], '')).toBe('Sim, Talvez')
    expect(textoDaResposta(escolha, [], '')).toBeNull()
  })
  it('texto livre usa o texto aparado', () => {
    expect(
      textoDaResposta({ tipo: 'texto_livre', alternativas: [] }, [], '  Rio '),
    ).toBe('Rio')
    expect(
      textoDaResposta({ tipo: 'texto_livre', alternativas: [] }, [], '  '),
    ).toBeNull()
  })
  it('respondida: texto vazio não conta', () => {
    expect(respondida({ tipo: 'texto_livre' }, [], '   ')).toBe(false)
    expect(respondida({ tipo: 'unica' }, ['a'], '')).toBe(true)
  })
})

describe('lerRascunho', () => {
  const ids = ['p1', 'p2']
  it('lê um rascunho válido e descarta ids de outra versão', () => {
    const bruto = JSON.stringify({
      comecou: true,
      etapa: 1,
      respostas: { p1: ['a'], velho: ['x'] },
      textos: { p2: 'oi', velho: 'x' },
    })
    expect(lerRascunho(bruto, ids)).toEqual({
      comecou: true,
      etapa: 1,
      respostas: { p1: ['a'] },
      textos: { p2: 'oi' },
    })
  })
  it('lixo ou etapa fora do quiz vira nulo', () => {
    expect(lerRascunho(null, ids)).toBeNull()
    expect(lerRascunho('{', ids)).toBeNull()
    expect(
      lerRascunho(
        JSON.stringify({ comecou: true, etapa: 9, respostas: {}, textos: {} }),
        ids,
      ),
    ).toBeNull()
  })
})
