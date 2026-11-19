import { eq } from 'drizzle-orm'
import { defaultTheme, isThemeId, type ThemeId } from '#/config/themes'
import { aparencia as tabelaAparencia } from '#/db/schema'
import type { Banco, Relogio } from '#/regras/tipos'

/**
 * Aparência da área (#63): o que o Proprietário escolhe no Estúdio e vale para
 * todos os alunos. Uma linha só na tabela `aparencia` (id `padrao`); sem a linha,
 * vale `aparenciaPadrao`. As imagens vivem no R2 e aqui só entra a URL servida
 * pela própria área (`/api/aparencia/arquivo/...`), nunca um endereço externo.
 */

/** O jeito da área do aluno: a casca atual ou a Lume (topo transparente, capas grandes). */
export type CascaDoAluno = 'classica' | 'lume'

export const cascasDoAluno: readonly CascaDoAluno[] = ['classica', 'lume']

export function ehCascaDoAluno(valor: unknown): valor is CascaDoAluno {
  return (
    typeof valor === 'string' && (cascasDoAluno as string[]).includes(valor)
  )
}

export type Aparencia = {
  tema: ThemeId
  /** Estilo da área do aluno; sem escolha vale a clássica. */
  casca: CascaDoAluno
  /** Aba Comunidade no menu do aluno; desligada, "Falar com a equipe" ocupa o lugar. */
  mostrarComunidade: boolean
  /** Hex `#rrggbb` minúsculo; nulo = a cor do próprio tema. */
  corDaMarca: string | null
  logoUrl: string | null
  faviconUrl: string | null
  fundoDoMenuUrl: string | null
  fundoDoLoginUrl: string | null
  atualizadoEm: Date | null
}

export type DadosDeAparencia = Partial<Omit<Aparencia, 'atualizadoEm'>>

export const aparenciaPadrao: Aparencia = {
  tema: defaultTheme,
  casca: 'classica',
  mostrarComunidade: true,
  corDaMarca: null,
  logoUrl: null,
  faviconUrl: null,
  fundoDoMenuUrl: null,
  fundoDoLoginUrl: null,
  atualizadoEm: null,
}

const ID = 'padrao'

/** Prefixo das URLs de imagem que a área serve a partir do R2 (src/routes/api/aparencia/$.ts). */
export const PREFIXO_DE_ARQUIVO = '/api/aparencia/arquivo/'

const HEX = /^#[0-9a-f]{6}$/i

export class ErroDeAparencia extends Error {
  constructor(mensagem: string) {
    super(mensagem)
    this.name = 'ErroDeAparencia'
  }
}

export async function lerAparencia(db: Banco): Promise<Aparencia> {
  const linha = await db.query.aparencia.findFirst({
    where: eq(tabelaAparencia.id, ID),
  })
  if (!linha) return aparenciaPadrao
  return {
    tema: isThemeId(linha.tema) ? linha.tema : defaultTheme,
    casca: ehCascaDoAluno(linha.casca) ? linha.casca : 'classica',
    mostrarComunidade: linha.mostrarComunidade,
    corDaMarca: linha.corDaMarca,
    logoUrl: linha.logoUrl,
    faviconUrl: linha.faviconUrl,
    fundoDoMenuUrl: linha.fundoDoMenuUrl,
    fundoDoLoginUrl: linha.fundoDoLoginUrl,
    atualizadoEm: linha.atualizadoEm,
  }
}

function normalizarCor(valor: string | null | undefined): string | null {
  if (valor == null || valor === '') return null
  if (!HEX.test(valor)) {
    throw new ErroDeAparencia('A cor da marca precisa ser um hex como #1f4d3a.')
  }
  return valor.toLowerCase()
}

function normalizarUrl(
  valor: string | null | undefined,
  campo: string,
): string | null {
  if (valor == null || valor === '') return null
  if (!valor.startsWith(PREFIXO_DE_ARQUIVO) || valor.includes('..')) {
    throw new ErroDeAparencia(
      `A imagem de ${campo} precisa ter sido enviada pela própria área.`,
    )
  }
  return valor
}

/** Salva o que veio e mantém o resto. Campo com `null` limpa; campo ausente fica. */
export async function salvarAparencia(
  db: Banco,
  relogio: Relogio,
  dados: DadosDeAparencia,
  autorId?: string,
): Promise<Aparencia> {
  const atual = await lerAparencia(db)
  if (dados.tema !== undefined && !isThemeId(dados.tema)) {
    throw new ErroDeAparencia('Tema desconhecido.')
  }
  if (dados.casca !== undefined && !ehCascaDoAluno(dados.casca)) {
    throw new ErroDeAparencia('Estilo da área do aluno desconhecido.')
  }
  const proxima = {
    tema: dados.tema ?? atual.tema,
    casca: dados.casca ?? atual.casca,
    mostrarComunidade: dados.mostrarComunidade ?? atual.mostrarComunidade,
    corDaMarca:
      dados.corDaMarca !== undefined
        ? normalizarCor(dados.corDaMarca)
        : atual.corDaMarca,
    logoUrl:
      dados.logoUrl !== undefined
        ? normalizarUrl(dados.logoUrl, 'logo')
        : atual.logoUrl,
    faviconUrl:
      dados.faviconUrl !== undefined
        ? normalizarUrl(dados.faviconUrl, 'favicon')
        : atual.faviconUrl,
    fundoDoMenuUrl:
      dados.fundoDoMenuUrl !== undefined
        ? normalizarUrl(dados.fundoDoMenuUrl, 'fundo do menu')
        : atual.fundoDoMenuUrl,
    fundoDoLoginUrl:
      dados.fundoDoLoginUrl !== undefined
        ? normalizarUrl(dados.fundoDoLoginUrl, 'fundo do login')
        : atual.fundoDoLoginUrl,
  }
  const atualizadoEm = relogio()
  await db
    .insert(tabelaAparencia)
    .values({
      id: ID,
      ...proxima,
      atualizadoEm,
      atualizadoPor: autorId ?? null,
    })
    .onConflictDoUpdate({
      target: tabelaAparencia.id,
      set: { ...proxima, atualizadoEm, atualizadoPor: autorId ?? null },
    })
  return { ...proxima, atualizadoEm }
}

/** Volta ao padrão do Estúdio: apaga a linha (os arquivos no R2 ficam, são baratos). */
export async function restaurarPadrao(
  db: Banco,
  _relogio: Relogio,
  _autorId?: string,
): Promise<Aparencia> {
  await db.delete(tabelaAparencia).where(eq(tabelaAparencia.id, ID))
  return aparenciaPadrao
}
