// Registro de ações sensíveis (GLOSSARY): quem da equipe fez o quê, e quando. Só o Proprietário lê
// (`ler-registro-de-acoes`). Cada fatia registra a sua ação com um nome fixo em `Acao`; a tela de
// leitura é a do Estúdio (#61).

import { and, count, desc, eq, gte, lte, type SQL } from 'drizzle-orm'
import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import type * as schema from '#/db/schema'
import { registroDeAcoes, user } from '#/db/schema'
import { fimDoDiaEmBrasilia, inicioDoDiaEmBrasilia } from '#/lib/datas'
import { deslocamento, montarPagina, POR_PAGINA } from '#/regras/paginacao'
import type { Banco, Relogio } from '#/regras/tipos'

export type AcaoRegistrada =
  | 'matricula-manual'
  | 'troca-de-email'
  | 'exportacao-csv'
  | 'conferencia-de-vendas'
  | 'equipe-adicionada'
  | 'equipe-perfil-trocado'
  | 'equipe-removida'
  | 'aluno-excluido'
  | 'pontos-avulsos'
  | 'certificado-revogado'
  | 'certificado-reemitido'
  | 'pedido-do-mec-liberado'
  | 'pedido-do-mec-problema'
  | 'pedido-do-mec-nova-tentativa'
  | 'boas-vindas-alterada'
  | 'credenciais-hotmart-trocadas'
  | 'edicao-excluida'
  | 'entrou-como'
  | 'saiu-de-entrar-como'

// Como a tela do registro chama cada ação. Ação sem rótulo aqui aparece com o nome gravado em
// palavras ("excluir-curso" vira "Excluir curso"), nunca com o hífen cru.
const ROTULOS: Record<AcaoRegistrada, string> = {
  'matricula-manual': 'Matrícula manual',
  'troca-de-email': 'Troca de e-mail',
  'conferencia-de-vendas': 'Conferência de vendas',
  'equipe-adicionada': 'Pessoa adicionada à equipe',
  'equipe-perfil-trocado': 'Perfil trocado',
  'equipe-removida': 'Pessoa removida da equipe',
  'aluno-excluido': 'Aluno excluído',
  'exportacao-csv': 'Exportação em CSV',
  'pontos-avulsos': 'Pontos avulsos',
  'certificado-revogado': 'Certificado revogado',
  'certificado-reemitido': 'Certificado reemitido',
  'pedido-do-mec-liberado': 'Pedido do MEC liberado',
  'pedido-do-mec-problema': 'Pedido do MEC com problema',
  'pedido-do-mec-nova-tentativa': 'Pedido do MEC: tentar de novo',
  'boas-vindas-alterada': 'Vídeo de boas-vindas alterado',
  'credenciais-hotmart-trocadas': 'Credenciais da Hotmart trocadas',
  'edicao-excluida': 'Edição excluída',
  'entrou-como': 'Entrou como aluna',
  'saiu-de-entrar-como': 'Saiu de entrar como aluna',
}
export function rotuloDaAcao(acao: string): string {
  const conhecido = (ROTULOS as Record<string, string>)[acao]
  if (conhecido) return conhecido
  const palavras = acao.replace(/[-_]+/g, ' ').trim()
  return palavras ? palavras[0].toUpperCase() + palavras.slice(1) : acao
}

export interface FiltrosDoRegistro {
  autorId?: string
  acao?: string
  /** Datas aaaa-mm-dd, em Brasília: do começo do primeiro dia ao fim do último. */
  de?: string
  ate?: string
}

function condicoesDoRegistro(filtros: FiltrosDoRegistro): SQL | undefined {
  const condicoes: SQL[] = []
  if (filtros.autorId)
    condicoes.push(eq(registroDeAcoes.autorId, filtros.autorId))
  if (filtros.acao) condicoes.push(eq(registroDeAcoes.acao, filtros.acao))
  const inicio = inicioDoDiaEmBrasilia(filtros.de)
  if (inicio) condicoes.push(gte(registroDeAcoes.criadoEm, inicio))
  const fim = fimDoDiaEmBrasilia(filtros.ate)
  if (fim) condicoes.push(lte(registroDeAcoes.criadoEm, fim))
  return condicoes.length ? and(...condicoes) : undefined
}

