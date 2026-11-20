import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { matricula, registroDeAcoes, user } from '#/db/schema'
import { criarCurso } from '#/regras/conteudo'
import {
  adicionarNaEquipe,
  ErroDeEquipe,
  listarEquipe,
  perfilDoUsuario,
  removerDaEquipe,
  trocarPerfilDaEquipe,
} from '#/regras/equipe'
import { criarTurma } from '#/regras/matricula'
import { criarBancoDeTeste } from '#/test/banco'

const agora = () => new Date('2026-06-01T12:00:00Z')

async function cenario() {
  const db = await criarBancoDeTeste()
  await db.insert(user).values([
    {
      id: 'dono',
      name: 'Helena',
      email: 'helena@x.test',
      perfil: 'proprietario',
    },
    { id: 'eq', name: 'Marina', email: 'marina@x.test', perfil: 'equipe' },
    { id: 'ana', name: 'Ana', email: 'ana@x.test', perfil: 'aluno' },
  ])
  const perfilDe = async (id: string) =>
    (await db.select().from(user).where(eq(user.id, id)))[0]?.perfil
  const registros = async () => db.select().from(registroDeAcoes)
  return { db, perfilDe, registros }
}

describe('adicionarNaEquipe', () => {
  it('dá o perfil a uma aluna que já existe e registra', async () => {
    const { db, perfilDe, registros } = await cenario()
    const r = await adicionarNaEquipe(db, agora, {
      autorId: 'dono',
      email: ' ANA@x.test ',
      perfil: 'equipe',
    })
    expect(r).toEqual({ userId: 'ana', criouConta: false })
    expect(await perfilDe('ana')).toBe('equipe')
    const [linha] = await registros()
    expect(linha.acao).toBe('equipe-adicionada')
    expect(linha.autorId).toBe('dono')
  })

  it('cria a conta quando o e-mail é novo, como Proprietário se for o caso', async () => {
    const { db, perfilDe } = await cenario()
    const r = await adicionarNaEquipe(db, agora, {
      autorId: 'dono',
      email: 'nova@x.test',
      perfil: 'proprietario',
    })
    expect(r.criouConta).toBe(true)
    expect(await perfilDe(r.userId)).toBe('proprietario')
  })

  it('recusa e-mail inválido, perfil aluno e quem já está na equipe', async () => {
    const { db } = await cenario()
    const tentar = (email: string, perfil = 'equipe') =>
      adicionarNaEquipe(db, agora, { autorId: 'dono', email, perfil })
    await expect(tentar('sem-arroba')).rejects.toThrow(ErroDeEquipe)
    await expect(tentar('ana@x.test', 'aluno')).rejects.toThrow(ErroDeEquipe)
    await expect(tentar('marina@x.test')).rejects.toThrow('já está na equipe')
  })
})

describe('trocarPerfilDaEquipe', () => {
  it('promove a Equipe a Proprietário e registra', async () => {
    const { db, perfilDe, registros } = await cenario()
    await trocarPerfilDaEquipe(db, agora, {
      autorId: 'dono',
      userId: 'eq',
      perfil: 'proprietario',
    })
    expect(await perfilDe('eq')).toBe('proprietario')
    expect((await registros())[0].acao).toBe('equipe-perfil-trocado')
  })

  it('nunca deixa a área sem Proprietário', async () => {
    const { db, perfilDe, registros } = await cenario()
    await expect(
      trocarPerfilDaEquipe(db, agora, {
        autorId: 'dono',
        userId: 'dono',
        perfil: 'equipe',
      }),
    ).rejects.toThrow('sem Proprietário')
    expect(await perfilDe('dono')).toBe('proprietario')
    expect(await registros()).toHaveLength(0)
  })

  it('o Proprietário pode virar Equipe quando há outro', async () => {
    const { db, perfilDe } = await cenario()
    await trocarPerfilDaEquipe(db, agora, {
      autorId: 'dono',
      userId: 'eq',
      perfil: 'proprietario',
    })
    await trocarPerfilDaEquipe(db, agora, {
      autorId: 'eq',
      userId: 'dono',
      perfil: 'equipe',
    })
    expect(await perfilDe('dono')).toBe('equipe')
  })

  it('mesmo perfil não muda nem registra; aluno não entra por aqui', async () => {
    const { db, registros } = await cenario()
    await trocarPerfilDaEquipe(db, agora, {
      autorId: 'dono',
      userId: 'eq',
      perfil: 'equipe',
    })
    expect(await registros()).toHaveLength(0)
    await expect(
      trocarPerfilDaEquipe(db, agora, {
        autorId: 'dono',
        userId: 'ana',
        perfil: 'equipe',
      }),
    ).rejects.toThrow('não está na equipe')
  })
})

describe('removerDaEquipe', () => {
  it('a pessoa volta a ser aluna e mantém as matrículas', async () => {
    const { db, perfilDe, registros } = await cenario()
    const cursoId = await criarCurso(db, { nome: 'Coloração' })
    const turmaId = await criarTurma(db, { cursoId, nome: 'T1' })
    await db.insert(matricula).values({
      id: 'm1',
      userId: 'eq',
      turmaId,
      iniciaEm: agora(),
    })
    await removerDaEquipe(db, agora, { autorId: 'dono', userId: 'eq' })
    expect(await perfilDe('eq')).toBe('aluno')
    expect(await db.select().from(matricula)).toHaveLength(1)
    expect((await registros())[0].acao).toBe('equipe-removida')
  })

  it('o último Proprietário não sai, nem sozinho nem por outra pessoa', async () => {
    const { db, perfilDe } = await cenario()
    await expect(
      removerDaEquipe(db, agora, { autorId: 'dono', userId: 'dono' }),
    ).rejects.toThrow('sem Proprietário')
    await expect(
      removerDaEquipe(db, agora, { autorId: 'eq', userId: 'dono' }),
    ).rejects.toThrow(ErroDeEquipe)
    expect(await perfilDe('dono')).toBe('proprietario')
  })

  it('com dois Proprietários, um pode sair', async () => {
    const { db, perfilDe } = await cenario()
    await trocarPerfilDaEquipe(db, agora, {
      autorId: 'dono',
      userId: 'eq',
      perfil: 'proprietario',
    })
    await removerDaEquipe(db, agora, { autorId: 'eq', userId: 'eq' })
    expect(await perfilDe('eq')).toBe('aluno')
    expect(await perfilDe('dono')).toBe('proprietario')
  })

  it('quem é aluna não pode ser removida', async () => {
    const { db } = await cenario()
    await expect(
      removerDaEquipe(db, agora, { autorId: 'dono', userId: 'ana' }),
    ).rejects.toThrow('não está na equipe')
  })
})

describe('listarEquipe', () => {
  it('lista só Proprietário e Equipe', async () => {
    const { db } = await cenario()
    const lista = await listarEquipe(db)
    expect(lista.map((p) => p.id).sort()).toEqual(['dono', 'eq'])
  })
})

describe('perfilDoUsuario', () => {
  it('devolve o perfil da pessoa; sem a pessoa, aluno', async () => {
    const { db } = await cenario()
    expect(await perfilDoUsuario(db, 'dono')).toBe('proprietario')
    expect(await perfilDoUsuario(db, 'eq')).toBe('equipe')
    expect(await perfilDoUsuario(db, 'ana')).toBe('aluno')
    expect(await perfilDoUsuario(db, 'ninguem')).toBe('aluno')
  })
})
