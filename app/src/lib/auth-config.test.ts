import { describe, expect, it } from 'vitest'
import { getAuth } from '#/lib/auth'

// Configuração do cache da sessão em cookie e do JOIN sessão+usuário.
describe('getAuth: cache da sessão', () => {
  const auth = getAuth({
    DB: {} as D1Database,
    BETTER_AUTH_SECRET: 'segredo-de-teste-com-mais-de-trinta-e-dois-caracteres',
    BETTER_AUTH_URL: 'http://localhost:3040',
  } as unknown as Env)

  it('guarda a sessão num cookie assinado por 60 s', () => {
    expect(auth.options.session?.cookieCache).toEqual({
      enabled: true,
      maxAge: 60,
      strategy: 'compact',
    })
  })

  it('lê sessão e usuário num JOIN só', () => {
    expect(auth.options.advanced?.database?.joins).toBe(true)
  })

  it('os campos extras do usuário continuam declarados (vão no cookie)', () => {
    const campos = Object.keys(auth.options.user?.additionalFields ?? {})
    expect(campos).toEqual(
      expect.arrayContaining(['perfil', 'termosVersao', 'termosAceitoEm']),
    )
  })
})
