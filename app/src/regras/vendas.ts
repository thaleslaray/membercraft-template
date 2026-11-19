// Vendas da Voomp: grava cada aviso do webhook antes de responder 200, processa o aviso (uma venda
// paga vira matrícula; estorno e chargeback tiram a origem) e cuida da ligação Produto da Voomp ->
// turmas. Idempotente: o mesmo aviso (mesma venda e gatilho) não tem efeito duplo, e reprocessar
// uma venda já aplicada não muda nada. Só `type = sale` mexe em matrícula (spec #33, "Vendas").

import { and, asc, count, desc, eq, inArray, like, ne, sql } from 'drizzle-orm'
import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import type * as schema from '#/db/schema'
import {
  avisoDeVenda,
  curso,
  estadoDeAviso,
  type Gateway,
  ligacaoDeVenda,
  matricula,
  turma,
} from '#/db/schema'
import {
  efeitoDoAvisoHotmart,
  interpretarAvisoHotmart,
  motivoSoGravarHotmart,
} from '#/regras/hotmart'
import { emLotes } from '#/regras/lotes'
import {
  aplicarEstorno,
  aplicarVendaPaga,
  type EventoDeLiberacao,
  type ResultadoDaVenda,
} from '#/regras/matricula'
import {
  deslocamento,
  montarPagina,
  type Pagina,
  POR_PAGINA,
} from '#/regras/paginacao'
import { type Banco, comoLibsql, type Relogio } from '#/regras/tipos'
import {
  type AvisoInterpretado,
  AvisoInvalido,
  type EfeitoDoGatilho,
  efeitoDoAviso,
  hashDoCorpo,
  interpretarAviso,
} from '#/regras/voomp'

export class ErroDeVenda extends Error {
  constructor(mensagem: string) {
    super(mensagem)
    this.name = 'ErroDeVenda'
  }
}

const novoId = () => crypto.randomUUID()

/** Gateway das vendas de hoje; os próximos tickets passam o gateway explícito. */
const GATEWAY_PADRAO: Gateway = 'voomp'

// O `vendaId` da origem da matrícula leva o gateway (`voomp:123`, `hotmart:HP123`): ids de
// plataformas diferentes nunca colidem. O aviso guarda o id cru; só a origem usa este formato.
export function vendaIdDeOrigem(gateway: Gateway, vendaId: string): string {
  return `${gateway}:${vendaId}`
}

interface AvisoLido extends AvisoInterpretado {
  /** Idempotência do gateway; nulo cai no hash do corpo. */
  chave: string | null
  efeito: EfeitoDoGatilho
  /** `creation_date` do evento (Hotmart); o estado mais recente da transação vale. */
  criadoEm: number | null
  motivoSoGravar: string
}

// Cada gateway lê o corpo do seu jeito; daqui para baixo o caminho é um só.
function lerAviso(gateway: Gateway, corpo: string): AvisoLido {
  if (gateway === 'hotmart') {
    const a = interpretarAvisoHotmart(corpo)
    return {
      ...a,
      // O `id` do evento é a chave: aviso repetido não tem efeito duplo.
      chave: a.eventoId,
      efeito: efeitoDoAvisoHotmart(a),
      criadoEm: a.criadoEm,
      motivoSoGravar: motivoSoGravarHotmart(a),
    }
  }
  const a = interpretarAviso(corpo)
  return {
    ...a,
    chave: a.vendaId ? `${a.vendaId}:${a.gatilho}` : null,
    efeito: efeitoDoAviso(a),
    criadoEm: null,
    motivoSoGravar: `Só gravado: ${a.gatilho} não mexe em matrícula.`,
  }
}

export type SituacaoDoAviso = (typeof avisoDeVenda.$inferSelect)['situacao']

// ---------- Gravar o aviso ----------

export interface AvisoGravado {
  id: string
  /** O corpo não é um aviso da Voomp: gravado com erro, sem fila. */
  invalido: boolean
  /** Já havia um aviso com a mesma venda e o mesmo gatilho. */
  repetido: boolean
  /** Vale mandar para a fila: aviso novo, ou repetido que ainda não foi processado. */
  enfileirar: boolean
}

