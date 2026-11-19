import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'

import * as schema from '#/db/schema'
import {
  concluirPrimeiroAcesso,
  pendenciasDoPrimeiroAcesso,
} from '#/regras/primeiro-acesso'
import type { Banco } from '#/regras/tipos'
import { criarBancoDeTeste } from '#/test/banco'

const agora = () => new Date('2026-03-01T10:00:00Z')
const V1 = '2026-01-01'
const V2 = '2026-06-01'

let db: Banco
beforeEach(async () => {
  db = await criarBancoDeTeste()
  await db.insert(schema.user).values([
    { id: 'u1', name: '', email: 'sem-nome@exemplo.test' },
    { id: 'u2', name: 'Ana', email: 'ana@exemplo.test' },
  ])
})

async function ler(id: string) {
  const [u] = await db.select().from(schema.user).where(eq(schema.user.id, id))
  return u
}

describe('pendências do primeiro acesso', () => {
  it('aluno sem nome e sem aceite precisa dos dois', () => {
    expect(
      pendenciasDoPrimeiroAcesso(
        { perfil: 'aluno', name: ' ', termosVersao: null },
        V1,
      ),
    ).toEqual({ precisaNome: true, precisaTermos: true })
  })

  it('aluno com nome e a versão atual aceita não tem pendência', () => {
    expect(
      pendenciasDoPrimeiroAcesso(
        { perfil: 'aluno', name: 'Ana', termosVersao: V1 },
        V1,
      ),
    ).toEqual({ precisaNome: false, precisaTermos: false })
  })

  it('versão nova dos Termos pede novo aceite', () => {
    expect(
      pendenciasDoPrimeiroAcesso(
        { perfil: 'aluno', name: 'Ana', termosVersao: V1 },
        V2,
      ),
    ).toEqual({ precisaNome: false, precisaTermos: true })
  })

  it('a equipe não passa pelo primeiro acesso', () => {
    expect(
      pendenciasDoPrimeiroAcesso(
        { perfil: 'equipe', name: '', termosVersao: null },
        V1,
      ),
    ).toEqual({ precisaNome: false, precisaTermos: false })
  })
})

describe('concluir o primeiro acesso', () => {
  it('grava o nome informado, a versão aceita e a data', async () => {
    await concluirPrimeiroAcesso(db, agora, 'u1', {
      nome: '  Maria Souza ',
      aceitouTermos: true,
      versaoDosTermos: V1,
    })
    const u = await ler('u1')
    expect(u.name).toBe('Maria Souza')
    expect(u.termosVersao).toBe(V1)
    expect(u.termosAceitoEm?.toISOString()).toBe('2026-03-01T10:00:00.000Z')
  })

  it('exige o aceite dos Termos', async () => {
    await expect(
      concluirPrimeiroAcesso(db, agora, 'u2', {
        aceitouTermos: false,
        versaoDosTermos: V1,
      }),
    ).rejects.toThrow('termos')
    expect((await ler('u2')).termosVersao).toBeNull()
  })

  it('exige o nome quando ele falta', async () => {
    await expect(
      concluirPrimeiroAcesso(db, agora, 'u1', {
        nome: '   ',
        aceitouTermos: true,
        versaoDosTermos: V1,
      }),
    ).rejects.toThrow('nome')
  })

  it('mantém o nome que já existe e ignora outro enviado', async () => {
    await concluirPrimeiroAcesso(db, agora, 'u2', {
      nome: 'Outra',
      aceitouTermos: true,
      versaoDosTermos: V2,
    })
    const u = await ler('u2')
    expect(u.name).toBe('Ana')
    expect(u.termosVersao).toBe(V2)
  })
})
