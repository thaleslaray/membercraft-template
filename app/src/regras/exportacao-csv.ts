// Exportação em CSV dos relatórios, do ranking completo e das respostas dos quizzes. Só o
// Proprietário exporta (`exportar-dados`, conferido por quem chama); cada exportação entra no
// registro de ações, com o tipo, os filtros e o número de linhas.
//
// Ponto de extensão (`GanchosDaExportacao`): o ranking completo (#54) entra em `ranking`; sem o
// gancho, pedir o ranking dá erro claro.

import { type Celula, gerarCsv } from '#/regras/csv'
import { registrarAcao } from '#/regras/registro-de-acoes'
import {
  ErroDeRelatorio,
  type FaixaDeProgresso,
  type GanchosDoPanorama,
  type GanchosDoProgresso,
  type MetricasDoPanorama,
  panorama,
  periodoDoRelatorio,
  progressoDosAlunos,
} from '#/regras/relatorios'
import {
  relatorioDeQuizzes,
  respostasDosQuizzes,
} from '#/regras/relatorios-quizzes'
import { relatorioDeSatisfacao } from '#/regras/relatorios-satisfacao'
import type { Banco, Relogio } from '#/regras/tipos'

export const TIPOS_DE_EXPORTACAO = [
  'panorama',
  'progresso',
  'satisfacao',
  'quizzes',
  'respostas-de-quiz',
  'ranking',
] as const
export type TipoDeExportacao = (typeof TIPOS_DE_EXPORTACAO)[number]

export interface LinhaDoRanking {
  posicao: number
  nome: string
  email: string
  pontos: number
}

export interface GanchosDaExportacao
  extends GanchosDoPanorama,
    GanchosDoProgresso {
  /** O ranking completo (#54): geral, ou do curso do pedido. */
  ranking?: (db: Banco, cursoId: string | null) => Promise<LinhaDoRanking[]>
}

export interface PedidoDeExportacao {
  tipo: string
  de?: string | null
  ate?: string | null
  cursoId?: string | null
  sumiuHaDias?: number | null
  faixa?: FaixaDeProgresso | null
}

export interface ArquivoCsv {
  nome: string
  conteudo: string
}

const dataHoraBrasilia = (d: Date | null) =>
  d
    ? d.toLocaleString('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        dateStyle: 'short',
        timeStyle: 'short',
      })
    : ''

const diaBrasilia = (d: Date) =>
  new Date(d.getTime() - 3 * 3_600_000).toISOString().slice(0, 10)

const minutos = (segundos: number) => Math.round(segundos / 60)

function ehTipo(tipo: string): tipo is TipoDeExportacao {
  return (TIPOS_DE_EXPORTACAO as readonly string[]).includes(tipo)
}

