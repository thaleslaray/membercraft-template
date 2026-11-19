import { eq } from 'drizzle-orm'

import { user } from '#/db/schema'
import { FUSO_PADRAO, fusoValido } from '#/lib/datas'
import type { Banco, Relogio } from '#/regras/tipos'

/**
 * Minha conta (#64): os dados que o aluno cuida sozinho (nome, foto, telefone, fuso horário, bio)
 * e o estado do tour de primeiro acesso. Tudo vive em colunas do `user`.
 */

export class ErroDeMinhaConta extends Error {
  constructor(mensagem: string) {
    super(mensagem)
    this.name = 'ErroDeMinhaConta'
  }
}

export const TAMANHO_MAXIMO_DA_BIO = 500
export const TAMANHO_MAXIMO_DA_FOTO = 2 * 1024 * 1024

/** Prefixo das fotos que a área serve do R2 (src/routes/api/fotos/$.ts). */
export const PREFIXO_DA_FOTO = '/api/fotos/arquivo/'

const TIPOS_DE_FOTO: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
}

export type DadosDaConta = {
  nome: string
  telefone: string | null
  /** Nome IANA; nulo = Brasília. */
  fusoHorario: string | null
  bio: string | null
  /** Endereço da foto servida pela área; nulo = sem foto. */
  foto: string | null
  tourVistoEm: Date | null
  /** A próxima aula começa sozinha depois de alguns segundos (a aluna pode desligar). */
  proximaAulaSozinha: boolean
}

export type EntradaDaConta = {
  nome?: string
  telefone?: string | null
  fusoHorario?: string | null
  bio?: string | null
  proximaAulaSozinha?: boolean
}

/** Motivo da recusa em pt-BR, ou nulo quando a foto serve. */
export function validarFoto({
  tipo,
  tamanho,
}: {
  tipo: string
  tamanho: number
}): string | null {
  if (!(tipo in TIPOS_DE_FOTO)) return 'Envie a foto em PNG, JPEG, WebP ou GIF.'
  if (tamanho > TAMANHO_MAXIMO_DA_FOTO) {
    return 'A foto pode ter no máximo 2 MB.'
  }
  return null
}

/** Nome único da foto no R2: o aluno, o instante e a extensão pelo tipo. */
export function nomeDaFoto(
  userId: string,
  tipo: string,
  relogio: Relogio,
): string {
  const extensao = TIPOS_DE_FOTO[tipo] ?? 'bin'
  return `${userId}-${relogio().getTime()}.${extensao}`
}

/** Só entra como foto o que a própria área serviu (nada de endereço externo). */
export function fotoValida(valor: string): boolean {
  return (
    valor.startsWith(PREFIXO_DA_FOTO) &&
    !valor.includes('..') &&
    !valor.slice(PREFIXO_DA_FOTO.length).includes('/')
  )
}

// Telefone: aceita +, espaços, parênteses e traços, e guarda só +dígitos (8 a 15 dígitos).
export function normalizarTelefone(valor: string | null | undefined) {
  const texto = (valor ?? '').trim()
  if (!texto) return null
  if (!/^\+?[\d\s().-]+$/.test(texto)) {
    throw new ErroDeMinhaConta(
      'Telefone só pode ter números, espaço e + ( ) -.',
    )
  }
  const digitos = texto.replace(/\D/g, '')
  if (digitos.length < 8 || digitos.length > 15) {
    throw new ErroDeMinhaConta('Confira o telefone: use DDD e o número.')
  }
  return `${texto.startsWith('+') ? '+' : ''}${digitos}`
}

export async function lerMinhaConta(
  db: Banco,
  userId: string,
): Promise<DadosDaConta> {
  const [u] = await db.select().from(user).where(eq(user.id, userId))
  if (!u) throw new ErroDeMinhaConta('Usuário não encontrado.')
  return {
    nome: u.name,
    telefone: u.telefone,
    fusoHorario: u.fusoHorario,
    bio: u.bio,
    foto: u.image,
    tourVistoEm: u.tourVistoEm,
    proximaAulaSozinha: u.proximaAulaSozinha,
  }
}

/** Salva o que veio e mantém o resto. Texto vazio limpa o campo (menos o nome, que é obrigatório). */
export async function salvarMinhaConta(
  db: Banco,
  relogio: Relogio,
  userId: string,
  entrada: EntradaDaConta,
): Promise<DadosDaConta> {
  const mudancas: Partial<typeof user.$inferInsert> = {}

  if (entrada.nome !== undefined) {
    const nome = entrada.nome.trim()
    if (!nome) throw new ErroDeMinhaConta('Informe o seu nome.')
    if (nome.length > 120) throw new ErroDeMinhaConta('Nome longo demais.')
    mudancas.name = nome
  }
  if (entrada.telefone !== undefined) {
    mudancas.telefone = normalizarTelefone(entrada.telefone)
  }
  if (entrada.fusoHorario !== undefined) {
    const fuso = (entrada.fusoHorario ?? '').trim()
    if (fuso && !fusoValido(fuso)) {
      throw new ErroDeMinhaConta('Fuso horário desconhecido.')
    }
    // Brasília é o padrão: guardar nulo evita um valor "fixo" igual ao padrão.
    mudancas.fusoHorario = fuso && fuso !== FUSO_PADRAO ? fuso : null
  }
  if (entrada.bio !== undefined) {
    const bio = (entrada.bio ?? '').trim()
    if (bio.length > TAMANHO_MAXIMO_DA_BIO) {
      throw new ErroDeMinhaConta(
        `A bio pode ter no máximo ${TAMANHO_MAXIMO_DA_BIO} caracteres.`,
      )
    }
    mudancas.bio = bio || null
  }
  if (entrada.proximaAulaSozinha !== undefined) {
    mudancas.proximaAulaSozinha = entrada.proximaAulaSozinha
  }

  if (Object.keys(mudancas).length > 0) {
    await db
      .update(user)
      .set({ ...mudancas, updatedAt: relogio() })
      .where(eq(user.id, userId))
  }
  return lerMinhaConta(db, userId)
}

/** Troca (ou tira, com nulo) a foto. Só aceita endereço servido pela própria área. */
export async function definirFoto(
  db: Banco,
  relogio: Relogio,
  userId: string,
  foto: string | null,
): Promise<void> {
  if (foto !== null && !fotoValida(foto)) {
    throw new ErroDeMinhaConta('A foto precisa ter sido enviada pela área.')
  }
  await db
    .update(user)
    .set({ image: foto, updatedAt: relogio() })
    .where(eq(user.id, userId))
}

// ---- Tour de primeiro acesso ----

/** Mostra o tour sozinho enquanto o aluno não o viu nem pulou. */
export function deveMostrarOTour(conta: { tourVistoEm: Date | null }): boolean {
  return conta.tourVistoEm === null
}

/** Terminou ou pulou o tour: não abre mais sozinho (rever é sempre possível, em Minha conta). */
export async function marcarTourVisto(
  db: Banco,
  relogio: Relogio,
  userId: string,
): Promise<void> {
  await db
    .update(user)
    .set({ tourVistoEm: relogio() })
    .where(eq(user.id, userId))
}
