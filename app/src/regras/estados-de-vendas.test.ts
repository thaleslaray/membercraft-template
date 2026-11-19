import { describe, expect, it } from 'vitest'
import { podeReprocessarAviso } from '#/regras/estados-de-vendas'

describe('podeReprocessarAviso', () => {
  it('oferece reprocessar onde o aviso ainda pode mudar', () => {
    expect(podeReprocessarAviso('recebida')).toBe(true)
    expect(podeReprocessarAviso('sem_turma')).toBe(true)
    expect(podeReprocessarAviso('com_erro')).toBe(true)
  })

  it('não oferece numa venda já aplicada nem num aviso ignorado', () => {
    expect(podeReprocessarAviso('aplicada')).toBe(false)
    expect(podeReprocessarAviso('ignorada')).toBe(false)
  })
})
