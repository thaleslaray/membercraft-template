import { describe, expect, it } from 'vitest'
import { diaEmBrasilia, diasUteisDesde, ehDiaUtil } from '#/regras/dias-uteis'

// 2026-06-01 é uma segunda-feira.
const em = (iso: string) => new Date(`${iso}T15:00:00Z`)

describe('dias úteis', () => {
  it('fim de semana não é útil, dia de semana é', () => {
    expect(ehDiaUtil('2026-06-05')).toBe(true) // sexta
    expect(ehDiaUtil('2026-06-06')).toBe(false) // sábado
    expect(ehDiaUtil('2026-06-07')).toBe(false) // domingo
  })

  it('feriado nacional fixo em dia de semana não é útil', () => {
    expect(ehDiaUtil('2026-09-07')).toBe(false) // segunda, Independência
    expect(ehDiaUtil('2026-12-25')).toBe(false) // sexta, Natal
    expect(ehDiaUtil('2026-11-20')).toBe(false) // sexta, Consciência Negra
  })

  it('o dia civil é o de Brasília: 01h UTC ainda é o dia anterior', () => {
    expect(diaEmBrasilia(new Date('2026-06-02T01:00:00Z'))).toBe('2026-06-01')
    expect(diaEmBrasilia(new Date('2026-06-02T03:00:00Z'))).toBe('2026-06-02')
  })

  it('no mesmo dia, 0; o dia do pedido não conta', () => {
    expect(diasUteisDesde(em('2026-06-01'), em('2026-06-01'))).toBe(0)
    expect(diasUteisDesde(em('2026-06-01'), em('2026-06-02'))).toBe(1)
  })

  it('pula sábado e domingo: segunda -> segunda seguinte são 5 dias úteis', () => {
    expect(diasUteisDesde(em('2026-06-01'), em('2026-06-05'))).toBe(4)
    expect(diasUteisDesde(em('2026-06-01'), em('2026-06-08'))).toBe(5)
    expect(diasUteisDesde(em('2026-06-01'), em('2026-06-09'))).toBe(6)
  })

  it('pedido feito no sábado só começa a contar na segunda', () => {
    expect(diasUteisDesde(em('2026-06-06'), em('2026-06-07'))).toBe(0)
    expect(diasUteisDesde(em('2026-06-06'), em('2026-06-08'))).toBe(1)
  })

  it('feriado nacional no meio do caminho não conta', () => {
    // Segunda 2026-08-31 -> segunda 2026-09-07 (feriado): só terça a sexta contam.
    expect(diasUteisDesde(em('2026-08-31'), em('2026-09-07'))).toBe(4)
    expect(diasUteisDesde(em('2026-08-31'), em('2026-09-08'))).toBe(5)
  })

  it('agora antes do início vale 0', () => {
    expect(diasUteisDesde(em('2026-06-05'), em('2026-06-01'))).toBe(0)
  })
})