// Grava o aviso cru. A `chave` (venda + gatilho) é a idempotência: o aviso repetido só conta uma
// repetição. Corpo que não é JSON da Voomp também fica gravado, como "com erro".
export async function gravarAviso(
  banco: Banco,
  agora: Relogio,
  corpo: string,
  gateway: Gateway = GATEWAY_PADRAO,
): Promise<AvisoGravado> {
  const db = comoLibsql(banco)
  const id = novoId()
  let valores: typeof avisoDeVenda.$inferInsert
  let invalido = false
  try {
    const aviso = lerAviso(gateway, corpo)
    valores = {
      id,
      gateway,
      chave: aviso.chave ?? `corpo:${await hashDoCorpo(corpo)}`,
      tipo: aviso.tipo,
      gatilho: aviso.gatilho,
      vendaId: aviso.vendaId,
      produtoId: aviso.produtoId,
      produtoNome: aviso.produtoNome,
      ofertaHash: aviso.ofertaHash,
      email: aviso.email,
      nome: aviso.nome,
      corpo,
      situacao: 'recebida',
      recebidoEm: agora(),
    }
  } catch (erro) {
    if (!(erro instanceof AvisoInvalido)) throw erro
    invalido = true
    valores = {
      id,
      gateway,
      chave: `corpo:${await hashDoCorpo(corpo)}`,
      tipo: 'desconhecido',
      gatilho: 'desconhecido',
      corpo,
      situacao: 'com_erro',
      motivo: erro.message,
      recebidoEm: agora(),
      processadoEm: agora(),
    }
  }

  // Hotmart: a conferência diária (`conferencia:<transação>:<gatilho>`) já recuperou esta transação e
  // este gatilho? O webhook real que chega depois é o mesmo fato: conta repetição, sem linha nova nem fila.
  if (gateway === 'hotmart' && valores.vendaId && !invalido) {
    const [daConferencia] = await db
      .select({ id: avisoDeVenda.id })
      .from(avisoDeVenda)
      .where(
        and(
          eq(avisoDeVenda.gateway, gateway),
          eq(avisoDeVenda.vendaId, valores.vendaId),
          eq(avisoDeVenda.gatilho, valores.gatilho),
          like(avisoDeVenda.chave, 'conferencia:%'),
        ),
      )
      .limit(1)
    if (daConferencia) {
      await db
        .update(avisoDeVenda)
        .set({ repeticoes: sql`${avisoDeVenda.repeticoes} + 1` })
        .where(eq(avisoDeVenda.id, daConferencia.id))
      return {
        id: daConferencia.id,
        invalido: false,
        repetido: true,
        enfileirar: false,
      }
    }
  }

  await db.insert(avisoDeVenda).values(valores).onConflictDoNothing()
  const [gravado] = await db
    .select()
    .from(avisoDeVenda)
    .where(
      and(
        eq(avisoDeVenda.gateway, gateway),
        eq(avisoDeVenda.chave, valores.chave),
      ),
    )
  if (gravado.id === id) {
    return { id, invalido, repetido: false, enfileirar: !invalido }
  }
  await db
    .update(avisoDeVenda)
    .set({ repeticoes: sql`${avisoDeVenda.repeticoes} + 1` })
    .where(eq(avisoDeVenda.id, gravado.id))
  return {
    id: gravado.id,
    invalido,
    repetido: true,
    enfileirar:
      !invalido &&
      (gravado.situacao === 'recebida' || gravado.situacao === 'com_erro'),
  }
}

// ---------- Ligação Produto da Voomp -> turmas ----------

export interface TurmaLigada {
  turmaId: string
  prazoEmDias: number | null
}

