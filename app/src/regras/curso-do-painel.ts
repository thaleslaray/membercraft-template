// Dados das abas da página do curso (Quem compra, Liberação, Alunos). O banco é o mesmo de sempre: "edição" é a
// turma. Cada leitura sai numa rodada só (`Promise.all`).

import { asc, count, desc, eq } from 'drizzle-orm'
import { curso, matricula, turma, user } from '#/db/schema'
import { ligacoesDaTurma } from '#/regras/grupo-de-ligacoes'
import { opcoesDeAlvo, regrasDaTurma } from '#/regras/regras-de-liberacao'
import { type Banco, comoLibsql } from '#/regras/tipos'
import { listarLigacoes } from '#/regras/vendas'

const LIMITE_DE_ALUNOS = 500

export async function edicoesDoCurso(banco: Banco, cursoId: string) {
  return comoLibsql(banco)
    .select({
      id: turma.id,
      nome: turma.nome,
      prazoEmDias: turma.prazoEmDias,
    })
    .from(turma)
    .where(eq(turma.cursoId, cursoId))
    .orderBy(asc(turma.criadoEm))
}

async function totalDeAlunos(banco: Banco, cursoId: string): Promise<number> {
  const [linha] = await comoLibsql(banco)
    .select({ total: count() })
    .from(matricula)
    .innerJoin(turma, eq(turma.id, matricula.turmaId))
    .where(eq(turma.cursoId, cursoId))
  return linha?.total ?? 0
}

export async function nomeDoCurso(
  banco: Banco,
  cursoId: string,
): Promise<string | null> {
  const [linha] = await comoLibsql(banco)
    .select({ nome: curso.nome })
    .from(curso)
    .where(eq(curso.id, cursoId))
  return linha?.nome ?? null
}

// Alunos por edição, para o bloco de cada uma.
async function alunosPorEdicao(banco: Banco, cursoId: string) {
  const linhas = await comoLibsql(banco)
    .select({ turmaId: matricula.turmaId, total: count() })
    .from(matricula)
    .innerJoin(turma, eq(turma.id, matricula.turmaId))
    .where(eq(turma.cursoId, cursoId))
    .groupBy(matricula.turmaId)
  return new Map(linhas.map((l) => [l.turmaId, l.total]))
}

export async function quemCompraDoCurso(banco: Banco, cursoId: string) {
  const [edicoes, ligacoes, alunos] = await Promise.all([
    edicoesDoCurso(banco, cursoId),
    listarLigacoes(banco, 'hotmart'),
    alunosPorEdicao(banco, cursoId),
  ])
  return {
    edicoes: edicoes.map((e) => ({
      ...e,
      alunos: alunos.get(e.id) ?? 0,
      ligacoes: ligacoesDaTurma(ligacoes, e.id),
    })),
  }
}

// Sem `turmaId`, as regras esperam as edições chegarem (2 idas): só no link sem edição.
export async function liberacaoDoCurso(
  banco: Banco,
  cursoId: string,
  turmaId?: string,
) {
  const edicoes = turmaId ? null : await edicoesDoCurso(banco, cursoId)
  const escolhida = turmaId ?? edicoes?.[0]?.id
  const [todas, regras, alvos] = await Promise.all([
    edicoes ?? edicoesDoCurso(banco, cursoId),
    escolhida ? regrasDaTurma(banco, escolhida) : null,
    escolhida ? opcoesDeAlvo(banco) : null,
  ])
  // Uma edição de outro curso não vale aqui.
  const valida = regras && todas.some((e) => e.id === regras.turma.id)
  return {
    edicoes: todas,
    regras: valida ? regras : null,
    alvos: valida ? alvos : null,
  }
}

export async function alunosDoCurso(banco: Banco, cursoId: string) {
  return comoLibsql(banco)
    .select({
      matriculaId: matricula.id,
      alunoId: user.id,
      nome: user.name,
      email: user.email,
      edicao: turma.nome,
      desde: matricula.iniciaEm,
      situacao: matricula.situacao,
    })
    .from(matricula)
    .innerJoin(turma, eq(turma.id, matricula.turmaId))
    .innerJoin(user, eq(user.id, matricula.userId))
    .where(eq(turma.cursoId, cursoId))
    .orderBy(desc(matricula.iniciaEm))
    .limit(LIMITE_DE_ALUNOS)
}

export { totalDeAlunos }

export async function cursoDaTurma(
  banco: Banco,
  turmaId: string,
): Promise<string | null> {
  const [linha] = await comoLibsql(banco)
    .select({ cursoId: turma.cursoId })
    .from(turma)
    .innerJoin(curso, eq(curso.id, turma.cursoId))
    .where(eq(turma.id, turmaId))
  return linha?.cursoId ?? null
}
