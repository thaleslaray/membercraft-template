import { describe, expect, it } from 'vitest'
import {
  estaLiberado,
  LIBERADO,
  textoDaSituacao,
  textoDoCadeado,
} from '#/regras/cadeado'

describe('texto do cadeado', () => {
  it('um motivo por situação', () => {
    const t = (motivo: Parameters<typeof textoDoCadeado>[0]['motivo']) =>
      textoDoCadeado({ tipo: 'cadeado', motivo })
    expect(t('bloqueado')).toBe('Conteúdo bloqueado')
    expect(t('fechado')).toBe('Este conteúdo foi encerrado')
    expect(t('acesso_expirado')).toBe('Seu acesso expirou')
    expect(t('sem_matricula')).toBe('Você não tem acesso a este conteúdo')
  })

  it('a data usa o dia de Brasília', () => {
    expect(
      textoDoCadeado({
        tipo: 'cadeado',
        motivo: 'data',
        liberaEm: new Date('2026-03-12T03:00:00Z'),
      }),
    ).toBe('Libera em 12/03')
  })

  it('1 dia após a compra no singular', () => {
    expect(
      textoDoCadeado({
        tipo: 'cadeado',
        motivo: 'dias_apos_compra',
        requisito: { tipo: 'dias', dias: 1 },
      }),
    ).toBe('Libera 1 dia após a compra')
  })

  it('liberado e oculto não têm texto', () => {
    expect(textoDaSituacao(LIBERADO)).toBeNull()
    expect(textoDaSituacao({ tipo: 'oculto' })).toBeNull()
    expect(estaLiberado(LIBERADO)).toBe(true)
    expect(estaLiberado({ tipo: 'oculto' })).toBe(false)
  })
})
