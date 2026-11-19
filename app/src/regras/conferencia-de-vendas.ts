// Conferência de vendas (GLOSSARY): compara a planilha de vendas exportada da Voomp com as
// matrículas da área e mostra as vendas pagas sem matrícula; a equipe matricula com um clique,
// pelo mesmo caminho do webhook (`aplicarVendaPaga` e a ligação Produto da Voomp -> turmas).
// Cada conferência fica registrada com data, autor e totais.

import { count, desc, eq, inArray } from 'drizzle-orm'
import {
  conferenciaDeVendas,
  matricula,
  origemDaMatricula,
  user,
} from '#/db/schema'
import {
  aplicarVendaPaga,
  type EventoDeLiberacao,
  situacaoDaMatricula,
} from '#/regras/matricula'
import {
  deslocamento,
  montarPagina,
  type Pagina,
  POR_PAGINA,
} from '#/regras/paginacao'
import { normalizar, type PlanilhaInterpretada } from '#/regras/planilha-voomp'
import { registrarAcao } from '#/regras/registro-de-acoes'
import { type Banco, comoLibsql, type Relogio } from '#/regras/tipos'
import {
  houveEstorno,
  produtosVistos,
  turmasDaVenda,
  vendaIdDeOrigem,
} from '#/regras/vendas'

export class ErroDeConferencia extends Error {
  constructor(mensagem: string) {
    super(mensagem)
    this.name = 'ErroDeConferencia'
  }
}

// O D1 aceita no máximo 100 parâmetros por consulta.
const PEDACO = 50
function emPedacos<T>(lista: T[]): T[][] {
  const pedacos: T[][] = []
  for (let i = 0; i < lista.length; i += PEDACO) {
    pedacos.push(lista.slice(i, i + PEDACO))
  }
  return pedacos
}

export type SituacaoDoPendente = 'pendente' | 'sem_turma' | 'aplicada'

/** Uma venda paga da planilha que pede atenção. Vai guardada na conferência. */
export interface Pendente {
  vendaId: string
  email: string
  nome: string | null
  produtoId: string | null
  produtoNome: string | null
  ofertaHash: string | null
  situacao: SituacaoDoPendente
  motivo: string | null
}

export interface TotaisDaConferencia {
  linhas: number
  /** Linhas sem id da venda ou e-mail, e repetidas: não entram na comparação. */
  descartadas: number
  pagas: number
  naoPagas: number
  /** Pagas já com matrícula (a venda sustenta a matrícula, ou ela está ativa). */
  matriculadas: number
  /** Pagas que o webhook já tratou como estorno. */
  estornadas: number
  semMatricula: number
  semTurma: number
}

export interface ResultadoDaComparacao {
  totais: TotaisDaConferencia
  pendentes: Pendente[]
}

type PlanilhaParaComparar = Pick<
  PlanilhaInterpretada,
  'vendas' | 'invalidas' | 'repetidas' | 'totalLinhas'
>

// ---------- Comparar ----------

