import { describe, expect, it } from 'vitest'
import {
  avancarContagem,
  CONTAGEM_MS,
  modoDoFimDoVideo,
  segundosRestantes,
} from '#/regras/fim-do-video'

describe('modoDoFimDoVideo', () => {
  const base = { temProxima: true, liberada: true, tocarSozinha: true }

  it('com próxima liberada e a preferência ligada, conta 5 s', () => {
    expect(modoDoFimDoVideo(base)).toBe('contagem')
  })
  it('com a preferência desligada, anuncia a próxima sem contagem', () => {
    expect(modoDoFimDoVideo({ ...base, tocarSozinha: false })).toBe('manual')
  })
  it('próxima bloqueada mostra o cadeado, sem contagem, mesmo com a preferência ligada', () => {
    expect(modoDoFimDoVideo({ ...base, liberada: false })).toBe('bloqueada')
  })
  it('sem próxima aula, só a avaliação', () => {
    expect(modoDoFimDoVideo({ ...base, temProxima: false })).toBe('sem-proxima')
  })
})

describe('avancarContagem', () => {
  it('desconta o tempo que passou', () => {
    expect(avancarContagem(CONTAGEM_MS, 1000, false)).toEqual({
      restanteMs: 4000,
      terminou: false,
    })
  })
  it('pausada, o tempo não anda', () => {
    expect(avancarContagem(3000, 1000, true)).toEqual({
      restanteMs: 3000,
      terminou: false,
    })
  })
  it('termina ao zerar, sem passar de zero', () => {
    expect(avancarContagem(300, 500, false)).toEqual({
      restanteMs: 0,
      terminou: true,
    })
  })
})

describe('segundosRestantes', () => {
  it('arredonda para cima: 5 s inteiros no começo, 1 s até zerar', () => {
    expect(segundosRestantes(5000)).toBe(5)
    expect(segundosRestantes(4001)).toBe(5)
    expect(segundosRestantes(4000)).toBe(4)
    expect(segundosRestantes(1)).toBe(1)
    expect(segundosRestantes(0)).toBe(0)
  })
})
