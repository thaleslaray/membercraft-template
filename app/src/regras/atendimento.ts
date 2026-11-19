// Atendimento: conversas entre aluno (ou Visitante, sem conta) e a equipe. Estados: Aberta (espera
// a equipe), Respondida (espera o aluno) e Resolvida (a equipe fechou); mensagem nova do aluno
// reabre. Limites: 5 conversas novas por hora por aluno e 5.000 caracteres por mensagem; anexos
// são imagens de até 10 MB (chaves no R2).
//
// Entradas: a área (`abrirConversa`, `continuarComoCliente`) e o e-mail ao suporte@/help@
// (`receberEmail`). A equipe responde com `responderComoEquipe`; quem avisa o aluno (e-mail e,
// depois, o sininho da #46) é a cola em `src/lib/atendimento-cola.ts`, pelo retorno da regra e
// pelo gancho `aoResponderPelaEquipe`.
//
// Para outras fatias: o Pedido do MEC com "Problema" (#56) abre a conversa com `abrirConversaPelaEquipe`.

import { and, count, desc, eq, gt, inArray, isNull, sql } from 'drizzle-orm'
import {
  conversaDeAtendimento,
  curso,
  emailDesligado,
  mensagemDeAtendimento,
  user,
} from '#/db/schema'
import { adicionarAviso, type GrupoDeAvisos } from '#/regras/agrupamento'
import type { DependenciasDoAgrupamento } from '#/regras/agrupamento-envio'
import {
  LIMITE_DE_ANEXOS,
  LIMITE_DE_CONVERSAS_POR_HORA,
  LIMITE_DO_ASSUNTO,
  LIMITE_DO_TEXTO,
} from '#/regras/atendimento-limites'
import { primeiroNome } from '#/regras/email-modelos'
import { emLotes } from '#/regras/lotes'
import { cursosDoAluno } from '#/regras/matricula'
import { type Banco, comoLibsql, type Relogio } from '#/regras/tipos'

export * from '#/regras/atendimento-limites'

export class ErroDeAtendimento extends Error {
  constructor(mensagem: string) {
    super(mensagem)
    this.name = 'ErroDeAtendimento'
  }
}

export const PREFIXO_DOS_ANEXOS = 'atendimento/anexos/'
/** Dono das imagens que chegam por e-mail (não há conta para atribuir). */
export const DONO_DO_EMAIL = 'email'
/** Chave do agrupamento de 15 minutos dos avisos à equipe. */
export const CHAVE_DO_AVISO = 'aviso-de-atendimento'
/** Tipo guardado em `email_desligado` quando alguém da equipe desliga o aviso. */
export const TIPO_DO_AVISO = 'aviso-de-atendimento'

export type EstadoDaConversa =
  (typeof conversaDeAtendimento.$inferSelect)['estado']
export type AutorDaMensagem =
  (typeof mensagemDeAtendimento.$inferSelect)['autor']
type Canal = 'area' | 'email'

// ---------- Texto, assunto e anexos ----------

const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

export function novoCodigo(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(6))
  return [...bytes].map((b) => ALFABETO[b % ALFABETO.length]).join('')
}