// Só lê. Uma venda paga está "matriculada" quando, em cada turma ligada ao produto, existe matrícula
// do e-mail sustentada por esta venda ou ainda ativa; fora isso é "pendente" (há turma ligada) ou
// "sem turma" (produto sem ligação, ou que não deu para reconhecer).
export async function compararComMatriculas(
  banco: Banco,
  agora: Relogio,
  planilha: PlanilhaParaComparar,
): Promise<ResultadoDaComparacao> {
  const db = comoLibsql(banco)
  const hoje = agora()
  const pagas = planilha.vendas.filter((v) => v.paga)

  // Produto só pelo nome: usa o id que apareceu nos avisos com aquele nome.
  const idPorNome = new Map<string, string>()
  for (const p of await produtosVistos(banco)) {
    if (p.produtoNome) {
      const chave = normalizar(p.produtoNome)
      if (!idPorNome.has(chave)) idPorNome.set(chave, p.produtoId)
    }
  }

  // Matrículas dos e-mails da planilha, e as origens por venda.
  const emails = [...new Set(pagas.map((v) => v.email))]
  const idDaConta = new Map<string, string>()
  for (const pedaco of emPedacos(emails)) {
    const contas = await db
      .select({ id: user.id, email: user.email })
      .from(user)
      .where(inArray(user.email, pedaco))
    for (const c of contas) idDaConta.set(c.email.toLowerCase(), c.id)
  }
  const matriculas: (typeof matricula.$inferSelect)[] = []
  for (const pedaco of emPedacos([...idDaConta.values()])) {
    matriculas.push(
      ...(await db
        .select()
        .from(matricula)
        .where(inArray(matricula.userId, pedaco))),
    )
  }
  const sustentadas = new Set<string>()
  for (const pedaco of emPedacos(matriculas.map((m) => m.id))) {
    const origens = await db
      .select({
        matriculaId: origemDaMatricula.matriculaId,
        vendaId: origemDaMatricula.vendaId,
      })
      .from(origemDaMatricula)
      .where(inArray(origemDaMatricula.matriculaId, pedaco))
    for (const o of origens) {
      if (o.vendaId) sustentadas.add(`${o.matriculaId}|${o.vendaId}`)
    }
  }

  const totais: TotaisDaConferencia = {
    linhas: planilha.totalLinhas,
    descartadas: planilha.invalidas + planilha.repetidas,
    pagas: pagas.length,
    naoPagas: planilha.vendas.length - pagas.length,
    matriculadas: 0,
    estornadas: 0,
    semMatricula: 0,
    semTurma: 0,
  }
  const pendentes: Pendente[] = []
  for (const venda of pagas) {
    if (await houveEstorno(db, venda.vendaId)) {
      totais.estornadas++
      continue
    }
    const base = {
      vendaId: venda.vendaId,
      email: venda.email,
      nome: venda.nome,
      ofertaHash: venda.ofertaHash,
      produtoNome: venda.produtoNome,
    }
    const produtoId =
      venda.produtoId ??
      (venda.produtoNome
        ? idPorNome.get(normalizar(venda.produtoNome))
        : undefined) ??
      null
    if (!produtoId) {
      totais.semTurma++
      pendentes.push({
        ...base,
        produtoId: null,
        situacao: 'sem_turma',
        motivo:
          'Não reconheci o produto: informe a coluna com o id do produto, ou ligue o produto à turma.',
      })
      continue
    }
    const ligadas = await turmasDaVenda(banco, produtoId, venda.ofertaHash)
    if (ligadas.length === 0) {
      totais.semTurma++
      pendentes.push({
        ...base,
        produtoId,
        situacao: 'sem_turma',
        motivo: 'O produto ainda não está ligado a nenhuma turma.',
      })
      continue
    }
    const userId = idDaConta.get(venda.email)
    const deles = matriculas.filter((m) => m.userId === userId)
    const coberta = ligadas.every((l) => {
      const m = deles.find((x) => x.turmaId === l.turmaId)
      return (
        m !== undefined &&
        (sustentadas.has(
          `${m.id}|${vendaIdDeOrigem('voomp', venda.vendaId)}`,
        ) ||
          situacaoDaMatricula(m, hoje) === 'ativa')
      )
    })
    if (coberta) {
      totais.matriculadas++
      continue
    }
    totais.semMatricula++
    pendentes.push({
      ...base,
      produtoId,
      situacao: 'pendente',
      motivo: null,
    })
  }
  return { totais, pendentes }
}

// ---------- Registrar ----------

export interface EntradaDaConferencia {
  autorId: string | null
  arquivoNome: string
  planilha: PlanilhaInterpretada
}

