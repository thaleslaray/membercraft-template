// Envio de e-mails: pedido -> fila -> envio -> histórico (e retorno). O módulo não conhece provedor
// nem fila de verdade: recebe `fila` e `enviar` por parâmetro (a cola está em `src/lib/email-cola.ts`).
//
// Fluxo: `enfileirarEmail` grava a linha do histórico (na-fila) e manda `{ origem: 'email', envioId }`
// para a FILA_EMAIL; o consumidor chama `processarEnvio`, que monta o texto vigente, envia e atualiza
// a linha. Falhou: lança, a fila tenta de novo; esgotadas as tentativas a mensagem vai para a fila de
// mortos, que chama `marcarFalha` e avisa o técnico.

import { and, asc, desc, eq, inArray, lt } from 'drizzle-orm'
import {
  curso,
  emailDesligado,
  envioDeEmail,
  textoDeEmail,
  user,
} from '#/db/schema'
import {
  type EmailMontado,
  ErroDeEmail,
  MODELOS_DE_EMAIL,
  type ModeloDeEmail,
  modeloDe,
  previaDoEmail,
  type TextoDeEmail,
  validarTexto,
} from '#/regras/email-modelos'
import { type Banco, comoLibsql, type Relogio } from '#/regras/tipos'

export type StatusDoEnvio = (typeof envioDeEmail.$inferSelect)['status']
export type Envio = typeof envioDeEmail.$inferSelect

/** Corpo da mensagem na FILA_EMAIL. `origem` é lido pelo alerta ao técnico (#65). */
export interface MensagemDeEmail {
  origem: 'email'
  envioId: string
}

export interface FilaDeEmail {
  send(mensagem: MensagemDeEmail): Promise<void>
}

export interface PedidoDeEmail {
  tipo: ModeloDeEmail['tipo']
  para: string
  userId?: string | null
  /** Valores das variáveis do modelo. Nada secreto aqui: o link de entrada nasce na hora do envio. */
  variaveis?: Record<string, string>
}

// ---------- Texto vigente ----------

export async function textoVigente(
  banco: Banco,
  tipo: string,
): Promise<TextoDeEmail | undefined> {
  const db = comoLibsql(banco)
  const [linha] = await db
    .select()
    .from(textoDeEmail)
    .where(eq(textoDeEmail.tipo, tipo))
  return linha ? { assunto: linha.assunto, corpo: linha.corpo } : undefined
}

// ---------- Descadastro ----------

export async function tiposDesligados(
  banco: Banco,
  userId: string,
): Promise<string[]> {
  const db = comoLibsql(banco)
  const linhas = await db
    .select({ tipo: emailDesligado.tipo })
    .from(emailDesligado)
    .where(eq(emailDesligado.userId, userId))
  return linhas.map((l) => l.tipo)
}

/** Interruptores de Minha conta: só os e-mails marcados com descadastro. */
export async function preferenciasDeEmail(banco: Banco, userId: string) {
  const desligados = new Set(await tiposDesligados(banco, userId))
  return MODELOS_DE_EMAIL.filter((m) => m.descadastro).map((m) => ({
    tipo: m.tipo,
    nome: m.nome,
    quando: m.quando,
    ativo: !desligados.has(m.tipo),
  }))
}

export async function definirPreferenciaDeEmail(
  banco: Banco,
  agora: Relogio,
  entrada: { userId: string; tipo: string; ativo: boolean },
): Promise<void> {
  const db = comoLibsql(banco)
  const modelo = modeloDe(entrada.tipo)
  if (!modelo.descadastro) {
    throw new ErroDeEmail(`O e-mail "${modelo.nome}" não pode ser desligado.`)
  }
  if (entrada.ativo) {
    await db
      .delete(emailDesligado)
      .where(
        and(
          eq(emailDesligado.userId, entrada.userId),
          eq(emailDesligado.tipo, modelo.tipo),
        ),
      )
    return
  }
  await db
    .insert(emailDesligado)
    .values({ userId: entrada.userId, tipo: modelo.tipo, desligadoEm: agora() })
    .onConflictDoNothing()
}

// ---------- Pedir, enviar, falhar ----------

export type ResultadoDoPedido = { envioId: string; status: StatusDoEnvio }

