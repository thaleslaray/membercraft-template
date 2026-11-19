// Cola entre as server functions e o módulo de acesso (#42): as opções comuns e a forma da
// situação que vai para as telas. Sem `env` aqui: quem chama passa o banco.

import {
  type Aluno,
  type MapaDeSituacoes,
  type OpcoesDeAcesso,
  situacaoDoConteudo,
  situacoesDosCursos,
} from '#/regras/acesso'
import type { SituacaoDoConteudo } from '#/regras/cadeado'
import { podeFazer } from '#/regras/permissoes'
import { saldoDoCurso } from '#/regras/pontos'
import type { Banco } from '#/regras/tipos'

// O pedaço que a tela recebe: situações por id (objeto simples, passa pela rede).
export interface SituacoesParaTela {
  modulos: Record<string, SituacaoDoConteudo>
  aulas: Record<string, SituacaoDoConteudo>
}

// `como` (id de turma) só vale para a equipe: é o "ver como aluno".
export function opcoesDeAcesso(
  db: Banco,
  aluno: Aluno,
  como?: string | null,
): OpcoesDeAcesso {
  return {
    // A pontuação mínima vê só os pontos do curso (#54).
    saldoDoCurso: (userId, cursoId) => saldoDoCurso(db, userId, cursoId),
    comoAluno:
      como && podeFazer(aluno.perfil, 'usar-estudio')
        ? { turmaId: como }
        : undefined,
  }
}

export async function situacoesDaPessoa(
  db: Banco,
  agora: () => Date,
  aluno: Aluno,
  cursoIds: string[],
  como?: string | null,
): Promise<MapaDeSituacoes> {
  return situacoesDosCursos(
    db,
    agora,
    aluno,
    cursoIds,
    opcoesDeAcesso(db, aluno, como),
  )
}

export function paraATela(mapa: MapaDeSituacoes): SituacoesParaTela {
  return {
    modulos: Object.fromEntries(mapa.modulos),
    aulas: Object.fromEntries(mapa.aulas),
  }
}

// Aula que a pessoa pode abrir agora (nem oculta nem com cadeado). A equipe sempre pode.
export async function aulaEstaLiberada(
  db: Banco,
  agora: () => Date,
  aluno: Aluno,
  aulaId: string,
): Promise<boolean> {
  const situacao = await situacaoDoConteudo(
    db,
    agora,
    aluno,
    {
      tipo: 'aula',
      id: aulaId,
    },
    opcoesDeAcesso(db, aluno),
  )
  return situacao.tipo === 'liberado'
}
