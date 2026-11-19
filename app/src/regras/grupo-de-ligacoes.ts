// Ligações de venda vistas pela turma (#150): quem edita o vínculo "produto + oferta -> turma" é a tela da turma.
// Por baixo, continuam linhas `ligacao_de_venda` (sem tabela nova); o combo é o mesmo produto/oferta em várias turmas.

import { and, eq } from 'drizzle-orm'
import { type Gateway, ligacaoDeVenda } from '#/db/schema'
import { type Banco, comoLibsql, type Relogio } from '#/regras/tipos'
import { ErroDeVenda, ligarProduto, type listarLigacoes } from '#/regras/vendas'

export interface EntradaNaTurma {
  gateway?: Gateway
  turmaId: string
  produtoId: string
  /** Vazio: vale para todas as ofertas do produto. */
  ofertaHash?: string | null
}

// Liga UM produto (e oferta) a UMA turma. O prazo fica nulo: vale o da turma. Recusa repetir a mesma ligação
// (o upsert de `ligarProduto` apagaria um prazo que já estivesse na linha).
export async function ligarNaTurma(
  banco: Banco,
  agora: Relogio,
  entrada: EntradaNaTurma,
): Promise<{ aplicadas: number }> {
  const gateway = entrada.gateway ?? 'hotmart'
  const produtoId = entrada.produtoId.trim()
  const ofertaHash = entrada.ofertaHash?.trim() ?? ''
  const [existente] = await comoLibsql(banco)
    .select({ id: ligacaoDeVenda.id })
    .from(ligacaoDeVenda)
    .where(
      and(
        eq(ligacaoDeVenda.gateway, gateway),
        eq(ligacaoDeVenda.produtoId, produtoId),
        eq(ligacaoDeVenda.ofertaHash, ofertaHash),
        eq(ligacaoDeVenda.turmaId, entrada.turmaId),
      ),
    )
    .limit(1)
  if (existente) {
    throw new ErroDeVenda(
      ofertaHash
        ? 'Esta oferta já libera esta turma.'
        : 'Este produto já libera esta turma.',
    )
  }
  return ligarProduto(banco, agora, {
    gateway,
    turmaId: entrada.turmaId,
    produtoId,
    ofertaHash,
    prazoEmDias: null,
  })
}

type Ligacao = Awaited<ReturnType<typeof listarLigacoes>>[number]

export interface LigacaoDaTurma {
  id: string
  produtoId: string
  /** Vazio: todas as ofertas. */
  ofertaHash: string
  /** Outras turmas que a mesma compra também libera (mesma oferta ou todas as ofertas) (combo), como "Curso – Turma". */
  tambem: string[]
}

type Linha = Pick<
  Ligacao,
  'id' | 'produtoId' | 'ofertaHash' | 'turmaId' | 'turmaNome' | 'cursoNome'
>

// As ligações de uma turma, cada uma com as outras turmas que o mesmo produto/oferta libera.
export function ligacoesDaTurma(
  ligacoes: Linha[],
  turmaId: string,
): LigacaoDaTurma[] {
  return ligacoes
    .filter((l) => l.turmaId === turmaId)
    .map((l) => ({
      id: l.id,
      produtoId: l.produtoId,
      ofertaHash: l.ofertaHash,
      tambem: ligacoes
        .filter(
          (o) =>
            o.turmaId !== turmaId &&
            o.produtoId === l.produtoId &&
            // As ligações somam: a oferta específica também libera as de "todas as ofertas".
            (o.ofertaHash === l.ofertaHash ||
              (l.ofertaHash !== '' && o.ofertaHash === '')),
        )
        .map((o) => `${o.cursoNome} – ${o.turmaNome}`),
    }))
}

// "Acesso: para sempre" / "Acesso: 90 dias".
export function textoDeAcesso(prazoEmDias: number | null): string {
  if (!prazoEmDias) return 'para sempre'
  return `${prazoEmDias} ${prazoEmDias === 1 ? 'dia' : 'dias'}`
}

// A aba aberta do curso: o que não for conhecido cai em Conteúdo.
export const ABAS_DO_CURSO = [
  'conteudo',
  'quem-compra',
  'liberacao',
  'alunos',
] as const
export type AbaDoCurso = (typeof ABAS_DO_CURSO)[number]

export function abaDoCurso(valor: unknown): AbaDoCurso {
  return ABAS_DO_CURSO.find((a) => a === valor) ?? 'conteudo'
}
