import { matricula, turma, user } from '#/db/schema'
import { criarCurso } from '#/regras/conteudo'
import { criarBancoDeTeste } from '#/test/banco'

const agora = () => new Date('2026-06-01T12:00:00Z')

// Banco de teste das comunidades: Ana (turma 1), Bia (turma 2), Cris (matrícula vencida na turma 1)
// e uma pessoa da Equipe.
export async function cenarioDeComunidades() {
  const db = await criarBancoDeTeste()
  await db.insert(user).values([
    { id: 'ana', name: 'Ana', email: 'ana@x.test' },
    { id: 'bia', name: 'Bia', email: 'bia@x.test' },
    { id: 'cris', name: 'Cris', email: 'cris@x.test' },
    { id: 'eq', name: 'Equipe', email: 'eq@x.test', perfil: 'equipe' },
  ])
  const cursoId = await criarCurso(db, { nome: 'Coloração' })
  await db.insert(turma).values([
    { id: 't1', cursoId, nome: 'Turma 1' },
    { id: 't2', cursoId, nome: 'Turma 2' },
  ])
  const hoje = agora()
  await db.insert(matricula).values([
    { id: 'm1', userId: 'ana', turmaId: 't1', iniciaEm: hoje },
    { id: 'm2', userId: 'bia', turmaId: 't2', iniciaEm: hoje },
    // Cris tem matrícula vencida.
    {
      id: 'm3',
      userId: 'cris',
      turmaId: 't1',
      iniciaEm: hoje,
      expiraEm: new Date('2026-05-01T00:00:00Z'),
    },
  ])
  return db
}
