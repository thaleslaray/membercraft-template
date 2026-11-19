import { describe, expect, it } from 'vitest'
import { gravarEstadoDeAviso, lerEstadoDeAviso } from '#/regras/estado-de-aviso'
import { criarBancoDeTeste } from '#/test/banco'

describe('estado das rotinas de aviso', () => {
  it('sem linha vale nulo; gravar de novo troca o número em vez de duplicar', async () => {
    const db = await criarBancoDeTeste()
    expect(await lerEstadoDeAviso(db, 'fila:x')).toBeNull()
    await gravarEstadoDeAviso(
      db,
      () => new Date('2026-06-01T12:00:00Z'),
      'fila:x',
      3,
    )
    expect(await lerEstadoDeAviso(db, 'fila:x')).toBe(3)
    await gravarEstadoDeAviso(
      db,
      () => new Date('2026-06-02T12:00:00Z'),
      'fila:x',
      0,
    )
    expect(await lerEstadoDeAviso(db, 'fila:x')).toBe(0)
    expect(await lerEstadoDeAviso(db, 'fila:y')).toBeNull()
  })
})
