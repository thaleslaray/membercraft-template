// Pedido do MEC (#56). Nasce quando a área emite o certificado próprio de um curso marcado como
// "gera Pedido do MEC" (a Formação). A equipe libera o certificado na Voomp à mão e registra aqui:
//
//   Na fila --liberar--> Liberado
//   Na fila --problema (motivo + Atendimento com a aluna)--> Problema --tentar de novo--> Na fila
//   Problema --liberar--> Liberado
//
// Destaque: o pedido que espera há mais de 5 dias úteis (`dias-uteis.ts`) é destacado na fila, no
// resumo diário e no sininho da equipe (cron). A contagem parte de `naFilaDesde`, que recomeça no
// "tentar de novo". Como liberar na Voomp segue em aberto (#29), nada aqui fala com a Voomp.
//
// Pontos de extensão (`GanchosDoPedidoDoMec`, passados por quem chama): `aoLiberar` (e-mail e
// sininho da aluna) e `abrirAtendimento` (a conversa do "Problema"). Todas as ações da equipe vão
// para o registro de ações, no mesmo `db.batch` da mudança.

import { and, asc, count, desc, eq, inArray, isNull, sql } from 'drizzle-orm'
import { curso, pedidoDoMec, user } from '#/db/schema'
import { type EntradaDaEquipe, LIMITE_DO_TEXTO } from '#/regras/atendimento'
import type { CertificadoEmitido } from '#/regras/certificados'
import { diasUteisDesde } from '#/regras/dias-uteis'
import { emPedacos } from '#/regras/lotes'
import { POR_PAGINA } from '#/regras/paginacao'
import { exigirPermissao, type Perfil } from '#/regras/permissoes'
import { prepararRegistro } from '#/regras/registro-de-acoes'
import { type Banco, comoLibsql, type Relogio } from '#/regras/tipos'

/** Passados mais de 5 dias úteis na fila, o pedido é destacado. */
export const LIMITE_DE_DIAS_UTEIS = 5
export const LIMITE_DO_MOTIVO = 500
export const LIMITE_DO_LINK = 500
export { POR_PAGINA }

export type EstadoDoPedido = 'na_fila' | 'liberado' | 'problema'
export const ESTADOS: readonly EstadoDoPedido[] = [
  'na_fila',
  'problema',
  'liberado',
]

export class ErroDePedidoDoMec extends Error {
  constructor(mensagem: string) {
    super(mensagem)
    this.name = 'ErroDePedidoDoMec'
  }
}

export interface PedidoLiberado {
  pedidoId: string
  userId: string
  email: string
  nome: string
  cursoNome: string
  linkDaVoomp: string
}

export interface GanchosDoPedidoDoMec {
  /** Roda uma vez, depois de o pedido ser marcado como Liberado (e-mail e sininho da aluna). */
  aoLiberar?: (pedido: PedidoLiberado) => Promise<void>
}

// ---------- Criação (gancho da emissão do certificado) ----------

/**
 * Chamado quando um certificado é emitido: se o curso gera Pedido do MEC, abre o pedido Na fila.
 * Idempotente (um pedido por certificado). Devolve o id do pedido novo, ou null se o curso não gera
 * pedido ou ele já existia.
 */
export async function criarPedidoDoMec(
  banco: Banco,
  agora: Relogio,
  emitido: Pick<CertificadoEmitido, 'id' | 'userId' | 'cursoId'>,
): Promise<string | null> {
  const db = comoLibsql(banco)
  const [dele] = await db
    .select({ gera: curso.geraPedidoDoMec })
    .from(curso)
    .where(eq(curso.id, emitido.cursoId))
  if (!dele?.gera) return null
  const id = crypto.randomUUID()
  const quando = agora()
  const linhas = await db
    .insert(pedidoDoMec)
    .values({
      id,
      certificadoId: emitido.id,
      userId: emitido.userId,
      cursoId: emitido.cursoId,
      estado: 'na_fila',
      criadoEm: quando,
      naFilaDesde: quando,
    })
    .onConflictDoNothing({ target: pedidoDoMec.certificadoId })
    .returning({ id: pedidoDoMec.id })
  return linhas.length > 0 ? id : null
}

// ---------- Contagem e destaque ----------

/** Quantos pedidos esperam a equipe liberar (contador do menu, `FILAS` e sininho). */
export async function contarPedidosNaFila(banco: Banco): Promise<number> {
  const [linha] = await comoLibsql(banco)
    .select({ total: count() })
    .from(pedidoDoMec)
    .where(eq(pedidoDoMec.estado, 'na_fila'))
  return linha?.total ?? 0
}

