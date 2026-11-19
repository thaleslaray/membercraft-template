import { describe, expect, it } from 'vitest'
import { LIMITE_DA_REGRA, validarRegra } from '#/regras/formulario-da-regra'
import { temErros } from '#/regras/painel'

const base = {
  tipo: '',
  liberaEm: '',
  fechaEm: '',
  dias: '',
  pontos: '',
  alvoId: '',
}

describe('formulário da regra de liberação', () => {
  it('sem regra e regra bloqueada não têm campo a conferir', () => {
    expect(temErros(validarRegra(base))).toBe(false)
    expect(temErros(validarRegra({ ...base, tipo: 'bloqueado' }))).toBe(false)
  })

  it('data: liberação obrigatória e fechamento depois dela', () => {
    expect(validarRegra({ ...base, tipo: 'data' }).liberaEm).toMatch(/data/)
    expect(
      validarRegra({
        ...base,
        tipo: 'data',
        liberaEm: '2026-11-20',
        fechaEm: '2026-11-20',
      }).fechaEm,
    ).toMatch(/depois da liberação/)
    expect(
      temErros(
        validarRegra({
          ...base,
          tipo: 'data',
          liberaEm: '2026-11-20',
          fechaEm: '2026-11-21',
        }),
      ),
    ).toBe(false)
  })

  it('dias e pontos: inteiro de 1 ao limite', () => {
    expect(validarRegra({ ...base, tipo: 'dias_apos_compra' }).dias).toMatch(
      /dias após a compra/,
    )
    expect(
      validarRegra({
        ...base,
        tipo: 'pontuacao_minima',
        pontos: String(LIMITE_DA_REGRA + 1),
      }).pontos,
    ).toMatch(/pontuação mínima/)
    expect(
      temErros(validarRegra({ ...base, tipo: 'dias_apos_compra', dias: '7' })),
    ).toBe(false)
  })

  it('concluir algo exige escolher o quê', () => {
    expect(validarRegra({ ...base, tipo: 'aula_concluida' }).alvoId).toMatch(
      /Escolha/,
    )
  })
})
