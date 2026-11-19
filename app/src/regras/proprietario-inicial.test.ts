import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { user } from '#/db/schema'
import { emailCadastrado } from '#/regras/login'
import { garantirProprietarioInicial } from '#/regras/proprietario-inicial'
import { criarBancoDeTeste } from '#/test/banco'

const EMAIL = 'dono@x.test'

describe('garantirProprietarioInicial', () => {
  it('banco vazio + e-mail certo cria o proprietário e o e-mail passa a ser cadastrado', async () => {
    const db = await criarBancoDeTeste()
    expect(await garantirProprietarioInicial(db, EMAIL, EMAIL)).toBe(true)
    const [criado] = await db.select().from(user)
    expect(criado).toMatchObject({
      email: EMAIL,
      name: 'dono',
      perfil: 'proprietario',
      emailVerified: false,
    })
    expect(await emailCadastrado(db, EMAIL)).toBe(true)
  })

  it('e-mail diferente do configurado não faz nada', async () => {
    const db = await criarBancoDeTeste()
    expect(await garantirProprietarioInicial(db, 'outro@x.test', EMAIL)).toBe(
      false,
    )
    expect(await db.select().from(user)).toHaveLength(0)
    expect(await emailCadastrado(db, 'outro@x.test')).toBe(false)
  })

  it('já existindo proprietário, o e-mail configurado novo não é criado', async () => {
    const db = await criarBancoDeTeste()
    await db
      .insert(user)
      .values({ id: 'p', name: 'p', email: 'p@x.test', perfil: 'proprietario' })
    expect(await garantirProprietarioInicial(db, EMAIL, EMAIL)).toBe(false)
    expect(await db.select().from(user)).toHaveLength(1)
  })

  it('variável vazia ou ausente desliga a regra', async () => {
    const db = await criarBancoDeTeste()
    expect(await garantirProprietarioInicial(db, EMAIL, '')).toBe(false)
    expect(await garantirProprietarioInicial(db, '', '  ')).toBe(false)
    expect(await garantirProprietarioInicial(db, EMAIL, undefined)).toBe(false)
    expect(await db.select().from(user)).toHaveLength(0)
  })

  it('maiúsculas e espaços batem', async () => {
    const db = await criarBancoDeTeste()
    expect(
      await garantirProprietarioInicial(db, ' Dono@X.test ', 'DONO@x.TEST'),
    ).toBe(true)
    const [criado] = await db.select().from(user)
    expect(criado.email).toBe(EMAIL)
  })

  it('aluno existente com o e-mail e sem proprietário é promovido', async () => {
    const db = await criarBancoDeTeste()
    await db
      .insert(user)
      .values({ id: 'a', name: 'Ana', email: EMAIL, perfil: 'aluno' })
    expect(await garantirProprietarioInicial(db, EMAIL, EMAIL)).toBe(true)
    const [ana] = await db.select().from(user).where(eq(user.id, 'a'))
    expect(ana.perfil).toBe('proprietario')
    expect(await db.select().from(user)).toHaveLength(1)
  })
})
