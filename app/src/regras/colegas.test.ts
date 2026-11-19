import { describe, expect, it } from 'vitest'
import { user } from '#/db/schema'
import {
  colegasDaSemana,
  MINIMO_DE_COLEGAS,
  textoDosColegas,
} from '#/regras/colegas'
import { criarAula, criarCurso, criarModulo } from '#/regras/conteudo'
import { registrarAbertura } from '#/regras/progresso'
import { criarBancoDeTeste } from '#/test/banco'

const AGORA = new Date('2026-06-15T12:00:00Z')
const diasAntes = (d: number) => new Date(AGORA.getTime() - d * 86_400_000)

async function cenario() {
  const db = await criarBancoDeTeste()
  await db.insert(user).values({ id: 'eu', name: 'Eu', email: 'eu@x.test' })
  const cursoId = await criarCurso(db, { nome: 'Coloração' })
  const m = await criarModulo(db, cursoId, { nome: 'Base' })
  const aulaId = await criarAula(db, m, { titulo: 'Aula', video: '123456' })
  const outraId = await criarAula(db, m, { titulo: 'Outra', video: '234567' })
  async function abriu(
    id: string,
    quando: Date,
    aula = aulaId,
    perfil: 'aluno' | 'equipe' | 'proprietario' = 'aluno',
  ) {
    await db
      .insert(user)
      .values({ id, name: id, email: `${id}@x.test`, perfil })
      .onConflictDoNothing()
    await registrarAbertura(db, () => quando, id, aula)
  }
  return { db, aulaId, outraId, abriu }
}

describe('colegas que abriram a aula na semana', () => {
  it('conta alunos distintos que abriram nos últimos 7 dias', async () => {
    const { db, aulaId, abriu } = await cenario()
    for (const id of ['a', 'b', 'c', 'd']) await abriu(id, diasAntes(2))
    expect(await colegasDaSemana(db, () => AGORA, aulaId, 'eu')).toBe(4)
  })

  it('não mostra nada abaixo do mínimo', async () => {
    const { db, aulaId, abriu } = await cenario()
    expect(MINIMO_DE_COLEGAS).toBe(3)
    await abriu('a', diasAntes(1))
    await abriu('b', diasAntes(1))
    expect(await colegasDaSemana(db, () => AGORA, aulaId, 'eu')).toBeNull()
    await abriu('c', diasAntes(1))
    expect(await colegasDaSemana(db, () => AGORA, aulaId, 'eu')).toBe(3)
  })

  it('ignora aberturas com mais de 7 dias', async () => {
    const { db, aulaId, abriu } = await cenario()
    for (const id of ['a', 'b', 'c']) await abriu(id, diasAntes(1))
    await abriu('velho', diasAntes(8))
    expect(await colegasDaSemana(db, () => AGORA, aulaId, 'eu')).toBe(3)
  })

  it('ignora a equipe e o proprietário', async () => {
    const { db, aulaId, abriu } = await cenario()
    for (const id of ['a', 'b', 'c']) await abriu(id, diasAntes(1))
    await abriu('e', diasAntes(1), aulaId, 'equipe')
    await abriu('p', diasAntes(1), aulaId, 'proprietario')
    expect(await colegasDaSemana(db, () => AGORA, aulaId, 'eu')).toBe(3)
  })

  it('não conta quem está olhando', async () => {
    const { db, aulaId, abriu } = await cenario()
    for (const id of ['a', 'b', 'c']) await abriu(id, diasAntes(1))
    await abriu('eu', diasAntes(0))
    expect(await colegasDaSemana(db, () => AGORA, aulaId, 'eu')).toBe(3)
  })

  it('só conta a aula pedida', async () => {
    const { db, aulaId, outraId, abriu } = await cenario()
    for (const id of ['a', 'b']) await abriu(id, diasAntes(1))
    await abriu('c', diasAntes(1), outraId)
    expect(await colegasDaSemana(db, () => AGORA, aulaId, 'eu')).toBeNull()
  })
})

describe('texto dos colegas', () => {
  it('diz o número no plural', () => {
    expect(textoDosColegas(12)).toBe('12 colegas assistiram esta semana')
  })
})