/** Grava o pedido no histórico e o põe na fila. Se o aluno desligou esse e-mail, nada é enviado. */
export async function enfileirarEmail(
  banco: Banco,
  agora: Relogio,
  fila: FilaDeEmail,
  pedido: PedidoDeEmail,
): Promise<ResultadoDoPedido> {
  const db = comoLibsql(banco)
  const modelo = modeloDe(pedido.tipo)
  const envioId = crypto.randomUUID()
  const para = pedido.para.trim().toLowerCase()
  let userId = pedido.userId ?? null
  if (!userId) {
    const [conta] = await db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.email, para))
    userId = conta?.id ?? null
  }
  const desligado =
    modelo.descadastro && userId
      ? (await tiposDesligados(banco, userId)).includes(modelo.tipo)
      : false
  const status: StatusDoEnvio = desligado ? 'ignorado' : 'na-fila'
  await db.insert(envioDeEmail).values({
    id: envioId,
    userId,
    para,
    tipo: modelo.tipo,
    variaveis: JSON.stringify(pedido.variaveis ?? {}),
    status,
    criadoEm: agora(),
  })
  if (status === 'na-fila') await fila.send({ origem: 'email', envioId })
  return { envioId, status }
}

export interface ResultadoDoProvedor {
  sent: boolean
  provider: string
  id?: string
}

export interface DependenciasDoEnvio {
  /** Monta o e-mail da linha (texto vigente, link de entrada, rodapé de descadastro). */
  montar(envio: Envio): Promise<EmailMontado>
  enviar(email: EmailMontado & { to: string }): Promise<ResultadoDoProvedor>
}

/**
 * Faz o envio de uma linha do histórico. Repetir a chamada de um envio já resolvido (ou em curso
 * em outro consumidor) não envia de novo: a linha é reservada com `na-fila -> enviando` antes de
 * chamar o provedor. Falha do provedor volta a linha para `na-fila`, anota a tentativa e o erro e
 * lança (a fila tenta outra vez). Se o provedor aceitou mas o registro final falhou, NÃO lança:
 * repetir enviaria o e-mail em duplicata; a linha fica `enviando` e a varredura a encerra.
 */
export async function processarEnvio(
  banco: Banco,
  agora: Relogio,
  envioId: string,
  deps: DependenciasDoEnvio,
): Promise<StatusDoEnvio | 'inexistente'> {
  const db = comoLibsql(banco)
  const [existente] = await db
    .select()
    .from(envioDeEmail)
    .where(eq(envioDeEmail.id, envioId))
  if (!existente) return 'inexistente'
  if (existente.status !== 'na-fila') return existente.status
  const [envio] = await db
    .update(envioDeEmail)
    .set({ status: 'enviando' })
    .where(
      and(eq(envioDeEmail.id, envioId), eq(envioDeEmail.status, 'na-fila')),
    )
    .returning()
  // Outro consumidor reservou primeiro.
  if (!envio) return 'enviando'
  let montado: EmailMontado
  let resultado: ResultadoDoProvedor
  try {
    montado = await deps.montar(envio)
    resultado = await deps.enviar({ ...montado, to: envio.para })
  } catch (erro) {
    await db
      .update(envioDeEmail)
      .set({
        status: 'na-fila',
        tentativas: envio.tentativas + 1,
        erro: (erro instanceof Error ? erro.message : String(erro)).slice(
          0,
          500,
        ),
      })
      .where(eq(envioDeEmail.id, envio.id))
    throw erro
  }
  const bloqueado = resultado.provider === 'bloqueado'
  const status: StatusDoEnvio = bloqueado ? 'bloqueado' : 'enviado'
  try {
    await db
      .update(envioDeEmail)
      .set({
        status,
        assunto: montado.subject,
        provedor: resultado.provider,
        idDoProvedor: resultado.id ?? null,
        tentativas: envio.tentativas + 1,
        erro: null,
        enviadoEm: bloqueado ? null : agora(),
      })
      .where(eq(envioDeEmail.id, envio.id))
  } catch (erro) {
    console.error(
      `[email] o provedor aceitou o envio ${envio.id}, mas não consegui registrar`,
      erro,
    )
  }
  return status
}

/** Quanto tempo uma linha pode ficar `na-fila` ou `enviando` antes de a varredura dá-la por perdida. */
export const LIMITE_SEM_RESPOSTA_MS = 60 * 60 * 1000

/**
 * Varredura: linhas `na-fila` ou `enviando` há mais de 1 h (fila que falhou ao receber, consumidor
 * que caiu no meio, código de login interrompido) viram `falhou`. Devolve quantas.
 */
export async function varrerEnviosSemResposta(
  banco: Banco,
  agora: Relogio,
): Promise<number> {
  const db = comoLibsql(banco)
  const limite = new Date(agora().getTime() - LIMITE_SEM_RESPOSTA_MS)
  const achados = await db
    .update(envioDeEmail)
    .set({ status: 'falhou', erro: 'sem resposta' })
    .where(
      and(
        inArray(envioDeEmail.status, ['na-fila', 'enviando']),
        lt(envioDeEmail.criadoEm, limite),
      ),
    )
    .returning({ id: envioDeEmail.id })
  return achados.length
}

// ---------- Código de acesso ----------

/**
 * O código de login sai na hora (não passa pela fila: a pessoa está esperando) e entra no histórico
 * SEM o código: a linha só diz que foi enviado, para quem e se voltou. O histórico é registro, não
 * condição: se ele falhar, o código ainda sai. Falha de envio é anotada e sobe.
 */