export async function exportarCsv(
  db: Banco,
  agora: Relogio,
  autorId: string,
  pedido: PedidoDeExportacao,
  ganchos: GanchosDaExportacao = {},
): Promise<ArquivoCsv> {
  if (!ehTipo(pedido.tipo)) throw new ErroDeRelatorio('Relatório desconhecido.')
  const { tipo } = pedido
  const periodo = periodoDoRelatorio(agora(), pedido.de, pedido.ate)
  const filtro = { periodo, cursoId: pedido.cursoId }
  let cabecalho: string[]
  let linhas: Celula[][]

  if (tipo === 'panorama') {
    const p = await panorama(db, filtro, ganchos)
    cabecalho = [
      'Curso',
      'Alunos ativos',
      'Novos',
      'Nunca acessaram',
      'Aulas concluídas',
      'Comentários',
      'Avaliações',
    ]
    const linha = (nome: string, m: MetricasDoPanorama): Celula[] => [
      nome,
      m.alunosAtivos,
      m.novos,
      m.nuncaAcessaram,
      m.aulasConcluidas,
      m.comentarios,
      m.avaliacoes,
    ]
    linhas = [
      linha('Todos os cursos', p.geral),
      ...p.porCurso.map((c) => linha(c.cursoNome, c)),
    ]
  } else if (tipo === 'progresso') {
    if (!pedido.cursoId) throw new ErroDeRelatorio('Escolha um curso.')
    const p = await progressoDosAlunos(
      db,
      agora,
      {
        cursoId: pedido.cursoId,
        sumiuHaDias: pedido.sumiuHaDias,
        faixa: pedido.faixa,
      },
      ganchos,
    )
    cabecalho = [
      'Aluno',
      'E-mail',
      'Aulas concluídas',
      'Total de aulas',
      'Progresso (%)',
      'Último acesso',
      'Minutos de vídeo',
      'Pontos',
    ]
    linhas = p.alunos.map((a) => [
      a.nome,
      a.email,
      a.aulasConcluidas,
      a.totalDeAulas,
      a.percentual,
      a.ultimoAcessoEm ? dataHoraBrasilia(a.ultimoAcessoEm) : 'nunca acessou',
      minutos(a.tempoDeVideo),
      a.pontos,
    ])
  } else if (tipo === 'satisfacao') {
    const r = await relatorioDeSatisfacao(db, filtro)
    cabecalho = [
      'Curso',
      'Aula',
      'Notas',
      'Média',
      'Notas baixas (%)',
      'Promotores',
      'Neutros',
      'Detratores',
      'NPS',
      'O que faltou?',
    ]
    linhas = r.aulas.map((a) => [
      a.cursoNome,
      a.aulaTitulo,
      a.total,
      a.media,
      a.percentualDeNotasBaixas,
      a.promotores,
      a.neutros,
      a.detratores,
      a.nps,
      r.textos
        .filter(
          (t) => t.aulaTitulo === a.aulaTitulo && t.cursoNome === a.cursoNome,
        )
        .map((t) => t.oQueFaltou)
        .join(' | '),
    ])
  } else if (tipo === 'quizzes') {
    const r = await relatorioDeQuizzes(db, filtro)
    cabecalho = [
      'Curso',
      'Aula',
      'Tentativas',
      'Alunos',
      'Aprovadas',
      'Reprovadas',
      'Aguardando correção',
      'Aprovação (%)',
      'Pergunta',
      'Respondidas',
      'Acertos',
      'Acerto (%)',
    ]
    linhas = r.quizzes.flatMap((q) =>
      (q.perguntas.length > 0 ? q.perguntas : [null]).map((p) => [
        q.cursoNome,
        q.aulaTitulo,
        q.tentativas,
        q.alunos,
        q.aprovadas,
        q.reprovadas,
        q.aguardandoCorrecao,
        q.taxaDeAprovacao,
        p?.enunciado ?? '',
        p?.respondidas,
        p?.acertos,
        p?.percentualDeAcerto,
      ]),
    )
  } else if (tipo === 'respostas-de-quiz') {
    const respostas = await respostasDosQuizzes(db, filtro)
    cabecalho = [
      'Curso',
      'Aula',
      'Aluno',
      'E-mail',
      'Tentativa',
      'Resultado',
      'Enviada em',
      'Pergunta',
      'Resposta',
      'Acertou',
    ]
    linhas = respostas.map((r) => [
      r.cursoNome,
      r.aulaTitulo,
      r.alunoNome,
      r.alunoEmail,
      r.tentativa,
      r.estado,
      dataHoraBrasilia(r.enviadaEm),
      r.pergunta,
      r.resposta,
      r.acertou,
    ])
  } else {
    if (!ganchos.ranking) {
      throw new ErroDeRelatorio('O ranking chega junto com os pontos.')
    }
    cabecalho = ['Posição', 'Aluno', 'E-mail', 'Pontos']
    linhas = (await ganchos.ranking(db, pedido.cursoId ?? null)).map((l) => [
      l.posicao,
      l.nome,
      l.email,
      l.pontos,
    ])
  }

  await registrarAcao(db, agora, {
    autorId,
    acao: 'exportacao-csv',
    detalhe: {
      tipo,
      linhas: linhas.length,
      filtros: {
        de: diaBrasilia(periodo.de),
        ate: diaBrasilia(periodo.ate),
        cursoId: pedido.cursoId ?? null,
        sumiuHaDias: pedido.sumiuHaDias ?? null,
        faixa: pedido.faixa ?? null,
      },
    },
  })
  return {
    nome: `relatorio-${tipo}-${diaBrasilia(agora())}.csv`,
    conteudo: gerarCsv(cabecalho, linhas),
  }
}
