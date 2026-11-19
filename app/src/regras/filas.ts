// Filas do Estúdio (#61, user story 104): cada fila é uma lista de coisas esperando a Equipe.
// `FILAS` é o ÚNICO registro: o contador do menu do painel, o resumo diário e o aviso no sininho da
// equipe (`contadores-de-fila.ts`) leem esta mesma lista. Uma fila nova entra como uma linha aqui:
//   { id, rotulo, aviso, para: '/painel/<tela>', contar: (db) => contarSuaFila(db) }
// `contar` devolve quantos itens esperam agora (a função de contagem mora no módulo da fatia dona).

import { count, eq } from 'drizzle-orm'
import { avisoDeVenda } from '#/db/schema'
import { contarAbertas } from '#/regras/atendimento'
import { contarParaLer } from '#/regras/avaliacoes'
import { contarPedidosNaFila, destaqueDoResumo } from '#/regras/pedido-do-mec'
import { contarAguardandoResposta } from '#/regras/publicacoes'
import { contarAguardandoCorrecao } from '#/regras/quiz-correcao'
import { type Banco, comoLibsql, type Relogio } from '#/regras/tipos'

export interface FilaDoPainel {
  id: string
  /** Nome da fila, como aparece no resumo diário. */
  rotulo: string
  /** Complemento de "N novos itens: ...", no aviso do sininho da equipe. */
  aviso: string
  /** Tela do painel onde a fila é trabalhada (o contador do menu fica nesse item). */
  para: string
  contar: (db: Banco) => Promise<number>
  /** Complemento do resumo diário (ex.: "2 com mais de 5 dias úteis"); null = nada a destacar. */
  destaque?: (db: Banco, agora: Relogio) => Promise<string | null>
}

/** Vendas pagas da Voomp esperando um produto ligado a uma turma. */
export async function contarVendasSemTurma(banco: Banco): Promise<number> {
  const db = comoLibsql(banco)
  const [{ total }] = await db
    .select({ total: count() })
    .from(avisoDeVenda)
    .where(eq(avisoDeVenda.situacao, 'sem_turma'))
  return total
}

export const FILAS: readonly FilaDoPainel[] = [
  {
    id: 'atendimentos-abertos',
    rotulo: 'Atendimentos abertos',
    aviso: 'atendimentos abertos',
    para: '/painel/atendimento',
    contar: contarAbertas,
  },
  {
    id: 'aguardando-correcao',
    rotulo: 'Aguardando correção',
    aviso: 'respostas de exercício aguardando correção',
    para: '/painel/correcao',
    contar: contarAguardandoCorrecao,
  },
  {
    id: 'aguardando-resposta',
    rotulo: 'Aguardando resposta',
    aviso: 'publicações aguardando resposta na comunidade',
    para: '/painel/aguardando-resposta',
    contar: contarAguardandoResposta,
  },
  {
    id: 'avaliacoes-para-ler',
    rotulo: 'Avaliações para ler',
    aviso: 'avaliações de aula para ler',
    para: '/painel/avaliacoes',
    contar: contarParaLer,
  },
  {
    id: 'certificado-do-mec',
    rotulo: 'Certificado do MEC',
    aviso: 'pedidos do MEC na fila',
    para: '/painel/certificado-do-mec',
    contar: contarPedidosNaFila,
    destaque: destaqueDoResumo,
  },
  {
    id: 'vendas-sem-turma',
    rotulo: 'Vendas sem turma',
    aviso: 'vendas da Voomp sem turma',
    para: '/painel/vendas',
    contar: contarVendasSemTurma,
  },
]

export interface ContadorDeFila {
  id: string
  rotulo: string
  para: string
  total: number
  /** Complemento do resumo diário, só quando há o que destacar. */
  destaque?: string
}

/**
 * Conta todas as filas. A contagem que falhar vale 0 (e vai ao log): uma fila quebrada não derruba
 * o painel nem o resumo das outras.
 */
export async function contarFilas(
  db: Banco,
  filas: readonly FilaDoPainel[],
  agora: Relogio,
): Promise<ContadorDeFila[]> {
  return Promise.all(
    filas.map(async ({ id, rotulo, para, contar, destaque }) => {
      try {
        // A contagem e o destaque saem juntos (o destaque só vale com total > 0, mas esperar a contagem
        // para decidir custava uma ida a mais em fila). Sem itens, o destaque lido é descartado.
        const destacando = destaque?.(db, agora)
        destacando?.catch(() => {})
        const total = Math.max(0, await contar(db))
        const complemento = total > 0 ? await destacando : null
        return {
          id,
          rotulo,
          para,
          total,
          ...(complemento ? { destaque: complemento } : {}),
        }
      } catch (erro) {
        console.error(`[filas] não consegui contar "${id}"`, erro)
        return { id, rotulo, para, total: 0 }
      }
    }),
  )
}