export async function enviarCodigoDeAcesso(
  banco: Banco,
  agora: Relogio,
  entrada: {
    email: string
    otp: string
    mensagem: { subject: string; html: string; text: string }
  },
  enviar: (email: {
    to: string
    subject: string
    html: string
    text: string
  }) => Promise<ResultadoDoProvedor>,
): Promise<ResultadoDoProvedor> {
  const db = comoLibsql(banco)
  const para = entrada.email.trim().toLowerCase()
  const id = crypto.randomUUID()
  const [conta] = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.email, para))
  const registrou = await db
    .insert(envioDeEmail)
    .values({
      id,
      userId: conta?.id ?? null,
      para,
      tipo: 'codigo',
      assunto: entrada.mensagem.subject.replace(entrada.otp, '••••••'),
      status: 'na-fila',
      criadoEm: agora(),
    })
    .then(() => true)
    .catch((erro) => {
      console.error(
        '[email] não consegui registrar o código no histórico',
        erro,
      )
      return false
    })
  try {
    const resultado = await enviar({ to: para, ...entrada.mensagem })
    const bloqueado = resultado.provider === 'bloqueado'
    if (registrou) {
      await db
        .update(envioDeEmail)
        .set({
          status: bloqueado ? 'bloqueado' : 'enviado',
          provedor: resultado.provider,
          idDoProvedor: resultado.id ?? null,
          tentativas: 1,
          enviadoEm: bloqueado ? null : agora(),
        })
        .where(eq(envioDeEmail.id, id))
    }
    return resultado
  } catch (erro) {
    if (registrou) {
      await db
        .update(envioDeEmail)
        .set({
          status: 'falhou',
          tentativas: 1,
          erro: (erro instanceof Error ? erro.message : String(erro)).slice(
            0,
            500,
          ),
        })
        .where(eq(envioDeEmail.id, id))
    }
    throw erro
  }
}

/** A fila de mortos desistiu desta mensagem. */
export async function marcarFalha(
  banco: Banco,
  envioId: string,
  motivo?: string,
): Promise<void> {
  const db = comoLibsql(banco)
  const [envio] = await db
    .select()
    .from(envioDeEmail)
    .where(eq(envioDeEmail.id, envioId))
  if (envio?.status !== 'na-fila') return
  await db
    .update(envioDeEmail)
    .set({
      status: 'falhou',
      erro: (motivo ?? envio.erro ?? 'Envio desistido pela fila.').slice(
        0,
        500,
      ),
    })
    .where(eq(envioDeEmail.id, envio.id))
}

// ---------- Retorno (bounce, reclamação) ----------

export interface Retorno {
  idDoProvedor: string
  motivo: string
}

/** Lê o aviso do provedor (formato do Resend): só retorno de verdade (bounce e reclamação) interessa. */
export function interpretarRetorno(corpo: unknown): Retorno | null {
  const aviso = corpo as {
    type?: unknown
    data?: { email_id?: unknown; bounce?: { message?: unknown } }
  } | null
  if (!aviso || typeof aviso.type !== 'string') return null
  const id = aviso.data?.email_id
  if (typeof id !== 'string' || !id) return null
  if (aviso.type === 'email.bounced') {
    const mensagem = aviso.data?.bounce?.message
    return {
      idDoProvedor: id,
      motivo:
        typeof mensagem === 'string' ? mensagem : 'O e-mail voltou (bounce).',
    }
  }
  if (aviso.type === 'email.complained') {
    return { idDoProvedor: id, motivo: 'A pessoa marcou como spam.' }
  }
  return null
}

/** Anota que o e-mail voltou. Só transiciona a partir de `enviado`; devolve false se não há envio assim. */
export async function registrarRetorno(
  banco: Banco,
  agora: Relogio,
  retorno: Retorno,
): Promise<boolean> {
  const db = comoLibsql(banco)
  const achados = await db
    .update(envioDeEmail)
    .set({
      status: 'retornou',
      retorno: retorno.motivo.slice(0, 500),
      retornoEm: agora(),
    })
    .where(
      and(
        eq(envioDeEmail.idDoProvedor, retorno.idDoProvedor),
        eq(envioDeEmail.status, 'enviado'),
      ),
    )
    .returning({ id: envioDeEmail.id })
  return achados.length > 0
}

// ---------- Histórico ----------

