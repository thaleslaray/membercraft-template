import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { favorito, user } from '#/db/schema'
import { criarAula, criarCurso, criarModulo } from '#/regras/conteudo'
import {
  desfavoritar,
  ErroDeFavorito,
  favoritar,
  favoritasEntre,
  listarFavoritos,
} from '#/regras/favoritos'
import { criarTurma, matricularManual } from '#/regras/matricula'
import { criarBancoDeTeste } from '#/test/banco'

const agora = () => new Date('2026-06-01T12:00:00Z')

async function cenario() {
  const db = await criarBancoDeTeste()
  await db.insert(user).values({ id: 'eq', name: 'Equipe', email: 'eq@x.test' })
  const cursoId = await criarCurso(db, { nome: 'Coloração' })
  const moduloId = await criarModulo(db, cursoId, { nome: 'Base' })
  const aula1 = await criarAula(db, moduloId, { titulo: 'Raiz' })
  const aula2 = await criarAula(db, moduloId, { titulo: 'Mechas' })
  const outro = await criarCurso(db, { nome: 'Corte' })
  const moduloOutro = await criarModulo(db, outro, { nome: 'Tesoura' })
  const aulaDeFora = await criarAula(db, moduloOutro, { titulo: 'Franja' })
  const turmaId = await criarTurma(db, { cursoId, nome: 'T1' })
  await matricularManual(db, agora, {
    pessoas: [{ email: 'ana@x.test' }],
    turmaId,
    autorId: 'eq',
  })
  const [ana] = await db.select().from(user).where(eq(user.email, 'ana@x.test'))
  return {
    db,
    ana: { id: ana.id, perfil: 'aluno' as const },
    aula1,
    aula2,
    aulaDeFora,
    cursoId,
  }
}

describe('favoritos', () => {
  it('favoritar duas vezes grava um registro só', async () => {
    const { db, ana, aula1 } = await cenario()
    await favoritar(db, agora, ana, aula1)
    await favoritar(db, agora, ana, aula1)
    expect(await db.select().from(favorito)).toHaveLength(1)
    expect(await favoritasEntre(db, ana.id, [aula1])).toEqual([aula1])
  })

  it('desfavoritar tira o favorito e é seguro repetir', async () => {
    const { db, ana, aula1 } = await cenario()
    await favoritar(db, agora, ana, aula1)
    await desfavoritar(db, ana.id, aula1)
    await desfavoritar(db, ana.id, aula1)
    expect(await favoritasEntre(db, ana.id, [aula1])).toEqual([])
  })

  it('não favorita aula de curso sem matrícula nem aula que não existe', async () => {
    const { db, ana, aulaDeFora } = await cenario()
    await expect(favoritar(db, agora, ana, aulaDeFora)).rejects.toBeInstanceOf(
      ErroDeFavorito,
    )
    await expect(
      favoritar(db, agora, ana, 'nao-existe'),
    ).rejects.toBeInstanceOf(ErroDeFavorito)
    expect(await db.select().from(favorito)).toHaveLength(0)
  })

  it('a Equipe favorita aula de qualquer curso', async () => {
    const { db, aulaDeFora } = await cenario()
    await favoritar(db, agora, { id: 'eq', perfil: 'equipe' }, aulaDeFora)
    expect(await favoritasEntre(db, 'eq', [aulaDeFora])).toEqual([aulaDeFora])
  })

  it('a lista traz as mais recentes primeiro, só do aluno e só de cursos acessíveis', async () => {
    const { db, ana, aula1, aula2, aulaDeFora, cursoId } = await cenario()
    await favoritar(db, () => new Date('2026-06-01T10:00:00Z'), ana, aula1)
    await favoritar(db, () => new Date('2026-06-01T11:00:00Z'), ana, aula2)
    await favoritar(db, agora, { id: 'eq', perfil: 'equipe' }, aula1)
    const lista = await listarFavoritos(db, ana.id, [cursoId])
    expect(lista.map((f) => f.aulaId)).toEqual([aula2, aula1])
    expect(lista[0]).toMatchObject({ titulo: 'Mechas', cursoNome: 'Coloração' })
    // Perdeu o acesso: o favorito fica guardado, mas some da lista.
    expect(await listarFavoritos(db, ana.id, [])).toEqual([])
    expect(
      (await listarFavoritos(db, 'eq', 'todos')).map((f) => f.aulaId),
    ).toEqual([aula1])
    expect(aulaDeFora).toBeTruthy()
  })
})