const TAG_DO_CODIGO = /\[Atendimento #([A-Z0-9]{6})\]/i

export function etiquetaDoCodigo(codigo: string): string {
  return `[Atendimento #${codigo}]`
}

/** O código da conversa que o assunto de um e-mail carrega, se tiver. */
export function extrairCodigo(assunto: string): string | null {
  return TAG_DO_CODIGO.exec(assunto)?.[1]?.toUpperCase() ?? null
}

/** Assunto sem "Re:", "Enc:", "Fwd:" repetidos e sem a etiqueta do código. */
export function normalizarAssunto(assunto: string): string {
  let atual = assunto.replace(TAG_DO_CODIGO, ' ')
  const prefixo = /^\s*(re|res|fw|fwd|enc|rv)\s*:\s*/i
  while (prefixo.test(atual)) atual = atual.replace(prefixo, '')
  return atual.replace(/\s+/g, ' ').trim()
}

/**
 * Tira do e-mail o que é citação da resposta anterior: do cabeçalho "Em ... escreveu:" (ou
 * "On ... wrote:") para baixo, ou das linhas que começam com ">" no fim.
 */
export function limparRespostaDeEmail(texto: string): string {
  const linhas = texto.replace(/\r\n?/g, '\n').split('\n')
  const corte = linhas.findIndex(
    (l, i) =>
      /^\s*(Em .+ escreveu:|On .+ wrote:|-{2,}\s*(Mensagem original|Original Message)\s*-{2,})\s*$/i.test(
        l,
      ) ||
      // Cabeçalho que o cliente quebrou em duas linhas.
      (/^\s*(Em|On)\s.+,\s*$/i.test(l) &&
        /(escreveu|wrote):\s*$/i.test(linhas[i + 1] ?? '')),
  )
  let fica = corte >= 0 ? linhas.slice(0, corte) : linhas
  while (fica.length && /^\s*(>.*)?$/.test(fica[fica.length - 1] ?? '')) {
    fica = fica.slice(0, -1)
  }
  return fica.join('\n').trim()
}

/** Garante a etiqueta do código no assunto do e-mail (o texto do assunto é editável pelo Proprietário). */
export function assuntoComCodigo(assunto: string, codigo: string): string {
  return extrairCodigo(assunto) === codigo
    ? assunto
    : `${assunto} ${etiquetaDoCodigo(codigo)}`
}

/** Respostas automáticas e listas não viram conversa: respondê-las criaria laço entre robôs. */
export function ehRespostaAutomatica(
  cabecalho: (nome: string) => string | null | undefined,
): boolean {
  const auto = cabecalho('auto-submitted')?.trim().toLowerCase()
  if (auto && auto !== 'no') return true
  const precedencia = cabecalho('precedence')?.trim().toLowerCase()
  if (
    precedencia &&
    ['bulk', 'junk', 'list', 'auto_reply'].includes(precedencia)
  )
    return true
  return Boolean(cabecalho('x-autoreply') || cabecalho('x-autorespond'))
}

/** Texto simples de um e-mail que só trouxe HTML. */
export function htmlParaTexto(html: string): string {
  return html
    .replace(/<(style|script)[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>|<\/(p|div|li|tr|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function nomeSeguro(nome: string): string {
  const base = nome.split(/[\\/]/).pop() ?? ''
  const limpo = base
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
    .slice(-80)
  return limpo || 'imagem'
}

/** Chave no R2 de um anexo: o dono (id da pessoa, ou "email") vai no caminho. */
export function chaveDoAnexo(dono: string, id: string, nome: string): string {
  return `${PREFIXO_DOS_ANEXOS}${dono}/${id}/${nomeSeguro(nome)}`
}

/** A chave existe, é de anexo e pertence a esse dono (ninguém anexa a imagem de outro). */
export function anexoDoDono(chave: string, dono: string): boolean {
  return (
    chave.startsWith(`${PREFIXO_DOS_ANEXOS}${dono}/`) &&
    !chave.includes('..') &&
    !chave.includes('//')
  )
}

export function donoDoAnexo(chave: string): string | null {
  if (!chave.startsWith(PREFIXO_DOS_ANEXOS) || chave.includes('..')) return null
  return chave.slice(PREFIXO_DOS_ANEXOS.length).split('/')[0] || null
}

function conferirMensagem(
  texto: string,
  anexos: string[],
  dono: string,
): string {
  const limpo = texto.trim()
  if (limpo.length > LIMITE_DO_TEXTO) {
    throw new ErroDeAtendimento(
      `A mensagem pode ter no máximo ${LIMITE_DO_TEXTO.toLocaleString('pt-BR')} caracteres.`,
    )
  }
  if (!limpo && anexos.length === 0) {
    throw new ErroDeAtendimento('Escreva a mensagem.')
  }
  if (anexos.length > LIMITE_DE_ANEXOS) {
    throw new ErroDeAtendimento(
      `Anexe no máximo ${LIMITE_DE_ANEXOS} imagens por mensagem.`,
    )
  }
  if (!anexos.every((a) => anexoDoDono(a, dono))) {
    throw new ErroDeAtendimento('Anexo inválido.')
  }
  return limpo
}

function conferirAssunto(assunto: string): string {
  const limpo = assunto.trim()
  if (!limpo) throw new ErroDeAtendimento('Escreva o assunto.')
  if (limpo.length > LIMITE_DO_ASSUNTO) {
    throw new ErroDeAtendimento(
      `O assunto pode ter no máximo ${LIMITE_DO_ASSUNTO} caracteres.`,
    )
  }
  return limpo
}

// ---------- Leitura ----------

type Conversa = typeof conversaDeAtendimento.$inferSelect

async function conversaVigente(
  db: Banco,
  conversaId: string,
): Promise<Conversa> {
  const [conversa] = await comoLibsql(db)
    .select()
    .from(conversaDeAtendimento)
    .where(
      and(
        eq(conversaDeAtendimento.id, conversaId),
        isNull(conversaDeAtendimento.excluidoEm),
      ),
    )
  if (!conversa) throw new ErroDeAtendimento('Conversa não encontrada.')
  return conversa
}

export interface Pessoa {
  id: string
  /** Quem usa o Estúdio vê e responde qualquer conversa. */
  equipe: boolean
}

export interface ItemDaLista {
  id: string
  codigo: string
  assunto: string
  estado: EstadoDaConversa
  canal: Canal
  cursoNome: string | null
  alunoNome: string | null
  alunoEmail: string | null
  visitante: boolean
  ultimaMensagemEm: Date
  criadoEm: Date
}

const colunasDaLista = {
  id: conversaDeAtendimento.id,
  codigo: conversaDeAtendimento.codigo,
  assunto: conversaDeAtendimento.assunto,
  estado: conversaDeAtendimento.estado,
  canal: conversaDeAtendimento.canal,
  cursoNome: curso.nome,
  userId: conversaDeAtendimento.userId,
  alunoNome: user.name,
  alunoEmail: user.email,
  visitanteEmail: conversaDeAtendimento.visitanteEmail,
  visitanteNome: conversaDeAtendimento.visitanteNome,
  ultimaMensagemEm: conversaDeAtendimento.ultimaMensagemEm,
  criadoEm: conversaDeAtendimento.criadoEm,
}

function paraItem(l: {
  id: string
  codigo: string
  assunto: string
  estado: EstadoDaConversa
  canal: Canal
  cursoNome: string | null
  userId: string | null
  alunoNome: string | null
  alunoEmail: string | null
  visitanteEmail: string | null
  visitanteNome: string | null
  ultimaMensagemEm: Date
  criadoEm: Date
}): ItemDaLista {
  return {
    id: l.id,
    codigo: l.codigo,
    assunto: l.assunto,
    estado: l.estado,
    canal: l.canal,
    cursoNome: l.cursoNome,
    alunoNome: l.userId ? l.alunoNome : (l.visitanteNome ?? null),
    alunoEmail: l.userId ? l.alunoEmail : l.visitanteEmail,
    visitante: !l.userId,
    ultimaMensagemEm: l.ultimaMensagemEm,
    criadoEm: l.criadoEm,
  }
}

function listaBase(db: Banco) {
  return comoLibsql(db)
    .select(colunasDaLista)
    .from(conversaDeAtendimento)
    .leftJoin(curso, eq(curso.id, conversaDeAtendimento.cursoId))
    .leftJoin(user, eq(user.id, conversaDeAtendimento.userId))
}

export interface FilaDaEquipe {
  itens: ItemDaLista[]
  contagens: Record<EstadoDaConversa, number>
}

/**
 * Fila única da equipe. Abertas e Respondidas: a mais antiga primeiro (quem espera há mais tempo
 * aparece no topo); Resolvidas: a mais recente primeiro.
 */
export async function filaDaEquipe(
  db: Banco,
  estado: EstadoDaConversa,
): Promise<FilaDaEquipe> {
  const ordem =
    estado === 'resolvida'
      ? desc(conversaDeAtendimento.ultimaMensagemEm)
      : conversaDeAtendimento.ultimaMensagemEm
  const [linhas, totais] = await Promise.all([
    listaBase(db)
      .where(
        and(
          eq(conversaDeAtendimento.estado, estado),
          isNull(conversaDeAtendimento.excluidoEm),
        ),
      )
      .orderBy(ordem),
    comoLibsql(db)
      .select({
        estado: conversaDeAtendimento.estado,
        total: count(),
      })
      .from(conversaDeAtendimento)
      .where(isNull(conversaDeAtendimento.excluidoEm))
      .groupBy(conversaDeAtendimento.estado),
  ])
  const contagens: Record<EstadoDaConversa, number> = {
    aberta: 0,
    respondida: 0,
    resolvida: 0,
  }
  for (const t of totais) contagens[t.estado] = t.total
  return { itens: linhas.map(paraItem), contagens }
}

/** Conversas Abertas (esperando a equipe): o contador da fila no menu do painel e no resumo diário. */
export async function contarAbertas(db: Banco): Promise<number> {
  const [linha] = await comoLibsql(db)
    .select({ total: count() })
    .from(conversaDeAtendimento)
    .where(
      and(
        eq(conversaDeAtendimento.estado, 'aberta'),
        isNull(conversaDeAtendimento.excluidoEm),
      ),
    )
  return linha?.total ?? 0
}

export interface MensagemLida {
  id: string
  autor: AutorDaMensagem
  autorNome: string
  texto: string
  anexos: string[]
  origem: Canal
  criadoEm: Date
}

export interface ConversaLida extends ItemDaLista {
  userId: string | null
  mensagens: MensagemLida[]
}

/** Conversa com as mensagens. O aluno só lê a dele; a equipe lê todas. */
export async function lerConversa(
  db: Banco,
  conversaId: string,
  pessoa: Pessoa,
): Promise<ConversaLida> {
  // A conversa e as mensagens não dependem uma da outra: uma ida só. Se a conversa não existe ou não é
  // do aluno, as mensagens lidas são descartadas e nada delas sai daqui.
  const [[linha], mensagens] = await comoLibsql(db).batch([
    listaBase(db).where(
      and(
        eq(conversaDeAtendimento.id, conversaId),
        isNull(conversaDeAtendimento.excluidoEm),
      ),
    ),
    comoLibsql(db)
      .select({
        id: mensagemDeAtendimento.id,
        autor: mensagemDeAtendimento.autor,
        autorNome: user.name,
        texto: mensagemDeAtendimento.texto,
        anexos: mensagemDeAtendimento.anexos,
        origem: mensagemDeAtendimento.origem,
        criadoEm: mensagemDeAtendimento.criadoEm,
      })
      .from(mensagemDeAtendimento)
      .leftJoin(user, eq(user.id, mensagemDeAtendimento.autorId))
      .where(eq(mensagemDeAtendimento.conversaId, conversaId))
      .orderBy(mensagemDeAtendimento.criadoEm),
  ])
  if (!linha || (!pessoa.equipe && linha.userId !== pessoa.id)) {
    throw new ErroDeAtendimento('Conversa não encontrada.')
  }
  const item = paraItem(linha)
  return {
    ...item,
    userId: linha.userId,
    mensagens: mensagens.map((m) => ({
      id: m.id,
      autor: m.autor,
      autorNome:
        m.autor === 'equipe'
          ? (m.autorNome ?? 'Equipe')
          : m.autor === 'visitante'
            ? (item.alunoNome ?? item.alunoEmail ?? 'Visitante')
            : (m.autorNome ?? item.alunoNome ?? 'Aluno'),
      texto: m.texto,
      anexos: JSON.parse(m.anexos) as string[],
      origem: m.origem,
      criadoEm: m.criadoEm,
    })),
  }
}

/** Quem pode abrir esta imagem: a equipe, o dono da conversa ou quem acabou de enviá-la. */
export async function podeVerAnexo(
  db: Banco,
  chave: string,
  pessoa: Pessoa,
): Promise<boolean> {
  if (pessoa.equipe) return true
  if (donoDoAnexo(chave) === pessoa.id) return true
  const [achada] = await comoLibsql(db)
    .select({ id: mensagemDeAtendimento.id })
    .from(mensagemDeAtendimento)
    .innerJoin(
      conversaDeAtendimento,
      eq(conversaDeAtendimento.id, mensagemDeAtendimento.conversaId),
    )
    .where(
      and(
        eq(conversaDeAtendimento.userId, pessoa.id),
        isNull(conversaDeAtendimento.excluidoEm),
        sql`instr(${mensagemDeAtendimento.anexos}, ${JSON.stringify(chave)}) > 0`,
      ),
    )
    .limit(1)
  return achada !== undefined
}

// ---------- Escrita ----------

async function gerarCodigoLivre(db: Banco): Promise<string> {
  for (let tentativa = 0; tentativa < 5; tentativa++) {
    const codigo = novoCodigo()
    const [existe] = await comoLibsql(db)
      .select({ id: conversaDeAtendimento.id })
      .from(conversaDeAtendimento)
      .where(eq(conversaDeAtendimento.codigo, codigo))
    if (!existe) return codigo
  }
  throw new ErroDeAtendimento('Não consegui criar a conversa. Tente de novo.')
}

/** Quantas conversas essa pessoa abriu na última hora (as excluídas contam: o limite é contra excesso). */
export async function conversasNaUltimaHora(
  db: Banco,
  agora: Relogio,
  quem: { userId: string } | { email: string },
): Promise<number> {
  const desde = new Date(agora().getTime() - 3_600_000)
  const dono =
    'userId' in quem
      ? eq(conversaDeAtendimento.userId, quem.userId)
      : and(
          isNull(conversaDeAtendimento.userId),
          eq(conversaDeAtendimento.visitanteEmail, quem.email),
        )
  const [linha] = await comoLibsql(db)
    .select({ total: count() })
    .from(conversaDeAtendimento)
    .where(and(dono, gt(conversaDeAtendimento.criadoEm, desde)))
  return linha?.total ?? 0
}

function textoDoLimite(): string {
  return `Você já abriu ${LIMITE_DE_CONVERSAS_POR_HORA} conversas na última hora. Espere um pouco ou continue uma das conversas abertas.`
}

/** A conversa de uma mensagem já enviada com esta chave por esta pessoa (clique duplo), se houver. */
async function envioRepetido(
  db: Banco,
  autorId: string,
  chave: string | undefined,
): Promise<{ conversaId: string } | null> {
  if (!chave) return null
  const [achada] = await comoLibsql(db)
    .select({ conversaId: mensagemDeAtendimento.conversaId })
    .from(mensagemDeAtendimento)
    .where(
      and(
        eq(mensagemDeAtendimento.autorId, autorId),
        eq(mensagemDeAtendimento.chaveDeEnvio, chave),
      ),
    )
  return achada ?? null
}

/** A chave que a tela gerou para este formulário, aparada; vazia vira ausente. */
const chaveLimpa = (chave: string | undefined) => chave?.trim() || undefined

interface NovaConversa {
  userId: string | null
  visitanteEmail: string | null
  visitanteNome: string | null
  cursoId: string | null
  assunto: string
  texto: string
  anexos: string[]
  autor: AutorDaMensagem
  autorId: string | null
  canal: Canal
  estado: EstadoDaConversa
  chaveDeEnvio?: string
}

async function gravarConversa(
  db: Banco,
  agora: Relogio,
  nova: NovaConversa,
): Promise<string> {
  const conversaId = crypto.randomUUID()
  const quando = agora()
  const codigo = await gerarCodigoLivre(db)
  await comoLibsql(db).batch([
    comoLibsql(db).insert(conversaDeAtendimento).values({
      id: conversaId,
      codigo,
      userId: nova.userId,
      visitanteEmail: nova.visitanteEmail,
      visitanteNome: nova.visitanteNome,
      cursoId: nova.cursoId,
      assunto: nova.assunto,
      estado: nova.estado,
      canal: nova.canal,
      ultimaMensagemEm: quando,
      criadoEm: quando,
    }),
    comoLibsql(db)
      .insert(mensagemDeAtendimento)
      .values({
        id: crypto.randomUUID(),
        conversaId,
        autor: nova.autor,
        autorId: nova.autorId,
        texto: nova.texto,
        anexos: JSON.stringify(nova.anexos),
        origem: nova.canal,
        chaveDeEnvio: nova.chaveDeEnvio ?? null,
        criadoEm: quando,
      }),
  ])
  return conversaId
}

async function avisarEquipe(
  db: Banco,
  agora: Relogio,
  conversaId: string,
  tipo: 'nova' | 'mensagem',
) {
  await adicionarAviso(db, agora, {
    chave: CHAVE_DO_AVISO,
    dados: { conversaId, tipo },
  })
}

export interface EntradaDaConversa {
  userId: string
  /** Curso sobre o qual é o assunto: um dos que o aluno tem. Vazio = outro assunto. */
  cursoId?: string | null
  assunto: string
  texto: string
  anexos?: string[]
  /** Gerada pela tela a cada formulário: o mesmo envio repetido (clique duplo) é a mesma mensagem. */
  chaveDeEnvio?: string
}

/** O aluno abre uma conversa pela área. */
export async function abrirConversa(
  db: Banco,
  agora: Relogio,
  entrada: EntradaDaConversa,
): Promise<string> {
  const chave = chaveLimpa(entrada.chaveDeEnvio)
  const repetida = await envioRepetido(db, entrada.userId, chave)
  if (repetida) return repetida.conversaId
  const assunto = conferirAssunto(entrada.assunto)
  const anexos = entrada.anexos ?? []
  const texto = conferirMensagem(entrada.texto, anexos, entrada.userId)
  const cursoId = entrada.cursoId || null
  if (cursoId) {
    const { ativos, expirados } = await cursosDoAluno(db, agora, entrada.userId)
    if (![...ativos, ...expirados].includes(cursoId)) {
      throw new ErroDeAtendimento('Escolha um dos seus cursos.')
    }
  }
  if (
    (await conversasNaUltimaHora(db, agora, { userId: entrada.userId })) >=
    LIMITE_DE_CONVERSAS_POR_HORA
  ) {
    throw new ErroDeAtendimento(textoDoLimite())
  }
  const conversaId = await gravarConversa(db, agora, {
    userId: entrada.userId,
    visitanteEmail: null,
    visitanteNome: null,
    cursoId,
    assunto,
    texto,
    anexos,
    autor: 'aluno',
    autorId: entrada.userId,
    canal: 'area',
    estado: 'aberta',
    chaveDeEnvio: chave,
  })
  await avisarEquipe(db, agora, conversaId, 'nova')
  return conversaId
}

async function acrescentarMensagem(
  db: Banco,
  agora: Relogio,
  conversa: Conversa,
  mensagem: {
    autor: AutorDaMensagem
    autorId: string | null
    texto: string
    anexos: string[]
    origem: Canal
    chaveDeEnvio?: string
  },
  estado: EstadoDaConversa,
) {
  const quando = agora()
  await comoLibsql(db).batch([
    comoLibsql(db)
      .insert(mensagemDeAtendimento)
      .values({
        id: crypto.randomUUID(),
        conversaId: conversa.id,
        autor: mensagem.autor,
        autorId: mensagem.autorId,
        texto: mensagem.texto,
        anexos: JSON.stringify(mensagem.anexos),
        origem: mensagem.origem,
        chaveDeEnvio: mensagem.chaveDeEnvio ?? null,
        criadoEm: quando,
      }),
    comoLibsql(db)
      .update(conversaDeAtendimento)
      .set({
        estado,
        ultimaMensagemEm: quando,
        resolvidaEm: estado === 'resolvida' ? quando : null,
      })
      .where(eq(conversaDeAtendimento.id, conversa.id)),
  ])
}

export interface EntradaDaContinuacao {
  conversaId: string
  userId: string
  texto: string
  anexos?: string[]
  /** Gerada pela tela a cada formulário (clique duplo). */
  chaveDeEnvio?: string
}

/** O aluno responde pela área. A conversa volta a Aberta, mesmo se estava Resolvida. */
export async function continuarComoAluno(
  db: Banco,
  agora: Relogio,
  entrada: EntradaDaContinuacao,
): Promise<void> {
  const conversa = await conversaVigente(db, entrada.conversaId)
  if (conversa.userId !== entrada.userId) {
    throw new ErroDeAtendimento('Conversa não encontrada.')
  }
  const chave = chaveLimpa(entrada.chaveDeEnvio)
  if (await envioRepetido(db, entrada.userId, chave)) return
  const anexos = entrada.anexos ?? []
  const texto = conferirMensagem(entrada.texto, anexos, entrada.userId)
  await acrescentarMensagem(
    db,
    agora,
    conversa,
    {
      autor: 'aluno',
      autorId: entrada.userId,
      texto,
      anexos,
      origem: 'area',
      chaveDeEnvio: chave,
    },
    'aberta',
  )
  await avisarEquipe(db, agora, conversa.id, 'mensagem')
}

// ---------- O fio da aluna ----------

const LIMITE_DO_ASSUNTO_DO_FIO = 60

/** Assunto de uma conversa aberta pelo fio: o começo da mensagem, até ~60 caracteres, cortado na palavra. */
export function assuntoDoComeco(texto: string): string {
  const linha = texto.trim().split('\n')[0]?.trim() ?? ''
  if (!linha) return 'Imagem'
  if (linha.length <= LIMITE_DO_ASSUNTO_DO_FIO) return linha
  const corte = linha.slice(0, LIMITE_DO_ASSUNTO_DO_FIO + 1)
  const ultimoEspaco = corte.lastIndexOf(' ')
  const base =
    ultimoEspaco > 0
      ? corte.slice(0, ultimoEspaco)
      : linha.slice(0, LIMITE_DO_ASSUNTO_DO_FIO)
  return `${base.trimEnd()}…`
}

export interface EntradaDoFio {
  userId: string
  /** Curso opcional, usado só se a mensagem abrir uma conversa nova. */
  cursoId?: string | null
  texto: string
  anexos?: string[]
  chaveDeEnvio?: string
}

/**
 * A aluna manda uma mensagem no fio. Se a conversa mais recente dela está Aberta ou Respondida, a
 * mensagem continua essa conversa; se está Resolvida (ou não há nenhuma), abre uma conversa nova.
 */
export async function mandarNoFio(
  db: Banco,
  agora: Relogio,
  entrada: EntradaDoFio,
): Promise<{ conversaId: string; novaConversa: boolean }> {
  const chave = chaveLimpa(entrada.chaveDeEnvio)
  const repetida = await envioRepetido(db, entrada.userId, chave)
  if (repetida) return { conversaId: repetida.conversaId, novaConversa: false }
  const [ultima] = await comoLibsql(db)
    .select({
      id: conversaDeAtendimento.id,
      estado: conversaDeAtendimento.estado,
    })
    .from(conversaDeAtendimento)
    .where(
      and(
        eq(conversaDeAtendimento.userId, entrada.userId),
        isNull(conversaDeAtendimento.excluidoEm),
      ),
    )
    .orderBy(
      desc(conversaDeAtendimento.ultimaMensagemEm),
      desc(conversaDeAtendimento.criadoEm),
    )
    .limit(1)
  if (ultima && ultima.estado !== 'resolvida') {
    await continuarComoAluno(db, agora, {
      conversaId: ultima.id,
      userId: entrada.userId,
      texto: entrada.texto,
      anexos: entrada.anexos,
      chaveDeEnvio: chave,
    })
    return { conversaId: ultima.id, novaConversa: false }
  }
  const conversaId = await abrirConversa(db, agora, {
    userId: entrada.userId,
    cursoId: entrada.cursoId,
    assunto: assuntoDoComeco(entrada.texto),
    texto: entrada.texto,
    anexos: entrada.anexos,
    chaveDeEnvio: chave,
  })
  return { conversaId, novaConversa: true }
}

export interface MensagemDoFio extends MensagemLida {
  conversaId: string
  autorImagem: string | null
}

/** As mensagens de todas as conversas da aluna, em ordem. */
export async function fioDoAluno(
  db: Banco,
  userId: string,
): Promise<MensagemDoFio[]> {
  const linhas = await comoLibsql(db)
    .select({
      id: mensagemDeAtendimento.id,
      conversaId: mensagemDeAtendimento.conversaId,
      autor: mensagemDeAtendimento.autor,
      autorNome: user.name,
      autorImagem: user.image,
      texto: mensagemDeAtendimento.texto,
      anexos: mensagemDeAtendimento.anexos,
      origem: mensagemDeAtendimento.origem,
      criadoEm: mensagemDeAtendimento.criadoEm,
    })
    .from(mensagemDeAtendimento)
    .innerJoin(
      conversaDeAtendimento,
      eq(conversaDeAtendimento.id, mensagemDeAtendimento.conversaId),
    )
    .leftJoin(user, eq(user.id, mensagemDeAtendimento.autorId))
    .where(
      and(
        eq(conversaDeAtendimento.userId, userId),
        isNull(conversaDeAtendimento.excluidoEm),
      ),
    )
    .orderBy(mensagemDeAtendimento.criadoEm, mensagemDeAtendimento.id)
  return linhas.map((m) => ({
    id: m.id,
    conversaId: m.conversaId,
    autor: m.autor,
    autorNome:
      m.autor === 'equipe'
        ? (m.autorNome ?? 'Equipe')
        : (m.autorNome ?? 'Você'),
    autorImagem: m.autorImagem,
    texto: m.texto,
    anexos: JSON.parse(m.anexos) as string[],
    origem: m.origem,
    criadoEm: m.criadoEm,
  }))
}

/** O que a cola precisa para avisar quem recebeu a resposta da equipe. */
export interface RespostaDaEquipe {
  conversaId: string
  codigo: string
  assunto: string
  texto: string
  para: {
    userId: string | null
    email: string
    nome: string | null
    visitante: boolean
  }
}

export interface Ganchos {
  /** Roda depois de a resposta ser gravada: o sininho do aluno (#46) entra aqui. */
  aoResponderPelaEquipe?: (resposta: RespostaDaEquipe) => Promise<void>
}

async function destinatarioDa(
  db: Banco,
  conversa: Conversa,
): Promise<RespostaDaEquipe['para']> {
  if (conversa.userId) {
    const [aluno] = await comoLibsql(db)
      .select({ id: user.id, email: user.email, nome: user.name })
      .from(user)
      .where(eq(user.id, conversa.userId))
    if (aluno) {
      return {
        userId: aluno.id,
        email: aluno.email,
        nome: aluno.nome,
        visitante: false,
      }
    }
  }
  if (!conversa.visitanteEmail) {
    throw new ErroDeAtendimento('Esta conversa não tem para quem responder.')
  }
  return {
    userId: null,
    email: conversa.visitanteEmail,
    nome: conversa.visitanteNome,
    visitante: true,
  }
}

export interface EntradaDaResposta {
  conversaId: string
  equipeId: string
  texto: string
  anexos?: string[]
  /** Gerada pela tela a cada formulário (clique duplo). */
  chaveDeEnvio?: string
}

/** Qualquer pessoa da equipe responde. A conversa passa a Respondida. */
export async function responderComoEquipe(
  db: Banco,
  agora: Relogio,
  entrada: EntradaDaResposta,
  ganchos: Ganchos = {},
): Promise<RespostaDaEquipe> {
  const conversa = await conversaVigente(db, entrada.conversaId)
  const anexos = entrada.anexos ?? []
  const texto = conferirMensagem(entrada.texto, anexos, entrada.equipeId)
  const para = await destinatarioDa(db, conversa)
  const chave = chaveLimpa(entrada.chaveDeEnvio)
  const resposta: RespostaDaEquipe = {
    conversaId: conversa.id,
    codigo: conversa.codigo,
    assunto: conversa.assunto,
    texto,
    para,
  }
  // Clique duplo: a resposta já saiu, e o e-mail ao aluno não sai de novo.
  if (await envioRepetido(db, entrada.equipeId, chave)) return resposta
  await acrescentarMensagem(
    db,
    agora,
    conversa,
    {
      autor: 'equipe',
      autorId: entrada.equipeId,
      texto,
      anexos,
      origem: 'area',
      chaveDeEnvio: chave,
    },
    'respondida',
  )
  await ganchos.aoResponderPelaEquipe?.(resposta)
  return resposta
}

export interface EntradaDaEquipe {
  equipeId: string
  /** O aluno com quem a equipe quer falar. */
  userId: string
  cursoId?: string | null
  assunto: string
  texto: string
  anexos?: string[]
}

/**
 * A equipe abre a conversa com a aluna (ex.: o "Problema" do Pedido do MEC, #56). A primeira
 * mensagem é da equipe, então a conversa já nasce Respondida (espera a aluna) e não conta no
 * limite do aluno nem avisa a equipe. Devolve o mesmo que `responderComoEquipe`, para a cola avisar.
 */
export async function abrirConversaPelaEquipe(
  db: Banco,
  agora: Relogio,
  entrada: EntradaDaEquipe,
  ganchos: Ganchos = {},
): Promise<RespostaDaEquipe> {
  const assunto = conferirAssunto(entrada.assunto)
  const anexos = entrada.anexos ?? []
  const texto = conferirMensagem(entrada.texto, anexos, entrada.equipeId)
  const [aluno] = await comoLibsql(db)
    .select({ id: user.id, email: user.email, nome: user.name })
    .from(user)
    .where(eq(user.id, entrada.userId))
  if (!aluno) throw new ErroDeAtendimento('Aluno não encontrado.')
  const cursoId = entrada.cursoId || null
  if (cursoId) {
    const [existe] = await comoLibsql(db)
      .select({ id: curso.id })
      .from(curso)
      .where(and(eq(curso.id, cursoId), isNull(curso.excluidoEm)))
    if (!existe) throw new ErroDeAtendimento('Curso não encontrado.')
  }
  const conversaId = await gravarConversa(db, agora, {
    userId: aluno.id,
    visitanteEmail: null,
    visitanteNome: null,
    cursoId,
    assunto,
    texto,
    anexos,
    autor: 'equipe',
    autorId: entrada.equipeId,
    canal: 'area',
    estado: 'respondida',
  })
  const [criada] = await comoLibsql(db)
    .select({ codigo: conversaDeAtendimento.codigo })
    .from(conversaDeAtendimento)
    .where(eq(conversaDeAtendimento.id, conversaId))
  const resposta: RespostaDaEquipe = {
    conversaId,
    codigo: criada?.codigo ?? '',
    assunto,
    texto,
    para: {
      userId: aluno.id,
      email: aluno.email,
      nome: aluno.nome,
      visitante: false,
    },
  }
  await ganchos.aoResponderPelaEquipe?.(resposta)
  return resposta
}

/** A equipe fecha a conversa. Mensagem nova do aluno a reabre. */
export async function resolverConversa(
  db: Banco,
  agora: Relogio,
  conversaId: string,
): Promise<void> {
  const conversa = await conversaVigente(db, conversaId)
  if (conversa.estado === 'resolvida') return
  await comoLibsql(db)
    .update(conversaDeAtendimento)
    .set({ estado: 'resolvida', resolvidaEm: agora() })
    .where(eq(conversaDeAtendimento.id, conversa.id))
}

/** Exclusão protegida: some das telas e a limpeza diária apaga de vez depois de 30 dias. */
export async function excluirConversa(
  db: Banco,
  agora: Relogio,
  conversaId: string,
): Promise<void> {
  const conversa = await conversaVigente(db, conversaId)
  await comoLibsql(db)
    .update(conversaDeAtendimento)
    .set({ excluidoEm: agora() })
    .where(eq(conversaDeAtendimento.id, conversa.id))
}

// ---------- Entrada por e-mail (suporte@ e help@) ----------

export interface EmailRecebido {
  /** Endereço do remetente. */
  de: string
  nome?: string | null
  assunto: string
  texto: string
  /** Chaves das imagens já guardadas no R2 (dono `email`). */
  anexos?: string[]
  /**
   * O remetente passou na autenticação (DMARC, ou DKIM alinhado). Quando `false`, o e-mail entra
   * como Visitante e não é ligado à conta que tem esse endereço. Obrigatório: falha fechada.
   */
  autenticado: boolean
}

export type ResultadoDoEmail =
  | { resultado: 'continuou' | 'abriu'; conversaId: string }
  | { resultado: 'limitado' | 'vazio' }

async function acharConversaDoRemetente(
  db: Banco,
  email: string,
  userId: string | null,
  assunto: string,
): Promise<Conversa | null> {
  const dono = userId
    ? eq(conversaDeAtendimento.userId, userId)
    : and(
        isNull(conversaDeAtendimento.userId),
        eq(conversaDeAtendimento.visitanteEmail, email),
      )
  const codigo = extrairCodigo(assunto)
  if (codigo) {
    const [porCodigo] = await comoLibsql(db)
      .select()
      .from(conversaDeAtendimento)
      .where(
        and(
          eq(conversaDeAtendimento.codigo, codigo),
          dono,
          isNull(conversaDeAtendimento.excluidoEm),
        ),
      )
    if (porCodigo) return porCodigo
  }
  const normalizado = normalizarAssunto(assunto)
  if (!normalizado) return null
  const [mesmoAssunto] = await comoLibsql(db)
    .select()
    .from(conversaDeAtendimento)
    .where(
      and(
        dono,
        eq(conversaDeAtendimento.assunto, normalizado),
        isNull(conversaDeAtendimento.excluidoEm),
      ),
    )
    .orderBy(desc(conversaDeAtendimento.ultimaMensagemEm))
    .limit(1)
  return mesmoAssunto ?? null
}

/**
 * Um e-mail chegou ao suporte@ ou help@. O código no assunto (ou o mesmo assunto) continua a
 * conversa do remetente; senão abre uma nova: de aluno, se o e-mail é de uma conta, e de Visitante
 * se não for. A citação da resposta anterior é cortada e o texto passa de 5.000 caracteres só
 * até o limite (o resto é descartado, não recusado: o e-mail não pode "dar erro" para o remetente).
 */
export async function receberEmail(
  db: Banco,
  agora: Relogio,
  email: EmailRecebido,
): Promise<ResultadoDoEmail> {
  const remetente = email.de.trim().toLowerCase()
  const anexos = (email.anexos ?? [])
    .filter((a) => anexoDoDono(a, DONO_DO_EMAIL))
    .slice(0, LIMITE_DE_ANEXOS)
  const texto = limparRespostaDeEmail(email.texto).slice(0, LIMITE_DO_TEXTO)
  if (!texto && anexos.length === 0) return { resultado: 'vazio' }

  // Remetente não autenticado nunca é ligado a uma conta: entra como Visitante.
  const [conta] = email.autenticado
    ? await comoLibsql(db)
        .select({ id: user.id })
        .from(user)
        .where(eq(user.email, remetente))
    : []
  const userId = conta?.id ?? null
  const existente = await acharConversaDoRemetente(
    db,
    remetente,
    userId,
    email.assunto,
  )
  if (existente) {
    await acrescentarMensagem(
      db,
      agora,
      existente,
      {
        autor: userId ? 'aluno' : 'visitante',
        autorId: userId,
        texto,
        anexos,
        origem: 'email',
      },
      'aberta',
    )
    await avisarEquipe(db, agora, existente.id, 'mensagem')
    return { resultado: 'continuou', conversaId: existente.id }
  }

  const limite = await conversasNaUltimaHora(
    db,
    agora,
    userId ? { userId } : { email: remetente },
  )
  if (limite >= LIMITE_DE_CONVERSAS_POR_HORA) return { resultado: 'limitado' }
  const conversaId = await gravarConversa(db, agora, {
    userId,
    visitanteEmail: userId ? null : remetente,
    visitanteNome: userId ? null : email.nome?.trim() || null,
    cursoId: null,
    assunto:
      normalizarAssunto(email.assunto).slice(0, LIMITE_DO_ASSUNTO) ||
      '(sem assunto)',
    texto,
    anexos,
    autor: userId ? 'aluno' : 'visitante',
    autorId: userId,
    canal: 'email',
    estado: 'aberta',
  })
  await avisarEquipe(db, agora, conversaId, 'nova')
  return { resultado: 'abriu', conversaId }
}

// ---------- Aviso à equipe (agrupado em 15 minutos, desligável) ----------

export async function avisoDeAtendimentoLigado(
  db: Banco,
  userId: string,
): Promise<boolean> {
  const [linha] = await comoLibsql(db)
    .select({ tipo: emailDesligado.tipo })
    .from(emailDesligado)
    .where(
      and(
        eq(emailDesligado.userId, userId),
        eq(emailDesligado.tipo, TIPO_DO_AVISO),
      ),
    )
  return linha === undefined
}

export async function definirAvisoDeAtendimento(
  db: Banco,
  agora: Relogio,
  userId: string,
  ligado: boolean,
): Promise<void> {
  if (ligado) {
    await comoLibsql(db)
      .delete(emailDesligado)
      .where(
        and(
          eq(emailDesligado.userId, userId),
          eq(emailDesligado.tipo, TIPO_DO_AVISO),
        ),
      )
    return
  }
  await comoLibsql(db)
    .insert(emailDesligado)
    .values({ userId, tipo: TIPO_DO_AVISO, desligadoEm: agora() })
    .onConflictDoNothing()
}

export interface AvisoParaEquipe {
  userId: string
  email: string
  nome: string
  /** Mensagens novas (conversas novas e respostas de alunos) no grupo. */
  quantidade: number
}

/** De um grupo de avisos prontos, quem da equipe (com o aviso ligado) recebe e quanto. */
export async function avisosParaEquipe(
  db: Banco,
  grupos: GrupoDeAvisos[],
): Promise<AvisoParaEquipe[]> {
  const quantidade = grupos
    .filter((g) => g.chave === CHAVE_DO_AVISO)
    .reduce((soma, g) => soma + g.avisos.length, 0)
  if (quantidade === 0) return []
  const equipe = await comoLibsql(db)
    .select({ id: user.id, email: user.email, nome: user.name })
    .from(user)
    .where(inArray(user.perfil, ['equipe', 'proprietario']))
  const desligados = await comoLibsql(db)
    .select({ userId: emailDesligado.userId })
    .from(emailDesligado)
    .where(eq(emailDesligado.tipo, TIPO_DO_AVISO))
  const fora = new Set(desligados.map((d) => d.userId))
  return equipe
    .filter((p) => !fora.has(p.id))
    .map((p) => ({
      userId: p.id,
      email: p.email,
      nome: p.nome,
      quantidade,
    }))
}

/**
 * Agrupador do aviso à equipe: o que chegou há 15 minutos ou mais vira UM e-mail por pessoa da equipe
 * com o aviso ligado.
 */
export async function agruparAvisoDeAtendimentoParaEquipe(
  grupo: GrupoDeAvisos,
  deps: DependenciasDoAgrupamento & { banco: Banco },
): Promise<void> {
  const destinos = await avisosParaEquipe(deps.banco, [grupo])
  for (const destino of destinos) {
    await deps.pedirEmail({
      tipo: 'aviso-de-atendimento',
      para: destino.email,
      userId: destino.userId,
      variaveis: {
        nome: primeiroNome(destino.nome),
        quantidade: String(destino.quantidade),
        link: `${deps.baseDoApp}/painel/atendimento`,
      },
    })
  }
}

/** Os cursos do aluno (ativos e expirados), com nome, para escolher na conversa nova. */
export async function cursosParaConversa(
  db: Banco,
  agora: Relogio,
  userId: string,
): Promise<{ id: string; nome: string }[]> {
  const { ativos, expirados } = await cursosDoAluno(db, agora, userId)
  const ids = [...ativos, ...expirados]
  if (ids.length === 0) return []
  const cursos = await emLotes(ids, (lote) =>
    comoLibsql(db)
      .select({ id: curso.id, nome: curso.nome })
      .from(curso)
      .where(inArray(curso.id, lote)),
  )
  return cursos.sort((a, b) => (a.nome < b.nome ? -1 : a.nome > b.nome ? 1 : 0))
}