// As ligações SOMAM: a oferta comprada libera o que está ligado a ela mais o que está ligado a "todas as
// ofertas" do produto. Turma que aparece nas duas vale uma vez só, com o maior prazo (sem prazo = para sempre).
export async function turmasDaVenda(
  banco: Banco,
  produtoId: string,
  ofertaHash: string | null,
  gateway: Gateway = GATEWAY_PADRAO,
): Promise<TurmaLigada[]> {
  const db = comoLibsql(banco)
  const doProduto = async (oferta: string) =>
    db
      .select({
        turmaId: ligacaoDeVenda.turmaId,
        prazoEmDias: ligacaoDeVenda.prazoEmDias,
      })
      .from(ligacaoDeVenda)
      .where(
        and(
          eq(ligacaoDeVenda.gateway, gateway),
          eq(ligacaoDeVenda.produtoId, produtoId),
          eq(ligacaoDeVenda.ofertaHash, oferta),
        ),
      )
      .orderBy(asc(ligacaoDeVenda.criadoEm))
  const daOferta = ofertaHash ? await doProduto(ofertaHash) : []
  const detodas = await doProduto('')
  const somadas = new Map<string, TurmaLigada>()
  for (const l of [...daOferta, ...detodas]) {
    const ja = somadas.get(l.turmaId)
    if (!ja) {
      somadas.set(l.turmaId, { ...l })
    } else if (ja.prazoEmDias !== null) {
      ja.prazoEmDias =
        l.prazoEmDias === null ? null : Math.max(ja.prazoEmDias, l.prazoEmDias)
    }
  }
  return [...somadas.values()]
}

export interface EntradaDaLigacao {
  gateway?: Gateway
  produtoId: string
  /** Vazio: a ligação vale para o produto inteiro. */
  ofertaHash?: string | null
  turmaId: string
  /** Vazio: vale o prazo da turma. */
  prazoEmDias?: number | null
}

// Cria a ligação (ou troca o prazo da que já existe) e já processa as vendas pagas que esperavam
// por ela. Mudar uma ligação não mexe nas matrículas que já existem.
export async function ligarProduto(
  banco: Banco,
  agora: Relogio,
  entrada: EntradaDaLigacao,
  opcoes: OpcoesDeProcessamento = {},
): Promise<{ aplicadas: number }> {
  const db = comoLibsql(banco)
  const produtoId = entrada.produtoId.trim()
  const gateway = entrada.gateway ?? GATEWAY_PADRAO
  const nomeDaPlataforma = gateway === 'hotmart' ? 'Hotmart' : 'Voomp'
  if (!produtoId || produtoId.length > 100) {
    throw new ErroDeVenda(`Informe o id do Produto da ${nomeDaPlataforma}.`)
  }
  // O histórico de vendas da Hotmart só traz o product.id numérico (nunca o ucode).
  if (gateway === 'hotmart' && !/^\d+$/.test(produtoId)) {
    throw new ErroDeVenda(
      'O id do produto da Hotmart é um número (o product.id), não o ucode.',
    )
  }
  const ofertaHash = entrada.ofertaHash?.trim() ?? ''
  if (ofertaHash.length > 100) {
    throw new ErroDeVenda('O código da oferta é longo demais.')
  }
  const prazo = entrada.prazoEmDias ?? null
  if (
    prazo !== null &&
    (!Number.isInteger(prazo) || prazo < 1 || prazo > 36500)
  ) {
    throw new ErroDeVenda(
      'O prazo de acesso é um número de dias, de 1 em diante.',
    )
  }
  const [achada] = await db
    .select({ id: turma.id })
    .from(turma)
    .where(eq(turma.id, entrada.turmaId))
  if (!achada) throw new ErroDeVenda('Turma não encontrada.')

  await db
    .insert(ligacaoDeVenda)
    .values({
      id: novoId(),
      gateway,
      produtoId,
      ofertaHash,
      turmaId: entrada.turmaId,
      prazoEmDias: prazo,
    })
    .onConflictDoUpdate({
      target: [
        ligacaoDeVenda.gateway,
        ligacaoDeVenda.produtoId,
        ligacaoDeVenda.ofertaHash,
        ligacaoDeVenda.turmaId,
      ],
      set: { prazoEmDias: prazo },
    })
  return {
    aplicadas: await processarVendasSemTurma(
      banco,
      agora,
      produtoId,
      opcoes,
      gateway,
    ),
  }
}

