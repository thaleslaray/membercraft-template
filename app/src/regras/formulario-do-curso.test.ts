import { describe, expect, it } from 'vitest'
import {
  LIMITE_DA_CARGA_HORARIA,
  LIMITE_DO_NOME,
  validarCargaHoraria,
  validarCurso,
  validarNome,
  validarUrlDeVendas,
} from '#/regras/formulario-do-curso'
import { temErros } from '#/regras/painel'

describe('formulário do curso', () => {
  it('nome obrigatório e com limite igual ao do servidor', () => {
    expect(validarNome('  ', 'nome do módulo')).toBe(
      'Informe o nome do módulo.',
    )
    expect(validarNome('a'.repeat(LIMITE_DO_NOME + 1), 'nome do curso')).toBe(
      `O nome do curso pode ter no máximo ${LIMITE_DO_NOME} caracteres.`,
    )
    expect(validarNome('a'.repeat(LIMITE_DO_NOME), 'nome do curso')).toBe(
      undefined,
    )
  })

  it('carga horária: vazia vale; senão inteiro de 0 ao limite', () => {
    expect(validarCargaHoraria('')).toBeUndefined()
    expect(validarCargaHoraria('0')).toBeUndefined()
    expect(validarCargaHoraria(String(LIMITE_DA_CARGA_HORARIA))).toBeUndefined()
    expect(validarCargaHoraria(String(LIMITE_DA_CARGA_HORARIA + 1))).toMatch(
      /inteiro de horas/,
    )
    expect(validarCargaHoraria('-1')).toMatch(/inteiro de horas/)
    expect(validarCargaHoraria('2,5')).toMatch(/inteiro de horas/)
  })

  it('URL de vendas: vazia vale; só http(s)', () => {
    expect(validarUrlDeVendas('')).toBeUndefined()
    expect(
      validarUrlDeVendas('https://loja.exemplo.test/curso'),
    ).toBeUndefined()
    expect(validarUrlDeVendas('loja')).toMatch(/não é um endereço válido/)
    expect(validarUrlDeVendas('ftp://loja.test')).toMatch(/https:\/\//)
  })

  it('mostrar a todos exige a URL, no campo da URL', () => {
    const erros = validarCurso({
      nome: 'Curso',
      cargaHoraria: '',
      urlDeVendas: '',
      mostrarATodos: true,
    })
    expect(erros.urlDeVendas).toMatch(/URL da página de vendas/)
    expect(erros.nome).toBeUndefined()
    expect(
      temErros(
        validarCurso({
          nome: 'Curso',
          cargaHoraria: '12',
          urlDeVendas: 'https://x.test',
          mostrarATodos: true,
        }),
      ),
    ).toBe(false)
  })
})
