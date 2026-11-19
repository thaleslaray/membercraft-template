import { describe, expect, it } from 'vitest'
import {
  DESTINOS_DO_TOPO,
  destinoAtivo,
  destinosDoAluno,
} from '#/lib/destinos-da-casca'

describe('destinoAtivo', () => {
  it('há só dois destinos, com as rotas de hoje', () => {
    expect(DESTINOS_DO_TOPO.map((d) => [d.id, d.para])).toEqual([
      ['cursos', '/'],
      ['comunidade', '/comunidades'],
    ])
  })
  it('o Início e o que pertence aos cursos marcam Meus cursos', () => {
    for (const rota of [
      '/',
      '/cursos/c1',
      '/aulas/a1',
      '/favoritos',
      '/certificados',
      '/busca',
    ]) {
      expect(destinoAtivo(rota), rota).toBe('cursos')
    }
  })
  it('a Comunidade e o Ranking (por enquanto) marcam Comunidade', () => {
    for (const rota of [
      '/comunidades',
      '/comunidades/nova',
      '/comunidades/publicacoes/p1',
      '/ranking',
    ]) {
      expect(destinoAtivo(rota), rota).toBe('comunidade')
    }
  })
  it('lugares do menu do avatar não marcam nenhum destino', () => {
    for (const rota of [
      '/pontos',
      '/atendimento',
      '/atendimento/nova',
      '/atendimento/c1',
      '/conta',
    ]) {
      expect(destinoAtivo(rota), rota).toBeNull()
    }
  })
  it('ignora barra final', () => {
    expect(destinoAtivo('/comunidades/')).toBe('comunidade')
  })
})

describe('destinosDoAluno', () => {
  const pares = (d: { id: string; para: string }[]) =>
    d.map((x) => [x.id, x.para])

  it('padrão e ligada: Meus cursos e Comunidade, como sempre', () => {
    expect(pares(destinosDoAluno())).toEqual(pares(DESTINOS_DO_TOPO))
    expect(pares(destinosDoAluno({ mostrarComunidade: true }))).toEqual([
      ['cursos', '/'],
      ['comunidade', '/comunidades'],
    ])
  })
  it('desligada: Falar com a equipe ocupa o lugar da Comunidade', () => {
    const destinos = destinosDoAluno({ mostrarComunidade: false })
    expect(pares(destinos)).toEqual([
      ['cursos', '/'],
      ['atendimento', '/atendimento'],
    ])
    expect(destinos[1].rotulo).toBe('Falar com a equipe')
  })
  it('desligada: o atendimento marca o próprio destino', () => {
    for (const rota of ['/atendimento', '/atendimento/nova', '/atendimento/']) {
      expect(destinoAtivo(rota, { mostrarComunidade: false }), rota).toBe(
        'atendimento',
      )
    }
    expect(destinoAtivo('/atendimento')).toBeNull()
  })
})