export const passouDoPrazo = (naFilaDesde: Date, agora: Date) =>
  diasUteisDesde(naFilaDesde, agora) > LIMITE_DE_DIAS_UTEIS

async function naFilaComData(banco: Banco) {
  return comoLibsql(banco)
    .select({
      id: pedidoDoMec.id,
      naFilaDesde: pedidoDoMec.naFilaDesde,
      destacadoEm: pedidoDoMec.destacadoEm,
    })
    .from(pedidoDoMec)
    .where(eq(pedidoDoMec.estado, 'na_fila'))
}

/** Quantos pedidos Na fila passaram de 5 dias úteis. */
export async function contarPedidosAtrasados(
  banco: Banco,
  agora: Relogio,
): Promise<number> {
  const hoje = agora()
  return (await naFilaComData(banco)).filter((p) =>
    passouDoPrazo(p.naFilaDesde, hoje),
  ).length
}

/** Texto do resumo diário: "2 com mais de 5 dias úteis" (ou null sem atrasados). */
export async function destaqueDoResumo(
  banco: Banco,
  agora: Relogio,
): Promise<string | null> {
  const atrasados = await contarPedidosAtrasados(banco, agora)
  return atrasados > 0
    ? `${atrasados} com mais de ${LIMITE_DE_DIAS_UTEIS} dias úteis`
    : null
}

/**
 * Rotina do cron: marca os pedidos Na fila que acabaram de passar de 5 dias úteis e devolve quantos
 * são. Cada espera é destacada uma vez (o "tentar de novo" libera um novo destaque). `avisar` leva
 * o aviso à equipe (sininho).
 */
export async function destacarPedidosAtrasados(
  banco: Banco,
  agora: Relogio,
  avisar: (novos: number) => Promise<void>,
): Promise<number> {
  const hoje = agora()
  const novos = (await naFilaComData(banco)).filter(
    (p) => p.destacadoEm === null && passouDoPrazo(p.naFilaDesde, hoje),
  )
  if (novos.length === 0) return 0
  const db = comoLibsql(banco)
  for (const ids of emPedacos(novos.map((p) => p.id))) {
    await db
      .update(pedidoDoMec)
      .set({ destacadoEm: hoje })
      .where(inArray(pedidoDoMec.id, ids))
  }
  await avisar(novos.length)
  return novos.length
}

// ---------- Leitura (painel) ----------

export interface PedidoDaFila {
  id: string
  estado: EstadoDoPedido
  alunoId: string
  alunoNome: string
  alunoEmail: string
  cursoNome: string
  codigoDoCertificado: string
  criadoEm: Date
  naFilaDesde: Date
  /** Dias úteis esperando na fila (só faz sentido em Na fila). */
  diasUteis: number
  /** Na fila há mais de 5 dias úteis: destaque. */
  atrasado: boolean
  liberadoEm: Date | null
  linkDaVoomp: string | null
  problemaMotivo: string | null
  problemaEm: Date | null
  conversaId: string | null
}

export interface ListaDePedidos {
  itens: PedidoDaFila[]
  total: number
  pagina: number
  porPagina: number
  /** Quantos há em cada estado, para as abas. */
  contagens: Record<EstadoDoPedido, number>
  atrasados: number
}

const paginaValida = (pagina: number) =>
  Number.isFinite(pagina) && pagina >= 1 ? Math.floor(pagina) : 1

