import { cursosDoAluno } from '#/regras/matricula'
import { type Pessoa, podeFazer } from '#/regras/permissoes'
import type { Banco, Relogio } from '#/regras/tipos'

// Quem pode abrir o curso e baixar os materiais dele. A Equipe vê tudo (usa o Estúdio). O aluno
// acessa um curso sempre por uma Turma: vale a matrícula ativa. Matrícula expirada não abre nada
// (o aluno ainda entra na área e vê o cadeado "acesso expirado" na vitrine).
export async function cursosAcessiveis(
  db: Banco,
  agora: Relogio,
  pessoa: Pessoa,
): Promise<string[] | 'todos'> {
  if (podeFazer(pessoa.perfil, 'usar-estudio')) return 'todos'
  return (await cursosDoAluno(db, agora, pessoa.id)).ativos
}

// Os cursos acessíveis e os de matrícula expirada numa consulta só (a vitrine precisa dos dois).
export async function acessoDaPessoa(
  db: Banco,
  agora: Relogio,
  pessoa: Pessoa,
): Promise<{ acessiveis: string[] | 'todos'; expirados: string[] }> {
  if (podeFazer(pessoa.perfil, 'usar-estudio')) {
    return { acessiveis: 'todos', expirados: [] }
  }
  const { ativos, expirados } = await cursosDoAluno(db, agora, pessoa.id)
  return { acessiveis: ativos, expirados }
}

export async function podeAcessarCurso(
  db: Banco,
  agora: Relogio,
  pessoa: Pessoa,
  cursoId: string,
): Promise<boolean> {
  const acessiveis = await cursosAcessiveis(db, agora, pessoa)
  return acessiveis === 'todos' || acessiveis.includes(cursoId)
}
