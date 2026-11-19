// "O que cada venda libera", visto pelo produto da Hotmart (Vendas → Produtos). O dono marca CURSOS; por baixo
// continuam linhas `ligacao_de_venda` (produto, oferta, turma). A turma usada ao marcar é a principal do curso.

import { and, asc, eq, inArray, isNull } from 'drizzle-orm'
import { curso, ligacaoDeVenda, turma } from '#/db/schema'
import { ligarNaTurma } from '#/regras/grupo-de-ligacoes'
import { criarTurma } from '#/regras/matricula'
import { type Banco, comoLibsql, type Relogio } from '#/regras/tipos'
import { listarLigacoes } from '#/regras/vendas'

export const NOME_DA_TURMA_PRINCIPAL = 'Turma principal'

export interface TurmaDoCurso {
  id: string
  nome: string
  criadoEm: Date
}

// A turma principal é a mais antiga do curso; empate de data desempata pelo id, para a escolha não oscilar.
export function turmaPrincipalDoCurso<T extends TurmaDoCurso>(
  turmas: readonly T[],
): T | null {
  let principal: T | null = null
  for (const t of turmas) {
    if (
      !principal ||
      t.criadoEm.getTime() < principal.criadoEm.getTime() ||
      (t.criadoEm.getTime() === principal.criadoEm.getTime() &&
        t.id < principal.id)
    ) {
      principal = t
    }
  }
  return principal
}

export interface LinhaDeLigacao {
  produtoId: string
  /** Vazio: qualquer oferta. */
  ofertaHash: string
  cursoId: string
  turmaId: string
  turmaNome: string
}

export interface CursoMarcado {
  cursoId: string
  /** Nome da edição, quando a ligação existe só em turma que não é a principal do curso. */
  pelaEdicao: string | null
}

export interface OfertaMarcada {
  ofertaHash: string
  cursos: CursoMarcado[]
}

export interface LiberacaoDoProduto {
  produtoId: string
  qualquerOferta: CursoMarcado[]
  ofertas: OfertaMarcada[]
}

type Marcados = Map<string, CursoMarcado & { naPrincipal: boolean }>

function marcar(
  destino: Marcados,
  l: LinhaDeLigacao,
  principalDoCurso: Record<string, string | undefined>,
) {
  const naPrincipal = principalDoCurso[l.cursoId] === l.turmaId
  const atual = destino.get(l.cursoId)
  if (!atual) {
    destino.set(l.cursoId, {
      cursoId: l.cursoId,
      pelaEdicao: naPrincipal ? null : l.turmaNome,
      naPrincipal,
    })
  } else if (naPrincipal && !atual.naPrincipal) {
    atual.naPrincipal = true
    atual.pelaEdicao = null
  }
}

function aLista(m: Marcados): CursoMarcado[] {
  return [...m.values()].map(({ cursoId, pelaEdicao }) => ({
    cursoId,
    pelaEdicao,
  }))
}

// Junta as linhas por produto: "qualquer oferta" e, por oferta, os cursos marcados (curso com ligação em QUALQUER
// turma dele). `principalDoCurso`: cursoId -> id da turma principal.
export function montarLiberacaoPorProduto(
  ligacoes: readonly LinhaDeLigacao[],
  principalDoCurso: Record<string, string | undefined>,
): LiberacaoDoProduto[] {
  const produtos = new Map<
    string,
    { qualquer: Marcados; ofertas: Map<string, Marcados> }
  >()
  for (const l of ligacoes) {
    let p = produtos.get(l.produtoId)
    if (!p) {
      p = { qualquer: new Map(), ofertas: new Map() }
      produtos.set(l.produtoId, p)
    }
    if (l.ofertaHash === '') {
      marcar(p.qualquer, l, principalDoCurso)
      continue
    }
    let o = p.ofertas.get(l.ofertaHash)
    if (!o) {
      o = new Map()
      p.ofertas.set(l.ofertaHash, o)
    }
    marcar(o, l, principalDoCurso)
  }
  return [...produtos.entries()].map(([produtoId, p]) => ({
    produtoId,
    qualquerOferta: aLista(p.qualquer),
    ofertas: [...p.ofertas.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([ofertaHash, m]) => ({ ofertaHash, cursos: aLista(m) })),
  }))
}

export interface OfertaParaMostrar {
  ofertaHash: string
  /** Nulo enquanto a Hotmart não respondeu (ou se falhou): a tela mostra só o código. */
  nome: string | null
  marcados: CursoMarcado[]
}

// Ofertas da tela: primeiro as que já têm ligação (com o nome, se as ofertas da Hotmart já chegaram); depois as
// demais ofertas do produto, sem nenhum curso marcado.
export function ofertasParaMostrar(
  comLigacao: readonly OfertaMarcada[],
  carregadas: readonly { codigo: string; nome: string }[] | null,
): OfertaParaMostrar[] {
  return [
    ...comLigacao.map((o) => ({
      ofertaHash: o.ofertaHash,
      nome: carregadas?.find((c) => c.codigo === o.ofertaHash)?.nome ?? null,
      marcados: o.cursos,
    })),
    ...(carregadas ?? [])
      .filter((c) => !comLigacao.some((o) => o.ofertaHash === c.codigo))
      .map((c) => ({ ofertaHash: c.codigo, nome: c.nome, marcados: [] })),
  ]
}