/** A fila do painel, por estado: Na fila (mais antigos primeiro), Problema e Liberado (mais recentes primeiro). */
export async function listarPedidos(
  banco: Banco,
  agora: Relogio,
  filtro: { estado: EstadoDoPedido; pagina?: number },
): Promise<ListaDePedidos> {
  const db = comoLibsql(banco)
  const hoje = agora()
  const pagina = paginaValida(filtro.pagina ?? 1)
  const ordem =
    filtro.estado === 'na_fila'
      ? [asc(pedidoDoMec.naFilaDesde), asc(pedidoDoMec.id)]
      : filtro.estado === 'problema'
        ? [desc(pedidoDoMec.problemaEm), asc(pedidoDoMec.id)]
        : [desc(pedidoDoMec.liberadoEm), asc(pedidoDoMec.id)]
  // Contagens, página e pedidos na fila (para contar os atrasados) saem numa ida só.
  const [porEstado, linhas, naFila] = await db.batch([
    db
      .select({ estado: pedidoDoMec.estado, total: count() })
      .from(pedidoDoMec)
      .groupBy(pedidoDoMec.estado),
    db
      .select({
        p: pedidoDoMec,
        alunoNome: user.name,
        alunoEmail: user.email,
        cursoNome: curso.nome,
        codigo: sql<string>`(select codigo from certificado where certificado.id = ${pedidoDoMec.certificadoId})`,
      })
      .from(pedidoDoMec)
      .innerJoin(user, eq(user.id, pedidoDoMec.userId))
      .innerJoin(curso, eq(curso.id, pedidoDoMec.cursoId))
      .where(eq(pedidoDoMec.estado, filtro.estado))
      .orderBy(...ordem)
      .limit(POR_PAGINA)
      .offset((pagina - 1) * POR_PAGINA),
    db
      .select({
        id: pedidoDoMec.id,
        naFilaDesde: pedidoDoMec.naFilaDesde,
        destacadoEm: pedidoDoMec.destacadoEm,
      })
      .from(pedidoDoMec)
      .where(eq(pedidoDoMec.estado, 'na_fila')),
  ])
  const contagens: Record<EstadoDoPedido, number> = {
    na_fila: 0,
    problema: 0,
    liberado: 0,
  }
  for (const l of porEstado) contagens[l.estado] = l.total
  return {
    total: contagens[filtro.estado],
    pagina,
    porPagina: POR_PAGINA,
    contagens,
    atrasados: naFila.filter((p) => passouDoPrazo(p.naFilaDesde, hoje)).length,
    itens: linhas.map(({ p, alunoNome, alunoEmail, cursoNome, codigo }) => {
      const diasUteis =
        p.estado === 'na_fila' ? diasUteisDesde(p.naFilaDesde, hoje) : 0
      return {
        id: p.id,
        estado: p.estado,
        alunoId: p.userId,
        alunoNome,
        alunoEmail,
        cursoNome,
        codigoDoCertificado: codigo,
        criadoEm: p.criadoEm,
        naFilaDesde: p.naFilaDesde,
        diasUteis,
        atrasado: p.estado === 'na_fila' && diasUteis > LIMITE_DE_DIAS_UTEIS,
        liberadoEm: p.liberadoEm,
        linkDaVoomp: p.linkDaVoomp,
        problemaMotivo: p.problemaMotivo,
        problemaEm: p.problemaEm,
        conversaId: p.conversaId,
      }
    }),
  }
}

/** O que a aluna vê no cartão do certificado: "em liberação" ou "liberado em dd/mm" com o link. */
export interface PedidoDaAluna {
  situacao: 'em-liberacao' | 'liberado'
  liberadoEm: Date | null
  link: string | null
}

export async function pedidosDaAluna(
  banco: Banco,
  userId: string,
): Promise<Map<string, PedidoDaAluna>> {
  const linhas = await comoLibsql(banco)
    .select({
      certificadoId: pedidoDoMec.certificadoId,
      estado: pedidoDoMec.estado,
      liberadoEm: pedidoDoMec.liberadoEm,
      link: pedidoDoMec.linkDaVoomp,
    })
    .from(pedidoDoMec)
    .where(eq(pedidoDoMec.userId, userId))
  return new Map(
    linhas.map((l) => [
      l.certificadoId,
      l.estado === 'liberado'
        ? { situacao: 'liberado', liberadoEm: l.liberadoEm, link: l.link }
        : { situacao: 'em-liberacao', liberadoEm: null, link: null },
    ]),
  )
}

// ---------- Ações da equipe ----------

interface Autoria {
  perfil: Perfil
  equipeId: string
  pedidoId: string
}

async function pedidoComAluna(banco: Banco, pedidoId: string) {
  const [linha] = await comoLibsql(banco)
    .select({
      p: pedidoDoMec,
      email: user.email,
      nome: user.name,
      cursoNome: curso.nome,
      codigo: sql<string>`(select codigo from certificado where certificado.id = ${pedidoDoMec.certificadoId})`,
    })
    .from(pedidoDoMec)
    .innerJoin(user, eq(user.id, pedidoDoMec.userId))
    .innerJoin(curso, eq(curso.id, pedidoDoMec.cursoId))
    .where(eq(pedidoDoMec.id, pedidoId))
  if (!linha) throw new ErroDePedidoDoMec('Pedido do MEC não encontrado.')
  return linha
}

/** Só aceita endereço http(s): o link vira botão na tela da aluna. */
export function conferirLink(texto: string): string {
  const link = texto.trim()
  if (!link) throw new ErroDePedidoDoMec('Informe o link da Voomp.')
  if (link.length > LIMITE_DO_LINK) {
    throw new ErroDePedidoDoMec(`O link passa de ${LIMITE_DO_LINK} caracteres.`)
  }
  let url: URL
  try {
    url = new URL(link)
  } catch {
    throw new ErroDePedidoDoMec('O link não é um endereço válido.')
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new ErroDePedidoDoMec('O link precisa começar com https://.')
  }
  return url.toString()
}