// Troca a turma e o prazo de uma ligação, sem remover. O índice único (gateway, produto, oferta,
// turma) manda: se a troca bater numa ligação que já existe, não grava. Matrículas já criadas
// não mudam (só as vendas que chegarem depois).
export async function atualizarLigacao(
  banco: Banco,
  id: string,
  entrada: { turmaId: string; prazoEmDias?: number | null },
): Promise<void> {
  const db = comoLibsql(banco)
  const prazo = entrada.prazoEmDias ?? null
  if (
    prazo !== null &&
    (!Number.isInteger(prazo) || prazo < 1 || prazo > 36500)
  ) {
    throw new ErroDeVenda(
      'O prazo de acesso é um número de dias, de 1 em diante.',
    )
  }
  const [atual] = await db
    .select()
    .from(ligacaoDeVenda)
    .where(eq(ligacaoDeVenda.id, id))
  if (!atual) throw new ErroDeVenda('Ligação não encontrada.')
  const [achada] = await db
    .select({ id: turma.id })
    .from(turma)
    .where(eq(turma.id, entrada.turmaId))
  if (!achada) throw new ErroDeVenda('Turma não encontrada.')
  const [repetida] = await db
    .select({ id: ligacaoDeVenda.id })
    .from(ligacaoDeVenda)
    .where(
      and(
        eq(ligacaoDeVenda.gateway, atual.gateway),
        eq(ligacaoDeVenda.produtoId, atual.produtoId),
        eq(ligacaoDeVenda.ofertaHash, atual.ofertaHash),
        eq(ligacaoDeVenda.turmaId, entrada.turmaId),
        ne(ligacaoDeVenda.id, id),
      ),
    )
  if (repetida) {
    throw new ErroDeVenda(
      'Já existe uma ligação deste produto e oferta com essa turma. Edite aquela ou remova uma das duas.',
    )
  }
  await db
    .update(ligacaoDeVenda)
    .set({ turmaId: entrada.turmaId, prazoEmDias: prazo })
    .where(eq(ligacaoDeVenda.id, id))
}

export async function removerLigacao(banco: Banco, id: string): Promise<void> {
  await comoLibsql(banco)
    .delete(ligacaoDeVenda)
    .where(eq(ligacaoDeVenda.id, id))
}

export async function listarLigacoes(
  banco: Banco,
  gateway: Gateway = GATEWAY_PADRAO,
) {
  const db = comoLibsql(banco)
  return db
    .select({
      id: ligacaoDeVenda.id,
      produtoId: ligacaoDeVenda.produtoId,
      ofertaHash: ligacaoDeVenda.ofertaHash,
      turmaId: turma.id,
      turmaNome: turma.nome,
      cursoId: curso.id,
      cursoNome: curso.nome,
      prazoEmDias: ligacaoDeVenda.prazoEmDias,
      prazoDaTurma: turma.prazoEmDias,
    })
    .from(ligacaoDeVenda)
    .innerJoin(turma, eq(turma.id, ligacaoDeVenda.turmaId))
    .innerJoin(curso, eq(curso.id, turma.cursoId))
    .where(eq(ligacaoDeVenda.gateway, gateway))
    .orderBy(
      asc(ligacaoDeVenda.produtoId),
      asc(ligacaoDeVenda.ofertaHash),
      asc(ligacaoDeVenda.criadoEm),
    )
}

// Produtos (e ofertas) que já apareceram em avisos de venda, para o Proprietário ligar sem digitar.
export async function produtosVistos(
  banco: Banco,
  gateway: Gateway = GATEWAY_PADRAO,
) {
  const db = comoLibsql(banco)
  const linhas = await db
    .select({
      produtoId: avisoDeVenda.produtoId,
      produtoNome: sql<string | null>`max(${avisoDeVenda.produtoNome})`,
      ofertaHash: avisoDeVenda.ofertaHash,
      semTurma: sql<number>`sum(case when ${avisoDeVenda.situacao} = 'sem_turma' then 1 else 0 end)`,
    })
    .from(avisoDeVenda)
    .where(
      and(eq(avisoDeVenda.gateway, gateway), eq(avisoDeVenda.tipo, 'sale')),
    )
    .groupBy(avisoDeVenda.produtoId, avisoDeVenda.ofertaHash)
    .orderBy(asc(avisoDeVenda.produtoId))
  return linhas.flatMap((l) =>
    l.produtoId ? [{ ...l, produtoId: l.produtoId }] : [],
  )
}

// ---------- Processar o aviso ----------