export interface CursoParaMarcar {
  id: string
  nome: string
  turmaPrincipalId: string | null
}

// Leitura da tela, numa rodada: ligações da Hotmart e cursos com suas turmas.
export async function carregarLiberacaoDaHotmart(banco: Banco) {
  const db = comoLibsql(banco)
  const [ligacoes, linhas] = await Promise.all([
    listarLigacoes(banco, 'hotmart'),
    db
      .select({
        cursoId: curso.id,
        cursoNome: curso.nome,
        turmaId: turma.id,
        turmaNome: turma.nome,
        criadoEm: turma.criadoEm,
      })
      .from(curso)
      .leftJoin(turma, eq(turma.cursoId, curso.id))
      .where(isNull(curso.excluidoEm))
      .orderBy(asc(curso.ordem), asc(curso.nome)),
  ])
  const porCurso = new Map<string, { nome: string; turmas: TurmaDoCurso[] }>()
  for (const l of linhas) {
    const c = porCurso.get(l.cursoId) ?? { nome: l.cursoNome, turmas: [] }
    porCurso.set(l.cursoId, c)
    if (l.turmaId && l.criadoEm) {
      c.turmas.push({
        id: l.turmaId,
        nome: l.turmaNome ?? '',
        criadoEm: l.criadoEm,
      })
    }
  }
  const cursos: CursoParaMarcar[] = [...porCurso.entries()].map(([id, c]) => ({
    id,
    nome: c.nome,
    turmaPrincipalId: turmaPrincipalDoCurso(c.turmas)?.id ?? null,
  }))
  const principalDoCurso = Object.fromEntries(
    cursos.map((c) => [c.id, c.turmaPrincipalId ?? undefined]),
  )
  return {
    cursos,
    liberacoes: montarLiberacaoPorProduto(ligacoes, principalDoCurso),
  }
}

async function turmasDoCurso(banco: Banco, cursoId: string) {
  return comoLibsql(banco)
    .select({ id: turma.id, nome: turma.nome, criadoEm: turma.criadoEm })
    .from(turma)
    .where(eq(turma.cursoId, cursoId))
}

// Marca o curso: liga produto (e oferta) à turma principal do curso. Curso sem turma ganha a "Turma principal"
// (vitalícia). Já marcado (em qualquer turma do curso) não faz nada.
export async function marcarCursoNaOferta(
  banco: Banco,
  agora: Relogio,
  entrada: { produtoId: string; ofertaHash?: string; cursoId: string },
): Promise<void> {
  const db = comoLibsql(banco)
  const produtoId = entrada.produtoId.trim()
  const ofertaHash = entrada.ofertaHash?.trim() ?? ''
  const turmas = await turmasDoCurso(banco, entrada.cursoId)
  if (turmas.length > 0) {
    const [ja] = await db
      .select({ id: ligacaoDeVenda.id })
      .from(ligacaoDeVenda)
      .where(
        and(
          eq(ligacaoDeVenda.gateway, 'hotmart'),
          eq(ligacaoDeVenda.produtoId, produtoId),
          eq(ligacaoDeVenda.ofertaHash, ofertaHash),
          inArray(
            ligacaoDeVenda.turmaId,
            turmas.map((t) => t.id),
          ),
        ),
      )
      .limit(1)
    if (ja) return
  }
  const turmaId =
    turmaPrincipalDoCurso(turmas)?.id ??
    (await criarTurma(banco, {
      cursoId: entrada.cursoId,
      nome: NOME_DA_TURMA_PRINCIPAL,
      prazoEmDias: null,
    }))
  await ligarNaTurma(banco, agora, {
    gateway: 'hotmart',
    turmaId,
    produtoId,
    ofertaHash,
  })
}

// Desmarca o curso: remove TODAS as ligações do produto+oferta com turmas do curso.
export async function desmarcarCursoNaOferta(
  banco: Banco,
  entrada: { produtoId: string; ofertaHash?: string; cursoId: string },
): Promise<void> {
  const db = comoLibsql(banco)
  const turmas = await turmasDoCurso(banco, entrada.cursoId)
  if (turmas.length === 0) return
  await db.delete(ligacaoDeVenda).where(
    and(
      eq(ligacaoDeVenda.gateway, 'hotmart'),
      eq(ligacaoDeVenda.produtoId, entrada.produtoId.trim()),
      eq(ligacaoDeVenda.ofertaHash, entrada.ofertaHash?.trim() ?? ''),
      inArray(
        ligacaoDeVenda.turmaId,
        turmas.map((t) => t.id),
      ),
    ),
  )
}