export async function registrarConferencia(
  banco: Banco,
  agora: Relogio,
  entrada: EntradaDaConferencia,
): Promise<{ id: string } & ResultadoDaComparacao> {
  const db = comoLibsql(banco)
  const comparacao = await compararComMatriculas(banco, agora, entrada.planilha)
  const id = crypto.randomUUID()
  await db.insert(conferenciaDeVendas).values({
    id,
    autorId: entrada.autorId,
    arquivoNome: entrada.arquivoNome.slice(0, 200),
    mapeamento: JSON.stringify(entrada.planilha.colunas),
    totalLinhas: comparacao.totais.linhas,
    totalPagas: comparacao.totais.pagas,
    totalMatriculadas: comparacao.totais.matriculadas,
    totalSemMatricula: comparacao.totais.semMatricula,
    totalSemTurma: comparacao.totais.semTurma,
    pendentes: JSON.stringify(comparacao.pendentes),
    criadoEm: agora(),
  })
  await registrarAcao(banco, agora, {
    autorId: entrada.autorId,
    acao: 'conferencia-de-vendas',
    detalhe: {
      conferenciaId: id,
      arquivo: entrada.arquivoNome,
      pagas: comparacao.totais.pagas,
      semMatricula: comparacao.totais.semMatricula,
    },
  })
  return { id, ...comparacao }
}

// ---------- Ler ----------

export interface ResumoDaConferencia {
  id: string
  arquivoNome: string
  autorNome: string | null
  criadoEm: Date
  totalLinhas: number
  totalPagas: number
  totalMatriculadas: number
  totalSemMatricula: number
  totalSemTurma: number
  totalAplicadas: number
}

const camposDoResumo = {
  id: conferenciaDeVendas.id,
  arquivoNome: conferenciaDeVendas.arquivoNome,
  autorNome: user.name,
  autorEmail: user.email,
  criadoEm: conferenciaDeVendas.criadoEm,
  totalLinhas: conferenciaDeVendas.totalLinhas,
  totalPagas: conferenciaDeVendas.totalPagas,
  totalMatriculadas: conferenciaDeVendas.totalMatriculadas,
  totalSemMatricula: conferenciaDeVendas.totalSemMatricula,
  totalSemTurma: conferenciaDeVendas.totalSemTurma,
  totalAplicadas: conferenciaDeVendas.totalAplicadas,
}

const comoResumo = ({
  autorEmail,
  autorNome,
  ...resto
}: {
  autorEmail: string | null
  autorNome: string | null
} & Omit<ResumoDaConferencia, 'autorNome'>): ResumoDaConferencia => ({
  ...resto,
  autorNome: autorNome || autorEmail,
})

/** O histórico de conferências, da mais nova à mais antiga, 20 por página. */
export async function listarConferencias(
  banco: Banco,
  pagina = 1,
): Promise<Pagina<ResumoDaConferencia>> {
  const db = comoLibsql(banco)
  // A contagem e a página não dependem uma da outra: uma ida só.
  const [[{ total }], linhas] = await db.batch([
    db.select({ total: count() }).from(conferenciaDeVendas),
    db
      .select(camposDoResumo)
      .from(conferenciaDeVendas)
      .leftJoin(user, eq(user.id, conferenciaDeVendas.autorId))
      .orderBy(desc(conferenciaDeVendas.criadoEm), desc(conferenciaDeVendas.id))
      .limit(POR_PAGINA)
      .offset(deslocamento(pagina)),
  ])
  return montarPagina(linhas.map(comoResumo), total, pagina)
}

export async function obterConferencia(banco: Banco, id: string) {
  const db = comoLibsql(banco)
  // A linha inteira e o resumo com o nome do autor: uma ida só.
  const [[linha], [resumo]] = await db.batch([
    db.select().from(conferenciaDeVendas).where(eq(conferenciaDeVendas.id, id)),
    db
      .select(camposDoResumo)
      .from(conferenciaDeVendas)
      .leftJoin(user, eq(user.id, conferenciaDeVendas.autorId))
      .where(eq(conferenciaDeVendas.id, id)),
  ])
  if (!linha) throw new ErroDeConferencia('Conferência não encontrada.')
  return {
    resumo: comoResumo(resumo),
    colunas: JSON.parse(linha.mapeamento) as Record<string, string>,
    pendentes: JSON.parse(linha.pendentes) as Pendente[],
  }
}