export interface AvisoComErro {
  id: string
  gatilho: string
  vendaId: string | null
  motivo: string
}

export interface OpcoesDeProcessamento {
  // PONTO DE EXTENSÃO da fatia #45: o e-mail de curso(s) liberado(s) sai por aqui, uma vez por venda.
  aoLiberarCursos?: (eventos: EventoDeLiberacao[]) => Promise<void>
  /** Alerta o técnico (história 122): chamado UMA vez por aviso que fica com erro. */
  aoComErro?: (aviso: AvisoComErro) => Promise<void>
}

export interface ResultadoDoProcessamento {
  situacao: SituacaoDoAviso
  motivo: string | null
}

const ROTULO_DO_RESULTADO: Record<ResultadoDaVenda, [string, string]> = {
  criada: ['matrícula criada', 'matrículas criadas'],
  reativada: ['matrícula reativada', 'matrículas reativadas'],
  estendida: ['matrícula estendida', 'matrículas estendidas'],
  repetida: ['venda já aplicada', 'vendas já aplicadas'],
}

async function marcar(
  db: LibSQLDatabase<typeof schema>,
  agora: Relogio,
  id: string,
  resultado: ResultadoDoProcessamento,
  turmaIds: string[] | null = null,
) {
  await db
    .update(avisoDeVenda)
    .set({
      situacao: resultado.situacao,
      motivo: resultado.motivo,
      turmaIds: turmaIds ? JSON.stringify(turmaIds) : null,
      processadoEm: agora(),
    })
    .where(eq(avisoDeVenda.id, id))
  return resultado
}

const GATILHOS_DE_ESTORNO: Record<Gateway, string[]> = {
  voomp: ['saleRefunded', 'saleChargedback'],
  hotmart: ['PURCHASE_REFUNDED', 'PURCHASE_CHARGEBACK'],
}

// Há estorno gravado para a venda que vale mais que o aviso de `criadoEm`? Na Hotmart vale o estado
// de `creation_date` mais recente por transação: estorno mais antigo que a aprovação não a anula,
// estorno igual ou mais novo (ou sem data) anula. Sem `criadoEm` (Voomp), qualquer estorno vale.
export async function houveEstorno(
  db: LibSQLDatabase<typeof schema>,
  vendaId: string,
  gateway: Gateway = GATEWAY_PADRAO,
  criadoEm: number | null = null,
): Promise<boolean> {
  const estornos = await db
    .select({ corpo: avisoDeVenda.corpo })
    .from(avisoDeVenda)
    .where(
      and(
        eq(avisoDeVenda.gateway, gateway),
        eq(avisoDeVenda.vendaId, vendaId),
        eq(avisoDeVenda.tipo, 'sale'),
        inArray(avisoDeVenda.gatilho, GATILHOS_DE_ESTORNO[gateway]),
      ),
    )
  if (criadoEm === null) return estornos.length > 0
  return estornos.some((e) => {
    const dele = lerAviso(gateway, e.corpo).criadoEm
    return dele === null || dele >= criadoEm
  })
}

// Há aprovação gravada para a venda com `creation_date` mais nova que a do estorno? Então o estorno
// é velho e não tira o acesso.
async function houvePagamentoMaisNovo(
  db: LibSQLDatabase<typeof schema>,
  vendaId: string,
  gateway: Gateway,
  criadoEm: number | null,
): Promise<boolean> {
  if (criadoEm === null) return false
  const pagos = await db
    .select({ corpo: avisoDeVenda.corpo })
    .from(avisoDeVenda)
    .where(
      and(
        eq(avisoDeVenda.gateway, gateway),
        eq(avisoDeVenda.vendaId, vendaId),
        eq(avisoDeVenda.gatilho, 'PURCHASE_APPROVED'),
      ),
    )
  return pagos.some((p) => {
    const dele = lerAviso(gateway, p.corpo)
    return dele.efeito === 'pago' && (dele.criadoEm ?? -1) > criadoEm
  })
}

