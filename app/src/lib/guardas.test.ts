import type { QueryClient } from '@tanstack/react-query'
import { describe, expect, it } from 'vitest'
import { exigirComunidadeLigada } from '#/lib/guardas'
import { aparenciaPadrao } from '#/regras/aparencia'

function contexto(mostrarComunidade: boolean) {
  return {
    queryClient: {
      ensureQueryData: async () => ({ ...aparenciaPadrao, mostrarComunidade }),
    } as unknown as QueryClient,
  }
}

describe('exigirComunidadeLigada', () => {
  it('com a Comunidade ligada, deixa passar', async () => {
    await expect(
      exigirComunidadeLigada(contexto(true)),
    ).resolves.toBeUndefined()
  })
  it('com a Comunidade desligada, redireciona para o Início', async () => {
    const erro = await exigirComunidadeLigada(contexto(false)).catch((e) => e)
    expect(erro).toMatchObject({ options: { to: '/' } })
  })
})
