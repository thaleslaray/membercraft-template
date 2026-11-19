import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { user } from '#/db/schema'
import { cursosAcessiveis, podeAcessarCurso } from '#/regras/acesso-ao-curso'
import { criarCurso } from '#/regras/conteudo'
import {
  criarTurma,
  encerrar,
  matricularManual,
  perfilDoAluno,
} from '#/regras/matricula'
import { criarBancoDeTeste } from '#/test/banco'

const agora = () => new Date('2026-06-01T12:00:00Z')
const aluno = (id: string) => ({ id, perfil: 'aluno' as const })

async function cenario() {
  const db = await criarBancoDeTeste()
  await db.insert(user).values({ id: 'eq', name: 'Equipe', email: 'eq@x.test' })
  const cursoId = await criarCurso(db, { nome: 'Coloração' })
  const outroCurso = await criarCurso(db, { nome: 'Corte' })
  const turmaId = await criarTurma(db, { cursoId, nome: 'T1' })
  return { db, cursoId, outroCurso, turmaId }
}

describe('acesso ao curso', () => {
  it('a Equipe e o Proprietário acessam tudo', async () => {
    const db = await criarBancoDeTeste()
    for (const perfil of ['equipe', 'proprietario'] as const) {
      expect(await cursosAcessiveis(db, agora, { id: 'p', perfil })).toBe(
        'todos',
      )
      expect(
        await podeAcessarCurso(db, agora, { id: 'p', perfil }, 'qualquer'),
      ).toBe(true)
    }
  })

  it('o aluno sem matrícula não acessa curso nenhum', async () => {
    const db = await criarBancoDeTeste()
    expect(await cursosAcessiveis(db, agora, aluno('a'))).toEqual([])
    expect(await podeAcessarCurso(db, agora, aluno('a'), 'c1')).toBe(false)
  })

  it('o aluno acessa só os cursos das turmas em que tem matrícula ativa', async () => {
    const { db, cursoId, outroCurso, turmaId } = await cenario()
    await matricularManual(db, agora, {
      pessoas: [{ email: 'ana@x.test' }],
      turmaId,
      autorId: 'eq',
    })
    const [{ id }] = await db
      .select()
      .from(user)
      .where(eq(user.email, 'ana@x.test'))
    expect(await cursosAcessiveis(db, agora, aluno(id))).toEqual([cursoId])
    expect(await podeAcessarCurso(db, agora, aluno(id), cursoId)).toBe(true)
    expect(await podeAcessarCurso(db, agora, aluno(id), outroCurso)).toBe(false)
  })

  it('matrícula expirada ou encerrada não abre o curso', async () => {
    const { db, cursoId, turmaId } = await cenario()
    await matricularManual(db, agora, {
      pessoas: [{ email: 'ana@x.test' }, { email: 'bia@x.test' }],
      turmaId,
      expiracao: new Date('2026-06-10T00:00:00Z'),
      autorId: 'eq',
    })
    const contas = await db.select().from(user)
    const ana = contas.find((c) => c.email === 'ana@x.test')
    const bia = contas.find((c) => c.email === 'bia@x.test')
    if (!ana || !bia) throw new Error('contas não criadas')
    const depois = () => new Date('2026-06-11T00:00:00Z')
    expect(await podeAcessarCurso(db, depois, aluno(ana.id), cursoId)).toBe(
      false,
    )
    const perfil = await perfilDoAluno(db, agora, bia.id)
    await encerrar(db, { matriculaId: perfil?.matriculas[0].id ?? '' })
    expect(await podeAcessarCurso(db, agora, aluno(bia.id), cursoId)).toBe(
      false,
    )
  })
})