// Processa um aviso gravado. Falha inesperada (banco fora do ar) deixa o aviso "com erro" e sobe,
// para a fila tentar de novo; o aviso que não dá para aplicar nunca (sem e-mail, por exemplo)
// também fica "com erro", mas sem subir.
export async function processarAviso(
  banco: Banco,
  agora: Relogio,
  avisoId: string,
  opcoes: OpcoesDeProcessamento = {},
): Promise<ResultadoDoProcessamento> {
  const db = comoLibsql(banco)
  const [aviso] = await db
    .select()
    .from(avisoDeVenda)
    .where(eq(avisoDeVenda.id, avisoId))
  if (!aviso) throw new ErroDeVenda('Aviso não encontrado.')
  try {
    const resultado = await aplicarAviso(db, banco, agora, aviso, opcoes)
    if (resultado.situacao === 'com_erro') {
      await alertarUmaVez(db, agora, aviso, resultado.motivo ?? '', opcoes)
    }
    return resultado
  } catch (erro) {
    const motivo = erro instanceof Error ? erro.message : String(erro)
    await marcar(db, agora, aviso.id, { situacao: 'com_erro', motivo })
    await alertarUmaVez(db, agora, aviso, motivo, opcoes)
    throw erro
  }
}

// O aviso que fica com erro avisa o técnico uma vez só: a marca `alerta-voomp:<id>` é reservada antes
// (a primeira a gravar leva), então reprocessar o mesmo aviso, ou a fila tentar de novo, não repete.
async function alertarUmaVez(
  db: LibSQLDatabase<typeof schema>,
  agora: Relogio,
  aviso: typeof avisoDeVenda.$inferSelect,
  motivo: string,
  opcoes: OpcoesDeProcessamento,
): Promise<void> {
  if (!opcoes.aoComErro) return
  const reservado = await db
    .insert(estadoDeAviso)
    .values({
      chave: `alerta-voomp:${aviso.id}`,
      numero: 1,
      atualizadoEm: agora(),
    })
    .onConflictDoNothing()
    .returning({ chave: estadoDeAviso.chave })
  if (reservado.length === 0) return
  try {
    await opcoes.aoComErro({
      id: aviso.id,
      gatilho: aviso.gatilho,
      vendaId: aviso.vendaId,
      motivo,
    })
  } catch (erro) {
    // O alerta é consequência: se falhar, vai ao log e o processamento segue.
    console.error(`[vendas] não consegui alertar o aviso ${aviso.id}`, erro)
  }
}