// ---------- Matricular ----------

export interface OpcoesDeMatricula {
  // PONTO DE EXTENSÃO da fatia #45: o e-mail de curso(s) liberado(s) sai por aqui, uma vez por venda, como em `processarAviso`.
  aoLiberarCursos?: (eventos: EventoDeLiberacao[]) => Promise<void>
}

export interface ResultadoDoClique {
  matriculadas: number
  /** Vendas que não deu para matricular, com o motivo. */
  falhas: { vendaId: string; motivo: string }[]
}

// Matricula as vendas pedidas (ou todas as pendentes, sem `vendaIds`) pelo caminho do webhook. Quem
// já foi aplicada é pulada, então clicar de novo não duplica nada. A ligação é lida de novo na hora:
// se o produto foi ligado depois da conferência, a venda "sem turma" também passa (se pedida).
export async function matricularPendentes(
  banco: Banco,
  agora: Relogio,
  entrada: {
    conferenciaId: string
    autorId: string | null
    vendaIds?: string[]
  },
  opcoes: OpcoesDeMatricula = {},
): Promise<ResultadoDoClique> {
  const db = comoLibsql(banco)
  const { pendentes } = await obterConferencia(banco, entrada.conferenciaId)
  const alvo = entrada.vendaIds ? new Set(entrada.vendaIds) : null
  if (alvo && alvo.size === 0) {
    throw new ErroDeConferencia('Escolha ao menos uma venda.')
  }
  const resultado: ResultadoDoClique = { matriculadas: 0, falhas: [] }
  for (const item of pendentes) {
    if (item.situacao === 'aplicada') continue
    if (alvo ? !alvo.has(item.vendaId) : item.situacao !== 'pendente') continue
    try {
      if (await houveEstorno(db, item.vendaId)) {
        throw new ErroDeConferencia('A venda foi estornada.')
      }
      if (!item.produtoId) {
        throw new ErroDeConferencia(
          'Não reconheci o produto desta venda: ligue o produto à turma e confira de novo.',
        )
      }
      const ligadas = await turmasDaVenda(
        banco,
        item.produtoId,
        item.ofertaHash,
      )
      if (ligadas.length === 0) {
        throw new ErroDeConferencia(
          'O produto ainda não está ligado a nenhuma turma.',
        )
      }
      await aplicarVendaPaga(banco, agora, {
        vendaId: vendaIdDeOrigem('voomp', item.vendaId),
        email: item.email,
        nome: item.nome,
        turmas: ligadas,
        aoLiberarCursos: opcoes.aoLiberarCursos,
      })
      item.situacao = 'aplicada'
      item.motivo = null
      resultado.matriculadas++
    } catch (erro) {
      resultado.falhas.push({
        vendaId: item.vendaId,
        motivo: erro instanceof Error ? erro.message : String(erro),
      })
    }
  }
  if (resultado.matriculadas > 0) {
    await db
      .update(conferenciaDeVendas)
      .set({
        pendentes: JSON.stringify(pendentes),
        totalAplicadas: pendentes.filter((p) => p.situacao === 'aplicada')
          .length,
      })
      .where(eq(conferenciaDeVendas.id, entrada.conferenciaId))
    await registrarAcao(banco, agora, {
      autorId: entrada.autorId,
      acao: 'conferencia-de-vendas',
      detalhe: {
        conferenciaId: entrada.conferenciaId,
        matriculadas: resultado.matriculadas,
        falhas: resultado.falhas.length,
      },
    })
  }
  return resultado
}
