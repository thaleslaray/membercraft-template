import { describe, expect, it } from 'vitest'
import { ESTADO_DA_CONVERSA } from '#/regras/atendimento-estado'

describe('ESTADO_DA_CONVERSA', () => {
  it('cada estado tem rótulo e tom; só a Aberta pede atenção da equipe', () => {
    expect(ESTADO_DA_CONVERSA).toEqual({
      aberta: { rotulo: 'Aberta', tom: 'atencao' },
      respondida: { rotulo: 'Respondida', tom: 'neutro' },
      resolvida: { rotulo: 'Resolvida', tom: 'ok' },
    })
  })
})