export interface EntradaDoRegistro {
  autorId: string | null
  acao: AcaoRegistrada
  detalhe?: Record<string, unknown>
}

// Devolve o INSERT sem executar, para entrar no mesmo `db.batch` da ação (tudo ou nada).
export function prepararRegistro(
  banco: Banco,
  agora: Relogio,
  entrada: EntradaDoRegistro,
) {
  const db = banco as LibSQLDatabase<typeof schema>
  return db.insert(registroDeAcoes).values({
    id: crypto.randomUUID(),
    autorId: entrada.autorId,
    acao: entrada.acao,
    detalhe: JSON.stringify(entrada.detalhe ?? {}),
    criadoEm: agora(),
  })
}

export async function registrarAcao(
  banco: Banco,
  agora: Relogio,
  entrada: EntradaDoRegistro,
): Promise<void> {
  await prepararRegistro(banco, agora, entrada)
}

export async function listarAcoes(banco: Banco, limite = 100) {
  const db = banco as LibSQLDatabase<typeof schema>
  return db
    .select()
    .from(registroDeAcoes)
    .orderBy(desc(registroDeAcoes.criadoEm))
    .limit(limite)
}

// Para a tela do registro: cada ação com o nome de quem a fez (nulo se a pessoa já foi excluída).
export async function listarAcoesComAutor(
  banco: Banco,
  pagina = 1,
  filtros: FiltrosDoRegistro = {},
) {
  const db = banco as LibSQLDatabase<typeof schema>
  const onde = condicoesDoRegistro(filtros)
  // A contagem e a página não dependem uma da outra: uma ida só.
  const [[{ total }], linhas] = await db.batch([
    db.select({ total: count() }).from(registroDeAcoes).where(onde),
    db
      .select({
        id: registroDeAcoes.id,
        acao: registroDeAcoes.acao,
        detalhe: registroDeAcoes.detalhe,
        criadoEm: registroDeAcoes.criadoEm,
        autorNome: user.name,
        autorEmail: user.email,
      })
      .from(registroDeAcoes)
      .leftJoin(user, eq(user.id, registroDeAcoes.autorId))
      .where(onde)
      .orderBy(desc(registroDeAcoes.criadoEm), desc(registroDeAcoes.id))
      .limit(POR_PAGINA)
      .offset(deslocamento(pagina)),
  ])
  return montarPagina(
    linhas.map((l) => ({
      ...l,
      rotulo: rotuloDaAcao(l.acao),
      detalhe: resumirDetalhe(lerDetalhe(l.detalhe)),
    })),
    total,
    pagina,
  )
}

// Opções dos filtros da tela: quem já fez alguma ação e que ações já foram feitas.
export async function opcoesDoRegistro(banco: Banco) {
  const db = banco as LibSQLDatabase<typeof schema>
  const [pessoas, acoes] = await db.batch([
    db
      .selectDistinct({ id: user.id, nome: user.name, email: user.email })
      .from(registroDeAcoes)
      .innerJoin(user, eq(user.id, registroDeAcoes.autorId)),
    db.selectDistinct({ acao: registroDeAcoes.acao }).from(registroDeAcoes),
  ])
  return {
    pessoas: pessoas
      .map((p) => ({ valor: p.id, rotulo: `${p.nome} (${p.email})` }))
      .sort((a, b) => a.rotulo.localeCompare(b.rotulo, 'pt-BR')),
    acoes: acoes
      .map((a) => ({ valor: a.acao, rotulo: rotuloDaAcao(a.acao) }))
      .sort((a, b) => a.rotulo.localeCompare(b.rotulo, 'pt-BR')),
  }
}

function lerDetalhe(texto: string): Record<string, unknown> {
  try {
    const valor: unknown = JSON.parse(texto)
    return valor && typeof valor === 'object' && !Array.isArray(valor)
      ? (valor as Record<string, unknown>)
      : {}
  } catch {
    return {}
  }
}

// O detalhe é JSON livre de cada ação: a tela mostra os campos simples como "chave: valor".
function resumirDetalhe(detalhe: Record<string, unknown>): string {
  return Object.entries(detalhe)
    .filter(([, v]) => ['string', 'number', 'boolean'].includes(typeof v))
    .map(([k, v]) => `${k}: ${String(v)}`)
    .join(' · ')
}
