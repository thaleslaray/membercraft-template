import { describe, expect, it } from 'vitest'
import { matricula, user } from '#/db/schema'
import { criarCurso } from '#/regras/conteudo'
import {
  alunosDoCurso,
  cursoDaTurma,
  liberacaoDoCurso,
  quemCompraDoCurso,
  totalDeAlunos,
} from '#/regras/curso-do-painel'
import {
  abaDoCurso,
  ligarNaTurma,
  textoDeAcesso,
} from '#/regras/grupo-de-ligacoes'
import { criarTurma } from '#/regras/matricula'
import { criarBancoDeTeste } from '#/test/banco'

const agora = () => new Date('2026-11-14T12:00:00Z')

async function cenario() {
  const db = await criarBancoDeTeste()
  const formacao = await criarCurso(db, { nome: 'Formação' })
  const acessorios = await criarCurso(db, { nome: 'Acessórios' })
  const t1 = await criarTurma(db, {
    cursoId: formacao,
    nome: 'Turma principal',
  })
  const t2 = await criarTurma(db, {
    cursoId: formacao,
    nome: 'Black Friday',
    prazoEmDias: 90,
  })
  const t3 = await criarTurma(db, {
    cursoId: acessorios,
    nome: 'Turma principal',
  })
  await db.insert(user).values([
    { id: 'ana', name: 'Ana', email: 'ana@x.test' },
    { id: 'bia', name: 'Bia', email: 'bia@x.test' },
  ])
  await db.insert(matricula).values([
    {
      id: 'm1',
      userId: 'ana',
      turmaId: t1,
      iniciaEm: new Date('2026-10-01T00:00:00Z'),
    },
    {
      id: 'm2',
      userId: 'bia',
      turmaId: t2,
      iniciaEm: new Date('2026-11-01T00:00:00Z'),
    },
    {
      id: 'm3',
      userId: 'ana',
      turmaId: t3,
      iniciaEm: new Date('2026-11-02T00:00:00Z'),
    },
  ])
  return { db, formacao, acessorios, t1, t2, t3 }
}

describe('textoDeAcesso e abaDoCurso', () => {
  it('escreve o prazo da edição', () => {
    expect(textoDeAcesso(null)).toBe('para sempre')
    expect(textoDeAcesso(1)).toBe('1 dia')
    expect(textoDeAcesso(90)).toBe('90 dias')
  })
  it('aba desconhecida cai em Conteúdo', () => {
    expect(abaDoCurso('liberacao')).toBe('liberacao')
    expect(abaDoCurso('xis')).toBe('conteudo')
    expect(abaDoCurso(undefined)).toBe('conteudo')
  })
})

describe('abas do curso', () => {
  it('Quem compra: edições do curso com alunos, produtos', async () => {
    const { db, formacao, t1, t3 } = await cenario()
    await ligarNaTurma(db, agora, { turmaId: t1, produtoId: '111' })
    await ligarNaTurma(db, agora, { turmaId: t3, produtoId: '111' })
    const r = await quemCompraDoCurso(db, formacao)
    expect(r.edicoes.map((e) => [e.nome, e.alunos, e.ligacoes.length])).toEqual(
      [
        ['Turma principal', 1, 1],
        ['Black Friday', 1, 0],
      ],
    )
  })

  it('Liberação: sem edição escolhida usa a primeira; edição de outro curso não vale', async () => {
    const { db, formacao, t1, t2, t3 } = await cenario()
    expect((await liberacaoDoCurso(db, formacao)).regras?.turma.id).toBe(t1)
    expect((await liberacaoDoCurso(db, formacao, t2)).regras?.turma.id).toBe(t2)
    const fora = await liberacaoDoCurso(db, formacao, t3)
    expect(fora.regras).toBeNull()
    expect(fora.alvos).toBeNull()
  })

  it('Alunos: matriculados do curso, mais novos primeiro, e o total', async () => {
    const { db, formacao } = await cenario()
    expect(await totalDeAlunos(db, formacao)).toBe(2)
    const alunos = await alunosDoCurso(db, formacao)
    expect(alunos.map((a) => [a.nome, a.edicao])).toEqual([
      ['Bia', 'Black Friday'],
      ['Ana', 'Turma principal'],
    ])
  })

  it('acha o curso da edição (link antigo da liberação)', async () => {
    const { db, formacao, t2 } = await cenario()
    expect(await cursoDaTurma(db, t2)).toBe(formacao)
    expect(await cursoDaTurma(db, 'nao-existe')).toBeNull()
  })
})