async function aplicarAviso(
  db: LibSQLDatabase<typeof schema>,
  banco: Banco,
  agora: Relogio,
  aviso: typeof avisoDeVenda.$inferSelect,
  opcoes: OpcoesDeProcessamento,
): Promise<ResultadoDoProcessamento> {
  let interpretado: AvisoLido
  try {
    interpretado = lerAviso(aviso.gateway, aviso.corpo)
  } catch (erro) {
    if (!(erro instanceof AvisoInvalido)) throw erro
    return marcar(db, agora, aviso.id, {
      situacao: 'com_erro',
      motivo: erro.message,
    })
  }
  const efeito = interpretado.efeito
  if (efeito === 'so-gravar') {
    return marcar(db, agora, aviso.id, {
      situacao: 'ignorada',
      motivo: interpretado.motivoSoGravar,
    })
  }
  if (!interpretado.vendaId) {
    return marcar(db, agora, aviso.id, {
      situacao: 'com_erro',
      motivo: 'O aviso não traz o id da venda.',
    })
  }

  if (efeito === 'estorno') {
    if (
      aviso.gateway === 'hotmart' &&
      (await houvePagamentoMaisNovo(
        db,
        interpretado.vendaId,
        aviso.gateway,
        interpretado.criadoEm,
      ))
    ) {
      return marcar(db, agora, aviso.id, {
        situacao: 'ignorada',
        motivo:
          'Aprovação mais recente da mesma transação: o estorno é antigo.',
      })
    }
    const estorno = await aplicarEstorno(banco, {
      vendaId: vendaIdDeOrigem(aviso.gateway, interpretado.vendaId),
    })
    const afetadas = [...estorno.inativadas, ...estorno.mantidas]
    if (afetadas.length === 0) {
      return marcar(db, agora, aviso.id, {
        situacao: 'ignorada',
        motivo: 'Nenhuma matrícula era sustentada por esta venda.',
      })
    }
    const turmas = await emLotes(afetadas, (ids) =>
      db
        .select({ turmaId: matricula.turmaId })
        .from(matricula)
        .where(inArray(matricula.id, ids)),
    )
    const partes = []
    if (estorno.inativadas.length > 0) {
      partes.push(`${estorno.inativadas.length} matrícula(s) inativada(s)`)
    }
    if (estorno.mantidas.length > 0) {
      partes.push(
        `${estorno.mantidas.length} mantida(s): outra origem ainda a sustenta, a equipe decide`,
      )
    }
    return marcar(
      db,
      agora,
      aviso.id,
      { situacao: 'aplicada', motivo: partes.join('; ') },
      turmas.map((t) => t.turmaId),
    )
  }

  // salePaid
  if (!interpretado.email) {
    return marcar(db, agora, aviso.id, {
      situacao: 'com_erro',
      motivo: 'O aviso não traz o e-mail do aluno.',
    })
  }
  if (!interpretado.produtoId) {
    return marcar(db, agora, aviso.id, {
      situacao: 'com_erro',
      motivo: 'O aviso não traz o produto.',
    })
  }
  // Estorno que chegou antes: a venda já não vale.
  if (
    await houveEstorno(
      db,
      interpretado.vendaId,
      aviso.gateway,
      interpretado.criadoEm,
    )
  ) {
    return marcar(db, agora, aviso.id, {
      situacao: 'ignorada',
      motivo: 'A venda foi estornada.',
    })
  }
  const ligadas = await turmasDaVenda(
    banco,
    interpretado.produtoId,
    interpretado.ofertaHash,
    aviso.gateway,
  )
  if (ligadas.length === 0) {
    return marcar(db, agora, aviso.id, {
      situacao: 'sem_turma',
      motivo: 'O produto ainda não está ligado a nenhuma turma.',
    })
  }
  const resumo = await aplicarVendaPaga(banco, agora, {
    vendaId: vendaIdDeOrigem(aviso.gateway, interpretado.vendaId),
    email: interpretado.email,
    nome: interpretado.nome,
    turmas: ligadas,
    aoLiberarCursos: opcoes.aoLiberarCursos,
  })
  // Estorno que chegou durante a aplicação (o aviso dele não achou origem e ficou "ignorada"):
  // agora a origem existe, então ele é aplicado na mesma etapa.
  if (
    await houveEstorno(
      db,
      interpretado.vendaId,
      aviso.gateway,
      interpretado.criadoEm,
    )
  ) {
    const estorno = await aplicarEstorno(banco, {
      vendaId: vendaIdDeOrigem(aviso.gateway, interpretado.vendaId),
    })
    return marcar(
      db,
      agora,
      aviso.id,
      {
        situacao: 'ignorada',
        motivo: `A venda foi estornada durante a aplicação: ${estorno.inativadas.length} matrícula(s) inativada(s), ${estorno.mantidas.length} mantida(s).`,
      },
      resumo.resultados.map((r) => r.turmaId),
    )
  }
  const contagem = new Map<ResultadoDaVenda, number>()
  for (const r of resumo.resultados) {
    contagem.set(r.resultado, (contagem.get(r.resultado) ?? 0) + 1)
  }
  const motivo = [...contagem]
    .map(([r, n]) => `${n} ${ROTULO_DO_RESULTADO[r][n === 1 ? 0 : 1]}`)
    .join('; ')
  return marcar(
    db,
    agora,
    aviso.id,
    { situacao: 'aplicada', motivo },
    resumo.resultados.map((r) => r.turmaId),
  )
}

// Quando o produto é ligado, as vendas pagas que esperavam viram matrícula na hora (um estorno
// que chegou nesse meio-tempo é respeitado dentro de `processarAviso`). Devolve quantas aplicou.
export async function processarVendasSemTurma(
  banco: Banco,
  agora: Relogio,
  produtoId: string,
  opcoes: OpcoesDeProcessamento = {},
  gateway: Gateway = GATEWAY_PADRAO,
): Promise<number> {
  const db = comoLibsql(banco)
  const esperando = await db
    .select({ id: avisoDeVenda.id })
    .from(avisoDeVenda)
    .where(
      and(
        eq(avisoDeVenda.gateway, gateway),
        eq(avisoDeVenda.produtoId, produtoId),
        eq(avisoDeVenda.situacao, 'sem_turma'),
      ),
    )
    .orderBy(asc(avisoDeVenda.recebidoEm))
  let aplicadas = 0
  for (const { id } of esperando) {
    try {
      const r = await processarAviso(banco, agora, id, opcoes)
      if (r.situacao === 'aplicada') aplicadas++
    } catch (erro) {
      console.error('[vendas] não consegui processar a venda', id, erro)
    }
  }
  return aplicadas
}

