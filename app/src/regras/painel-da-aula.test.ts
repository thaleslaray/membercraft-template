import { describe, expect, it } from 'vitest'
import {
  type EstadoDoPainel,
  painelInicial,
  reduzirPainel,
} from '#/regras/painel-da-aula'

type Marco = { nome: string }
const modulo: Marco = { nome: 'módulo 1' }
const curso: Marco = { nome: 'curso' }
const inicial = painelInicial<Marco>()
const com = (e: Partial<EstadoDoPainel<Marco>>): EstadoDoPainel<Marco> => ({
  ...inicial,
  ...e,
})

describe('painel da aula', () => {
  it('começa assistindo, sem nada pendente', () => {
    expect(inicial).toEqual({
      painel: 'assistindo',
      celebracao: null,
      pendente: null,
    })
  })

  it('terminar o vídeo sem marco pendente mostra o cartão do fim', () => {
    expect(reduzirPainel(inicial, { tipo: 'terminou' }).painel).toBe('fim')
  })

  it('terminar o vídeo com marco pendente celebra e zera o pendente', () => {
    const r = reduzirPainel(com({ pendente: modulo }), { tipo: 'terminou' })
    expect(r).toEqual({
      painel: 'celebracao',
      celebracao: modulo,
      pendente: null,
    })
  })

  it('concluir em silêncio guarda o marco sem abrir painel', () => {
    const r = reduzirPainel(inicial, {
      tipo: 'concluiu',
      marco: modulo,
      silencioso: true,
    })
    expect(r).toEqual({
      painel: 'assistindo',
      celebracao: null,
      pendente: modulo,
    })
  })

  it('concluir em silêncio sem marco limpa o pendente antigo', () => {
    const r = reduzirPainel(com({ pendente: modulo }), {
      tipo: 'concluiu',
      marco: null,
      silencioso: true,
    })
    expect(r.pendente).toBeNull()
  })

  it('concluir pelo botão com marco abre a celebração e fecha o cartão do fim', () => {
    const r = reduzirPainel(com({ painel: 'fim' }), {
      tipo: 'concluiu',
      marco: curso,
      silencioso: false,
    })
    expect(r.painel).toBe('celebracao')
    expect(r.celebracao).toBe(curso)
  })

  it('concluir pelo botão sem marco não muda nada', () => {
    const estado = com({ painel: 'fim' })
    expect(
      reduzirPainel(estado, {
        tipo: 'concluiu',
        marco: null,
        silencioso: false,
      }),
    ).toBe(estado)
  })

  it('abrir a avaliação substitui qualquer outro painel', () => {
    const r = reduzirPainel(com({ painel: 'celebracao', celebracao: modulo }), {
      tipo: 'abrirAvaliacao',
    })
    expect(r).toMatchObject({ painel: 'avaliando', celebracao: null })
  })

  it('fechar volta a assistindo e mantém o pendente', () => {
    const r = reduzirPainel(com({ painel: 'fim', pendente: modulo }), {
      tipo: 'fechar',
    })
    expect(r).toEqual({
      painel: 'assistindo',
      celebracao: null,
      pendente: modulo,
    })
  })

  it('trocar de aula volta a assistindo e zera o marco pendente', () => {
    const r = reduzirPainel(
      com({ painel: 'celebracao', celebracao: modulo, pendente: curso }),
      { tipo: 'trocouDeAula' },
    )
    expect(r).toEqual(inicial)
  })
})