/** Últimos e-mails do aluno, do mais novo para o mais antigo, com o nome do tipo e o status. */
export async function historicoDeEmails(
  banco: Banco,
  userId: string,
  limite = 30,
) {
  const db = comoLibsql(banco)
  const linhas = await db
    .select()
    .from(envioDeEmail)
    .where(eq(envioDeEmail.userId, userId))
    .orderBy(desc(envioDeEmail.criadoEm))
    .limit(limite)
  return linhas.map((l) => ({
    id: l.id,
    tipo: l.tipo,
    nome: MODELOS_DE_EMAIL.find((m) => m.tipo === l.tipo)?.nome ?? l.tipo,
    para: l.para,
    assunto: l.assunto,
    status: l.status,
    provedor: l.provedor,
    erro: l.erro,
    retorno: l.retorno,
    criadoEm: l.criadoEm,
    enviadoEm: l.enviadoEm,
    retornoEm: l.retornoEm,
  }))
}

export type EmailDoHistorico = Awaited<
  ReturnType<typeof historicoDeEmails>
>[number]

// ---------- Textos editáveis ----------

/** Todos os e-mails com o texto padrão e o texto em vigor (o do Proprietário, se houver). */
export async function listarTextosDeEmail(banco: Banco) {
  const db = comoLibsql(banco)
  const editados = new Map(
    (await db.select().from(textoDeEmail)).map((l) => [l.tipo, l]),
  )
  return MODELOS_DE_EMAIL.map((m) => {
    const editado = editados.get(m.tipo)
    return {
      tipo: m.tipo,
      nome: m.nome,
      destino: m.destino,
      quando: m.quando,
      editavel: m.editavel,
      descadastro: m.descadastro,
      variaveis: Object.entries(m.variaveis).map(([nome, v]) => ({
        nome,
        descricao: v.descricao,
      })),
      padrao: { assunto: m.assunto, corpo: m.corpo },
      vigente: editado
        ? { assunto: editado.assunto, corpo: editado.corpo }
        : { assunto: m.assunto, corpo: m.corpo },
      editado: Boolean(editado),
    }
  })
}

export async function salvarTextoDeEmail(
  banco: Banco,
  agora: Relogio,
  entrada: { tipo: string; assunto: string; corpo: string; autorId: string },
): Promise<void> {
  const db = comoLibsql(banco)
  const modelo = modeloDe(entrada.tipo)
  const texto = validarTexto(modelo, entrada)
  await db
    .insert(textoDeEmail)
    .values({
      tipo: modelo.tipo,
      ...texto,
      atualizadoPor: entrada.autorId,
      atualizadoEm: agora(),
    })
    .onConflictDoUpdate({
      target: textoDeEmail.tipo,
      set: { ...texto, atualizadoPor: entrada.autorId, atualizadoEm: agora() },
    })
}

/** Volta ao texto padrão. */
export async function restaurarTextoDeEmail(
  banco: Banco,
  tipo: string,
): Promise<void> {
  const db = comoLibsql(banco)
  await db
    .delete(textoDeEmail)
    .where(eq(textoDeEmail.tipo, modeloDe(tipo).tipo))
}

/** Prévia de um texto ainda não salvo (valida igual ao salvar). */
export function previaDeTexto(tipo: string, texto: TextoDeEmail) {
  const modelo = modeloDe(tipo)
  return previaDoEmail(modelo, validarTexto(modelo, texto))
}

// ---------- Dados para montar pedidos de e-mail ----------

/** Nome e e-mail do aluno para um e-mail pedido pela Equipe ("Não recebi"). Nulo se não existe. */
export async function alunoParaEmail(
  banco: Banco,
  userId: string,
): Promise<{ id: string; nome: string; email: string } | null> {
  const [aluno] = await comoLibsql(banco)
    .select({ id: user.id, nome: user.name, email: user.email })
    .from(user)
    .where(eq(user.id, userId))
  return aluno ?? null
}

/** Os nomes que o aviso "Curso liberado" cita; nulos se a pessoa ou o curso já não existem. */
export async function nomesDaLiberacao(
  banco: Banco,
  entrada: { userId: string; cursoId: string },
): Promise<{ aluno: string | null; curso: string | null }> {
  const db = comoLibsql(banco)
  const [[aluno], [cursoDele]] = await Promise.all([
    db
      .select({ nome: user.name })
      .from(user)
      .where(eq(user.id, entrada.userId)),
    db
      .select({ nome: curso.nome })
      .from(curso)
      .where(eq(curso.id, entrada.cursoId)),
  ])
  return { aluno: aluno?.nome ?? null, curso: cursoDele?.nome ?? null }
}

/** Cursos pelo id, na ordem da vitrine (e alfabética dentro do mesmo lugar). Id que não existe mais some. */
export async function cursosDaLiberacao(
  banco: Banco,
  cursoIds: string[],
): Promise<{ id: string; nome: string }[]> {
  if (cursoIds.length === 0) return []
  return comoLibsql(banco)
    .select({ id: curso.id, nome: curso.nome })
    .from(curso)
    .where(inArray(curso.id, cursoIds))
    .orderBy(asc(curso.ordem), asc(curso.nome))
}
