import { describe, expect, it } from 'vitest'

import { session, user, verification } from '#/db/schema'
import {
  expiracaoDaSessao,
  expiracaoNaRenovacao,
  limparExpirados,
  precisaRenovar,
} from '#/regras/sessao'
import { criarBancoDeTeste } from '#/test/banco'

const agora = new Date('2026-01-10T12:00:00Z')

describe('duração da sessão', () => {
  it('o aluno fica 30 dias', () => {
    expect(expiracaoDaSessao('aluno', agora).toISOString()).toBe(
      '2026-02-09T12:00:00.000Z',
    )
  })

  it('a equipe e o proprietário ficam 7 dias', () => {
    expect(expiracaoDaSessao('equipe', agora).toISOString()).toBe(
      '2026-01-17T12:00:00.000Z',
    )
    expect(expiracaoDaSessao('proprietario', agora).toISOString()).toBe(
      '2026-01-17T12:00:00.000Z',
    )
  })
})

describe('quando a sessão precisa renovar (1 dia de uso, prazo do perfil)', () => {
  const DIA = 86_400_000
  const criada = new Date('2026-01-10T12:00:00Z')

  it('a equipe recém-criada não renova', () => {
    const expira = expiracaoDaSessao('equipe', criada)
    expect(precisaRenovar('equipe', expira, criada)).toBe(false)
    expect(
      precisaRenovar('equipe', expira, new Date(criada.getTime() + DIA - 1)),
    ).toBe(false)
  })

  it('a equipe com 1 dia de uso renova', () => {
    const expira = expiracaoDaSessao('equipe', criada)
    expect(
      precisaRenovar('equipe', expira, new Date(criada.getTime() + DIA)),
    ).toBe(true)
    expect(
      precisaRenovar(
        'proprietario',
        expira,
        new Date(criada.getTime() + 3 * DIA),
      ),
    ).toBe(true)
  })

  it('o aluno recém-criado não renova; com 1 dia renova (prazo de 30 dias)', () => {
    const expira = expiracaoDaSessao('aluno', criada)
    expect(precisaRenovar('aluno', expira, criada)).toBe(false)
    expect(
      precisaRenovar('aluno', expira, new Date(criada.getTime() + DIA - 1)),
    ).toBe(false)
    expect(
      precisaRenovar('aluno', expira, new Date(criada.getTime() + DIA)),
    ).toBe(true)
  })

  it('o prazo é o do perfil: 7 dias de equipe não valem para o aluno', () => {
    // Faltam 7 dias para vencer: para a equipe é sessão nova; para o aluno já passou 23 dias.
    const expira = new Date(criada.getTime() + 7 * DIA)
    expect(precisaRenovar('equipe', expira, criada)).toBe(false)
    expect(precisaRenovar('aluno', expira, criada)).toBe(true)
  })
})

describe('renovação da sessão com o uso', () => {
  // O Better Auth propõe agora + 30 dias (o teto global dele) em toda renovação.
  const propostaDoBetterAuth = new Date('2026-02-09T12:00:00Z')

  it('o aluno volta a ter 30 dias a partir de agora', () => {
    expect(
      expiracaoNaRenovacao('aluno', agora, propostaDoBetterAuth).toISOString(),
    ).toBe('2026-02-09T12:00:00.000Z')
  })

  it('a equipe e o proprietário continuam com 7 dias: nunca voltam a 30', () => {
    for (const perfil of ['equipe', 'proprietario'] as const) {
      expect(
        expiracaoNaRenovacao(perfil, agora, propostaDoBetterAuth).toISOString(),
      ).toBe('2026-01-17T12:00:00.000Z')
    }
  })

  it('sem saber o perfil (contexto vazio), nunca passa de 7 dias', () => {
    expect(
      expiracaoNaRenovacao(
        undefined,
        agora,
        propostaDoBetterAuth,
      ).toISOString(),
    ).toBe('2026-01-17T12:00:00.000Z')
    // E uma proposta que já era menor continua valendo.
    expect(
      expiracaoNaRenovacao(
        undefined,
        agora,
        new Date('2026-01-11T12:00:00Z'),
      ).toISOString(),
    ).toBe('2026-01-11T12:00:00.000Z')
  })
})

describe('limpeza do que expirou', () => {
  it('apaga sessões e códigos vencidos e deixa os vigentes', async () => {
    const db = await criarBancoDeTeste()
    await db.insert(user).values({ id: 'u', name: 'U', email: 'u@x.test' })
    const antes = new Date('2026-01-01T00:00:00Z')
    const depois = new Date('2026-12-01T00:00:00Z')
    await db.insert(session).values([
      { id: 's1', token: 't1', userId: 'u', expiresAt: antes },
      { id: 's2', token: 't2', userId: 'u', expiresAt: depois },
    ])
    await db.insert(verification).values([
      { id: 'v1', identifier: 'a', value: 'x', expiresAt: antes },
      { id: 'v2', identifier: 'b', value: 'y', expiresAt: antes },
      { id: 'v3', identifier: 'c', value: 'z', expiresAt: depois },
    ])
    expect(await limparExpirados(db, () => agora)).toEqual({
      sessoes: 1,
      verificacoes: 2,
    })
    expect((await db.select().from(session)).map((s) => s.id)).toEqual(['s2'])
    expect((await db.select().from(verification)).map((v) => v.id)).toEqual([
      'v3',
    ])
  })
})