// ---------- Tela "Vendas da Voomp" ----------

export interface LinhaDeVenda {
  id: string
  gateway: Gateway
  recebidoEm: Date
  gatilho: string
  alunoNome: string | null
  alunoEmail: string | null
  produtoId: string | null
  produtoNome: string | null
  ofertaHash: string | null
  turmas: string[]
  situacao: SituacaoDoAviso
  motivo: string | null
  repeticoes: number
}

export async function listarAvisos(
  banco: Banco,
  filtro: {
    situacao?: SituacaoDoAviso
    gateway?: Gateway
    pagina?: number
  } = {},
): Promise<Pagina<LinhaDeVenda>> {
  const db = comoLibsql(banco)
  const pagina = filtro.pagina ?? 1
  const onde = and(
    filtro.situacao ? eq(avisoDeVenda.situacao, filtro.situacao) : undefined,
    filtro.gateway ? eq(avisoDeVenda.gateway, filtro.gateway) : undefined,
  )
  const paginaDeAvisos = () =>
    db
      .select()
      .from(avisoDeVenda)
      .where(onde)
      .orderBy(desc(avisoDeVenda.recebidoEm), desc(avisoDeVenda.id))
      .limit(POR_PAGINA)
      .offset(deslocamento(pagina))
  // As turmas citadas pelos avisos DESTA página (o `turma_ids` é um JSON): lidas por subconsulta sobre a
  // própria página, para irem no mesmo `batch` em vez de esperar a página chegar.
  const turmasDaPagina = db
    .select({ turmaIds: avisoDeVenda.turmaIds })
    .from(avisoDeVenda)
    .where(onde)
    .orderBy(desc(avisoDeVenda.recebidoEm), desc(avisoDeVenda.id))
    .limit(POR_PAGINA)
    .offset(deslocamento(pagina))
    .as('pagina_de_avisos')
  const [[{ total }], linhas, turmas] = await db.batch([
    db.select({ total: count() }).from(avisoDeVenda).where(onde),
    paginaDeAvisos(),
    db
      .select({
        id: turma.id,
        nome: turma.nome,
        // Apelido: no `batch` do D1 duas colunas de mesmo nome (`nome`) se fundem (veja
        // `conferirColunas` em src/test/banco.ts).
        cursoNome: sql<string>`${curso.nome}`.as('curso_nome'),
      })
      .from(turma)
      .innerJoin(curso, eq(curso.id, turma.cursoId))
      .where(
        inArray(
          turma.id,
          sql`(select j.value from ${turmasDaPagina}, json_each(${turmasDaPagina.turmaIds}) as j)`,
        ),
      ),
  ])
  const doAviso = new Map<string, string[]>()
  for (const l of linhas) {
    doAviso.set(l.id, l.turmaIds ? (JSON.parse(l.turmaIds) as string[]) : [])
  }
  const nomes = new Map<string, string>()
  for (const t of turmas) nomes.set(t.id, `${t.cursoNome} · ${t.nome}`)
  return montarPagina(
    linhas.map((l) => ({
      id: l.id,
      gateway: l.gateway,
      recebidoEm: l.recebidoEm,
      gatilho: l.gatilho,
      alunoNome: l.nome,
      alunoEmail: l.email,
      produtoId: l.produtoId,
      produtoNome: l.produtoNome,
      ofertaHash: l.ofertaHash,
      turmas: (doAviso.get(l.id) ?? []).map((t) => nomes.get(t) ?? t),
      situacao: l.situacao,
      motivo: l.motivo,
      repeticoes: l.repeticoes,
    })),
    total,
    pagina,
  )
}
