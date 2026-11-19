import { beforeEach, describe, expect, it } from 'vitest'

import * as schema from '#/db/schema'
import {
  chaveDeLimiteDeVerificacao,
  chaveDeLimitePorEmail,
  emailCadastrado,
} from '#/regras/login'
import type { Banco } from '#/regras/tipos'
import { criarBancoDeTeste } from '#/test/banco'

let db: Banco
beforeEach(async () => {
  db = await criarBancoDeTeste()
  await db
    .insert(schema.user)
    .values({ id: 'u1', name: 'Ana', email: 'ana@exemplo.test' })
})

describe('login por código: quem pode receber código', () => {
  it('e-mail cadastrado pode, sem importar caixa nem espaços', async () => {
    expect(await emailCadastrado(db, 'ana@exemplo.test')).toBe(true)
    expect(await emailCadastrado(db, '  Ana@Exemplo.TEST ')).toBe(true)
  })

  it('e-mail desconhecido não pode', async () => {
    expect(await emailCadastrado(db, 'ninguem@exemplo.test')).toBe(false)
  })

  it('a chave do limite por e-mail ignora caixa e espaços', () => {
    expect(chaveDeLimitePorEmail(' Ana@Exemplo.TEST ')).toBe(
      'codigo-email:ana@exemplo.test',
    )
  })

  it('a verificação tem escopo próprio, separado do envio', () => {
    expect(chaveDeLimiteDeVerificacao(' Ana@Exemplo.TEST ')).toBe(
      'verificar:ana@exemplo.test',
    )
    expect(chaveDeLimiteDeVerificacao('a@b.test')).not.toBe(
      chaveDeLimitePorEmail('a@b.test'),
    )
  })
})
