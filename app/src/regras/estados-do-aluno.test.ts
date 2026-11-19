import { describe, expect, it } from 'vitest'
import {
  ESTADO_DA_MATRICULA,
  ESTADO_DO_CERTIFICADO,
  ESTADO_DO_ENVIO,
  estadoDoPedidoDoMec,
} from '#/regras/estados-do-aluno'

describe('estados do aluno no painel', () => {
  it('cobre cada situação com rótulo e tom', () => {
    for (const mapa of [
      ESTADO_DA_MATRICULA,
      ESTADO_DO_CERTIFICADO,
      ESTADO_DO_ENVIO,
    ]) {
      for (const e of Object.values(mapa)) {
        expect(e.rotulo.length).toBeGreaterThan(0)
        expect(['neutro', 'atencao', 'perigo', 'ok']).toContain(e.tom)
      }
    }
    expect(ESTADO_DA_MATRICULA.ativa.tom).toBe('ok')
    expect(ESTADO_DO_CERTIFICADO.revogado.tom).toBe('perigo')
    expect(ESTADO_DO_ENVIO.falhou.tom).toBe('perigo')
  })

  it('pedido do MEC: atraso e problema chamam atenção', () => {
    expect(estadoDoPedidoDoMec('liberado', false).tom).toBe('ok')
    expect(estadoDoPedidoDoMec('problema', false).tom).toBe('perigo')
    expect(estadoDoPedidoDoMec('na_fila', true).tom).toBe('perigo')
    expect(estadoDoPedidoDoMec('na_fila', false).tom).toBe('neutro')
  })
})
