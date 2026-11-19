import { describe, expect, it } from 'vitest'
import {
  dataParaCampo,
  diaEmBrasilia,
  FUSO_DA_ESCOLA,
  FUSO_PADRAO,
  fimDoDiaEmBrasilia,
  formatarData,
  formatarDataHoraNoFuso,
  formatarDataNoFuso,
  formatarDiaEMes,
  fusoDoAluno,
  fusoValido,
  inicioDoDiaEmBrasilia,
} from '#/lib/datas'

describe('datas', () => {
  it('fim do dia em Brasília', () => {
    expect(fimDoDiaEmBrasilia('2026-06-30')?.toISOString()).toBe(
      '2026-07-01T02:59:59.000Z',
    )
    expect(formatarData(fimDoDiaEmBrasilia('2026-06-30'))).toBe('30/06/2026')
  })

  it('vazio ou inválido vira nulo', () => {
    for (const v of ['', '  ', null, undefined, '30/06/2026', '2026-13-45']) {
      expect(fimDoDiaEmBrasilia(v)).toBeNull()
    }
  })

  it('começo do dia em Brasília e o caminho de volta para o campo de data', () => {
    expect(inicioDoDiaEmBrasilia('2026-06-30')?.toISOString()).toBe(
      '2026-06-30T03:00:00.000Z',
    )
    expect(inicioDoDiaEmBrasilia('lixo')).toBeNull()
    expect(dataParaCampo(inicioDoDiaEmBrasilia('2026-06-30'))).toBe(
      '2026-06-30',
    )
    expect(dataParaCampo(fimDoDiaEmBrasilia('2026-06-30'))).toBe('2026-06-30')
    expect(dataParaCampo(null)).toBe('')
  })

  describe('no fuso do aluno', () => {
    // 2026-07-01 02:30 UTC: já é dia 1º em Lisboa e em Tóquio, ainda 30/06 em Brasília e Nova York.
    const instante = new Date('2026-07-01T02:30:00Z')

    it('mostra o dia e a hora de acordo com o fuso', () => {
      expect(formatarDataNoFuso(instante, 'America/Sao_Paulo')).toBe(
        '30/06/2026',
      )
      expect(formatarDataNoFuso(instante, 'Asia/Tokyo')).toBe('01/07/2026')
      expect(formatarDataHoraNoFuso(instante, 'Asia/Tokyo')).toContain('11:30')
      expect(formatarDataHoraNoFuso(instante, 'America/Sao_Paulo')).toContain(
        '23:30',
      )
    })

    it('as telas da equipe formatam no fuso da escola (Brasília)', () => {
      expect(FUSO_DA_ESCOLA).toBe('America/Sao_Paulo')
      expect(formatarDataHoraNoFuso(instante, FUSO_DA_ESCOLA)).toBe(
        '30/06/2026, 23:30',
      )
    })

    it('sem fuso ou com fuso inválido usa Brasília; sem data diz "sem data"', () => {
      expect(formatarDataNoFuso(instante, null)).toBe('30/06/2026')
      expect(formatarDataNoFuso(instante, 'Marte/Olympus')).toBe('30/06/2026')
      expect(fusoDoAluno(undefined)).toBe(FUSO_PADRAO)
      expect(formatarDataNoFuso(null, 'Asia/Tokyo')).toBe('sem data')
    })

    it('só aceita nome de fuso que existe', () => {
      expect(fusoValido('Europe/Lisbon')).toBe(true)
      expect(fusoValido('Marte/Olympus')).toBe(false)
      expect(fusoValido('')).toBe(false)
      expect(fusoValido(42)).toBe(false)
    })
  })

  it('o dia de Brasília de um instante, somado de dias', () => {
    // 01:00Z do dia 09 ainda é o dia 08 em Brasília (22:00).
    const instante = new Date('2026-03-09T01:00:00Z')
    expect(diaEmBrasilia(instante).toISOString()).toBe(
      '2026-03-08T03:00:00.000Z',
    )
    expect(diaEmBrasilia(instante, 7).toISOString()).toBe(
      '2026-03-15T03:00:00.000Z',
    )
    expect(formatarDiaEMes(instante)).toBe('08/03')
  })

  it('o dia e mês no fuso do aluno (Brasília se não tem fuso ou é inválido)', () => {
    const instante = new Date('2026-03-09T01:00:00Z')
    expect(formatarDiaEMes(instante, 'America/Sao_Paulo')).toBe('08/03')
    expect(formatarDiaEMes(instante, 'Europe/Lisbon')).toBe('09/03')
    expect(formatarDiaEMes(instante, 'Asia/Tokyo')).toBe('09/03')
    expect(formatarDiaEMes(instante, 'America/Los_Angeles')).toBe('08/03')
    expect(formatarDiaEMes(instante, null)).toBe('08/03')
    expect(formatarDiaEMes(instante, 'Marte/Olimpo')).toBe('08/03')
  })
})
