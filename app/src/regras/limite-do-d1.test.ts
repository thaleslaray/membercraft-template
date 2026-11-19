import { sql } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { lancamentoDePontos, user } from '#/db/schema'
import { criarAula, criarCurso, criarModulo } from '#/regras/conteudo'
import { favoritasEntre } from '#/regras/favoritos'
import { emLotes, emPedacos, entreOsIds } from '#/regras/lotes'
import { criarTurma, matricularManual } from '#/regras/matricula'
import { pontosDosAlunos } from '#/regras/pontos'
import { concluirAula, progressoDoCurso } from '#/regras/progresso'
import { criarBancoDeTeste, LIMITE_DE_PARAMETROS_DO_D1 } from '#/test/banco'

// Contrato com o D1: nenhum comando passa de 100 parâmetros, qualquer que seja o tamanho dos dados.
// O banco de teste recusa como o D1 recusa (ver `src/test/banco.ts`).

const T0 = new Date('2026-06-01T12:00:00Z')
const agora = () => T0

async function cursoGrande(totalDeAulas: number) {
  const db = await criarBancoDeTeste()
  await db.insert(user).values({ id: 'ana', name: 'Ana', email: 'ana@x.test' })
  const cursoId = await criarCurso(db, { nome: 'Formação' })
  const aulas: string[] = []
  // Três módulos: o curso real (193 aulas) também tem vários módulos.
  for (const nome of ['A', 'B', 'C']) {
    const moduloId = await criarModulo(db, cursoId, { nome })
    for (let i = 0; i < totalDeAulas / 3; i++) {
      aulas.push(await criarAula(db, moduloId, { titulo: `Aula ${nome}${i}` }))
    }
  }
  return { db, cursoId, aulas }
}

describe('o banco de teste e o limite do D1', () => {
  it('recusa comando com mais de 100 parâmetros', async () => {
    const db = await criarBancoDeTeste()
    const ids = Array.from({ length: 101 }, (_, i) => `u${i}`)
    await expect(
      db
        .select()
        .from(user)
        .where(sql`${user.id} in (${sql.join(ids, sql`, `)})`),
    ).rejects.toThrow()
  })

  it('aceita exatamente 100 parâmetros', async () => {
    const db = await criarBancoDeTeste()
    const ids = Array.from(
      { length: LIMITE_DE_PARAMETROS_DO_D1 },
      (_, i) => `u${i}`,
    )
    await expect(
      db
        .select()
        .from(user)
        .where(sql`${user.id} in (${sql.join(ids, sql`, `)})`),
    ).resolves.toEqual([])
  })

  it('recusa também dentro de db.batch', async () => {
    const db = await criarBancoDeTeste()
    const ids = Array.from({ length: 101 }, (_, i) => `u${i}`)
    await expect(
      db.batch([
        db
          .select()
          .from(user)
          .where(sql`${user.id} in (${sql.join(ids, sql`, `)})`),
      ]),
    ).rejects.toThrow()
  })
})

describe('lotes', () => {
  it('parte a lista em pedaços e tira os repetidos', async () => {
    const lista = Array.from({ length: 200 }, (_, i) => i % 150)
    const tamanhos: number[] = []
    const saida = await emLotes(
      lista,
      async (lote) => {
        tamanhos.push(lote.length)
        return lote
      },
      60,
    )
    expect(tamanhos).toEqual([60, 60, 30])
    expect(saida).toHaveLength(150)
    expect(emPedacos([1, 2, 3], 2)).toEqual([[1, 2], [3]])
    expect(await emLotes([], async () => [1])).toEqual([])
  })

  it('entreOsIds usa um parâmetro só, com qualquer tamanho de lista', async () => {
    const db = await criarBancoDeTeste()
    const ids = Array.from({ length: 500 }, (_, i) => `u${i}`)
    await db.insert(user).values({ id: 'u7', name: 'U', email: 'u7@x.test' })
    const achados = await db
      .select({ id: user.id })
      .from(user)
      .where(entreOsIds(user.id, ids))
    expect(achados).toEqual([{ id: 'u7' }])
  })
})

describe('curso com 150 aulas (a página da aula dava 500 com 193)', () => {
  it('progressoDoCurso lê o progresso do aluno', async () => {
    const { db, cursoId, aulas } = await cursoGrande(150)
    for (const id of aulas.slice(0, 120))
      await concluirAula(db, agora, 'ana', id)
    const passo = await progressoDoCurso(db, 'ana', cursoId)
    expect(passo.totalDeAulas).toBe(150)
    expect(passo.aulasConcluidas).toBe(120)
    expect(passo.percentual).toBe(80)
    expect(passo.concluidas).toHaveLength(120)
    expect(passo.proximaAulaId).toBe(aulas[120])
    expect(passo.jaComecou).toBe(true)
  })

  it('favoritasEntre confere 150 aulas de uma vez', async () => {
    const { db, aulas } = await cursoGrande(150)
    expect(await favoritasEntre(db, 'ana', aulas)).toEqual([])
  })
})

describe('muitos alunos de uma vez', () => {
  it('pontosDosAlunos soma os pontos de 250 alunos', async () => {
    const db = await criarBancoDeTeste()
    const ids = Array.from({ length: 250 }, (_, i) => `a${i}`)
    for (let i = 0; i < ids.length; i += 15) {
      await db.insert(user).values(
        ids.slice(i, i + 15).map((id) => ({
          id,
          name: id,
          email: `${id}@x.test`,
        })),
      )
    }
    await db.insert(lancamentoDePontos).values({
      id: 'l1',
      userId: 'a249',
      origemTipo: 'avulso',
      pontos: 7,
    })
    const mapa = await pontosDosAlunos(db, ids)
    expect(mapa.size).toBe(250)
    expect(mapa.get('a249')).toBe(7)
    expect(mapa.get('a0')).toBe(0)
  })

  it('matricularManual matricula 200 e-mails e reconhece os já matriculados', async () => {
    const db = await criarBancoDeTeste()
    await db.insert(user).values({
      id: 'eq',
      name: 'Marina',
      email: 'marina@x.test',
      perfil: 'equipe',
    })
    const cursoId = await criarCurso(db, { nome: 'Coloração' })
    const turmaId = await criarTurma(db, { cursoId, nome: 'Turma 1' })
    const pessoas = Array.from({ length: 200 }, (_, i) => ({
      email: `aluno${i}@x.test`,
    }))
    const primeira = await matricularManual(db, agora, {
      pessoas,
      turmaId,
      autorId: 'eq',
    })
    expect(primeira.criados).toHaveLength(200)
    const segunda = await matricularManual(db, agora, {
      pessoas,
      turmaId,
      autorId: 'eq',
    })
    expect(segunda.jaMatriculados).toHaveLength(200)
  })
})