/** A equipe liberou o certificado na Voomp: o pedido vira Liberado, com o link, e a aluna é avisada. */
export async function marcarLiberado(
  banco: Banco,
  agora: Relogio,
  entrada: Autoria & { link: string },
  ganchos: GanchosDoPedidoDoMec = {},
): Promise<void> {
  exigirPermissao(entrada.perfil, 'usar-estudio')
  const link = conferirLink(entrada.link)
  const atual = await pedidoComAluna(banco, entrada.pedidoId)
  if (atual.p.estado === 'liberado') {
    throw new ErroDePedidoDoMec('Esse pedido já está liberado.')
  }
  const db = comoLibsql(banco)
  await db.batch([
    db
      .update(pedidoDoMec)
      .set({ estado: 'liberado', liberadoEm: agora(), linkDaVoomp: link })
      .where(eq(pedidoDoMec.id, atual.p.id)),
    prepararRegistro(banco, agora, {
      autorId: entrada.equipeId,
      acao: 'pedido-do-mec-liberado',
      detalhe: { codigo: atual.codigo, curso: atual.cursoNome },
    }),
  ])
  await ganchos.aoLiberar?.({
    pedidoId: atual.p.id,
    userId: atual.p.userId,
    email: atual.email,
    nome: atual.nome,
    cursoNome: atual.cursoNome,
    linkDaVoomp: link,
  })
}

/**
 * Problema com o pedido: guarda o motivo e abre uma conversa do Atendimento com a aluna (`abrirAtendimento`
 * devolve o id da conversa). Só vale para pedido Na fila. Se a conversa não abrir, nada muda.
 */
export async function marcarProblema(
  banco: Banco,
  agora: Relogio,
  entrada: Autoria & { motivo: string },
  abrirAtendimento: (entrada: EntradaDaEquipe) => Promise<string>,
): Promise<string> {
  exigirPermissao(entrada.perfil, 'usar-estudio')
  const motivo = entrada.motivo.trim()
  if (motivo.length < 3) throw new ErroDePedidoDoMec('Informe o motivo.')
  if (motivo.length > LIMITE_DO_MOTIVO) {
    throw new ErroDePedidoDoMec(
      `O motivo passa de ${LIMITE_DO_MOTIVO} caracteres.`,
    )
  }
  const atual = await pedidoComAluna(banco, entrada.pedidoId)
  if (atual.p.estado !== 'na_fila') {
    throw new ErroDePedidoDoMec('Só um pedido Na fila pode ter problema.')
  }
  const texto = `Olá! Sobre o seu certificado do MEC de ${atual.cursoNome}, precisamos da sua ajuda: ${motivo}\n\nPode responder por aqui.`
  if (texto.length > LIMITE_DO_TEXTO) {
    throw new ErroDePedidoDoMec('O motivo é longo demais.')
  }
  const conversaId = await abrirAtendimento({
    equipeId: entrada.equipeId,
    userId: atual.p.userId,
    cursoId: atual.p.cursoId,
    assunto: 'Seu certificado do MEC',
    texto,
  })
  const db = comoLibsql(banco)
  await db.batch([
    db
      .update(pedidoDoMec)
      .set({
        estado: 'problema',
        problemaMotivo: motivo,
        problemaEm: agora(),
        conversaId,
      })
      .where(eq(pedidoDoMec.id, atual.p.id)),
    prepararRegistro(banco, agora, {
      autorId: entrada.equipeId,
      acao: 'pedido-do-mec-problema',
      detalhe: { codigo: atual.codigo, curso: atual.cursoNome, motivo },
    }),
  ])
  return conversaId
}

/** "Tentar de novo": o pedido com problema volta para Na fila e a contagem dos dias úteis recomeça. */
export async function tentarDeNovo(
  banco: Banco,
  agora: Relogio,
  entrada: Autoria,
): Promise<void> {
  exigirPermissao(entrada.perfil, 'usar-estudio')
  const atual = await pedidoComAluna(banco, entrada.pedidoId)
  if (atual.p.estado !== 'problema') {
    throw new ErroDePedidoDoMec(
      'Só um pedido com problema pode tentar de novo.',
    )
  }
  const db = comoLibsql(banco)
  await db.batch([
    db
      .update(pedidoDoMec)
      .set({
        estado: 'na_fila',
        naFilaDesde: agora(),
        destacadoEm: null,
      })
      .where(
        and(eq(pedidoDoMec.id, atual.p.id), isNull(pedidoDoMec.liberadoEm)),
      ),
    prepararRegistro(banco, agora, {
      autorId: entrada.equipeId,
      acao: 'pedido-do-mec-nova-tentativa',
      detalhe: { codigo: atual.codigo, curso: atual.cursoNome },
    }),
  ])
}
