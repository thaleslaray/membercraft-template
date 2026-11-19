import { describe, expect, it } from 'vitest'

import {
  type Acao,
  exigirPermissao,
  PermissaoNegada,
  podeFazer,
  rotuloDoPerfil,
  tratarPerfil,
} from '#/regras/permissoes'

const sensiveis: Acao[] = [
  'gerir-equipe',
  'configurar-area',
  'ligar-produto-da-voomp',
  'gerir-credenciais-da-hotmart',
  'exportar-dados',
  'excluir-aluno',
  'revogar-certificado',
  'ler-registro-de-acoes',
]
const diaADia: Acao[] = [
  'usar-estudio',
  'gerir-matriculas',
  'corrigir-quiz',
  'entrar-como',
]

describe('permissões por perfil', () => {
  it('o Proprietário faz tudo', () => {
    for (const acao of [...sensiveis, ...diaADia]) {
      expect(podeFazer('proprietario', acao)).toBe(true)
    }
  })

  it('a Equipe cuida do dia a dia, mas não do que é sensível', () => {
    for (const acao of diaADia) expect(podeFazer('equipe', acao)).toBe(true)
    for (const acao of sensiveis) expect(podeFazer('equipe', acao)).toBe(false)
  })

  it('o Aluno não faz nenhuma ação da equipe', () => {
    for (const acao of [...sensiveis, ...diaADia]) {
      expect(podeFazer('aluno', acao)).toBe(false)
    }
  })

  it('exigirPermissao lança PermissaoNegada quando o perfil não pode', () => {
    expect(() => exigirPermissao('equipe', 'exportar-dados')).toThrow(
      PermissaoNegada,
    )
    expect(() =>
      exigirPermissao('proprietario', 'exportar-dados'),
    ).not.toThrow()
  })

  it('perfil desconhecido ou ausente vira Aluno (o menor acesso)', () => {
    expect(tratarPerfil('equipe')).toBe('equipe')
    expect(tratarPerfil('admin')).toBe('aluno')
    expect(tratarPerfil(undefined)).toBe('aluno')
  })

  it('rotula os perfis em português', () => {
    expect(rotuloDoPerfil('aluno')).toBe('Aluno')
    expect(rotuloDoPerfil('equipe')).toBe('Equipe')
    expect(rotuloDoPerfil('proprietario')).toBe('Proprietário')
  })
})
