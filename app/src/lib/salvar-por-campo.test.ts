import { describe, expect, it } from 'vitest'

import {
  criarSalvadorDeCampo,
  type EstadoDoCampo,
} from '#/lib/salvar-por-campo'

function montar(salvar: (valor: string) => Promise<void>, inicial = 'Ana') {
  const estados: EstadoDoCampo[] = []
  const salvador = criarSalvadorDeCampo({
    valorSalvo: inicial,
    salvar,
    aoMudar: (estado) => estados.push(estado),
  })
  return { salvador, estados }
}

describe('salvar por campo', () => {
  it('ao sair com valor novo mostra "salvando" e depois "salvo"', async () => {
    const chamadas: string[] = []
    const { salvador, estados } = montar(async (v) => {
      chamadas.push(v)
    })
    await salvador.sair('Ana Souza')
    expect(chamadas).toEqual(['Ana Souza'])
    expect(estados).toEqual([{ fase: 'salvando' }, { fase: 'salvo' }])
  })

  it('sair sem mudar nada não chama o servidor nem mostra nada', async () => {
    const chamadas: string[] = []
    const { salvador, estados } = montar(async (v) => {
      chamadas.push(v)
    })
    await salvador.sair('Ana')
    expect(chamadas).toEqual([])
    expect(estados).toEqual([])
  })

  it('o que acabou de ser salvo vira a nova base: sair de novo igual não repete', async () => {
    const chamadas: string[] = []
    const { salvador } = montar(async (v) => {
      chamadas.push(v)
    })
    await salvador.sair('Ana Souza')
    await salvador.sair('Ana Souza')
    expect(chamadas).toEqual(['Ana Souza'])
  })

  it('recusa do servidor mostra o motivo ao lado e não vira a base', async () => {
    let recusar = true
    const chamadas: string[] = []
    const { salvador, estados } = montar(async (v) => {
      chamadas.push(v)
      if (recusar) throw new Error('Informe o seu nome.')
    })
    await salvador.sair('')
    expect(estados.at(-1)).toEqual({
      fase: 'erro',
      erro: 'Informe o seu nome.',
    })
    // Sair de novo com o mesmo valor ruim tenta outra vez (não foi salvo).
    recusar = false
    await salvador.sair('')
    expect(chamadas).toEqual(['', ''])
    expect(estados.at(-1)).toEqual({ fase: 'salvo' })
  })

  it('erro que não é texto de regra vira mensagem padrão', async () => {
    const { salvador, estados } = montar(async () => {
      throw 'falha'
    })
    await salvador.sair('x')
    expect(estados.at(-1)).toEqual({
      fase: 'erro',
      erro: 'Não foi possível salvar. Tente de novo.',
    })
  })

  it('digitar tira o erro e o "salvo" da frente, sem travar', async () => {
    const { salvador, estados } = montar(async () => {
      throw new Error('Nome longo demais.')
    })
    await salvador.sair('x')
    salvador.digitar()
    expect(estados.at(-1)).toEqual({ fase: 'parado' })
  })

  it('resposta antiga não apaga o resultado da mais nova', async () => {
    const liberar: Array<() => void> = []
    const { salvador, estados } = montar(
      (v) =>
        new Promise<void>((resolve, reject) => {
          liberar.push(() =>
            v === 'a' ? reject(new Error('velho')) : resolve(),
          )
        }),
    )
    const primeira = salvador.sair('a')
    const segunda = salvador.sair('b')
    liberar[1]?.()
    await segunda
    liberar[0]?.()
    await primeira
    expect(estados.at(-1)).toEqual({ fase: 'salvo' })
  })
})
