import { describe, expect, it } from 'vitest'
import { registroDeAcoes, user } from '#/db/schema'
import {
  DURACAO_DE_ENTRAR_COMO_MS,
  ErroDeEntrarComo,
  expiracaoDeEntrarComo,
  registrarEntradaComo,
  registrarSaidaDeEntrarComo,
  trocaDeEmailBloqueada,
  validarEntradaComo,
} from '#/regras/entrar-como'
import { PermissaoNegada } from '#/regras/permissoes'
import { criarBancoDeTeste } from '#/test/banco'

const T0 = new Date('2026-06-01T12:00:00Z')

async function cenario() {
  const db = await criarBancoDeTeste()
  await db.insert(user).values([
    { id: 'dono', name: 'Helena', email: 'helena@x.test', perfil: 'proprietario' },
    { id: 'eq', name: 'Marina', email: 'marina@x.test', perfil: 'equipe' },
    { id: 'eq2', name: 'Bia', email: 'bia@x.test', perfil: 'equipe' },
    { id: 'al', name: 'Fulana', email: 'fulana@x.test', perfil: 'aluno' },
  ])
  return db
}

describe('entrar como uma aluna', () => {
  it('Proprietário e Equipe entram como aluna', async () => {
    const db = await cenario()
    for (const autor of [
      { id: 'dono', perfil: 'proprietario' as const },
      { id: 'eq', perfil: 'equipe' as const },
    ]) {
      const aluna = await validarEntradaComo(db, { autor, alunoId: 'al' })
      expect(aluna).toEqual({
        id: 'al',
        nome: 'Fulana',
        email: 'fulana@x.test',
      })
    }
  })

  it('aluno não entra como ninguém', async () => {
    const db = await cenario()
    await expect(
      validarEntradaComo(db, {
        autor: { id: 'al', perfil: 'aluno' },
        alunoId: 'al',
      }),
    ).rejects.toBeInstanceOf(PermissaoNegada)
  })

  it('não entra como outra pessoa da Equipe nem como o Proprietário', async () => {
    const db = await cenario()
    for (const alunoId of ['eq2', 'dono']) {
      await expect(
        validarEntradaComo(db, {
          autor: { id: 'eq', perfil: 'equipe' },
          alunoId,
        }),
      ).rejects.toBeInstanceOf(ErroDeEntrarComo)
    }
    await expect(
      validarEntradaComo(db, {
        autor: { id: 'dono', perfil: 'proprietario' },
        alunoId: 'eq',
      }),
    ).rejects.toBeInstanceOf(ErroDeEntrarComo)
  })

  it('pessoa que não existe é recusada', async () => {
    const db = await cenario()
    await expect(
      validarEntradaComo(db, {
        autor: { id: 'eq', perfil: 'equipe' },
        alunoId: 'nada',
      }),
    ).rejects.toBeInstanceOf(ErroDeEntrarComo)
  })

  it('a sessão expira em 4 horas', () => {
    expect(DURACAO_DE_ENTRAR_COMO_MS).toBe(14_400_000)
    expect(expiracaoDeEntrarComo(T0).toISOString()).toBe(
      '2026-06-01T16:00:00.000Z',
    )
  })

  it('entrada e saída ficam no registro de ações', async () => {
    const db = await cenario()
    const aluna = { id: 'al', nome: 'Fulana', email: 'fulana@x.test' }
    await registrarEntradaComo(db, () => T0, {
      autorId: 'eq',
      aluna,
      expiraEm: expiracaoDeEntrarComo(T0),
    })
    await registrarSaidaDeEntrarComo(db, () => T0, {
      autorId: 'eq',
      alunoId: 'al',
    })
    const linhas = await db.select().from(registroDeAcoes)
    expect(linhas.map((l) => l.acao).sort()).toEqual([
      'entrou-como',
      'saiu-de-entrar-como',
    ])
    expect(linhas.every((l) => l.autorId === 'eq')).toBe(true)
    const entrada = linhas.find((l) => l.acao === 'entrou-como')
    expect(JSON.parse(entrada?.detalhe ?? '{}')).toMatchObject({
      alunoId: 'al',
    })
  })

  it('enquanto impersonado, a troca de e-mail é bloqueada', () => {
    expect(trocaDeEmailBloqueada('eq')).toBe(true)
    expect(trocaDeEmailBloqueada(null)).toBe(false)
    expect(trocaDeEmailBloqueada(undefined)).toBe(false)
  })
})
