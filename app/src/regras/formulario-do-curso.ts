// Conferência dos formulários de curso, módulo, turma e categoria no painel, antes de enviar: as
// mesmas mensagens e os mesmos limites que o servidor (`regras/conteudo.ts`, `lib/conteudo-fns.ts`),
// só que no próprio campo.
import type { ErrosDoFormulario } from '#/regras/painel'

/** Nome de curso, módulo, turma (edição) e categoria: no formulário (`maxLength`) e no servidor. */
export const LIMITE_DO_NOME = 200
/** Carga horária do curso, em horas inteiras. */
export const LIMITE_DA_CARGA_HORARIA = 10_000
/** Endereço da página de vendas. */
export const LIMITE_DA_URL_DE_VENDAS = 500

/** Nome obrigatório, com `rotulo` no meio da frase ("o nome do curso", "o nome do módulo"). */
export function validarNome(nome: string, rotulo: string): string | undefined {
  const limpo = nome.trim()
  if (!limpo) return `Informe o ${rotulo}.`
  if (limpo.length > LIMITE_DO_NOME) {
    return `O ${rotulo} pode ter no máximo ${LIMITE_DO_NOME} caracteres.`
  }
  return undefined
}

/** Mensagem do limite da carga horária, igual no formulário e no servidor. */
export const MENSAGEM_DA_CARGA_HORARIA = `A carga horária precisa ser um número inteiro de horas, de 0 a ${LIMITE_DA_CARGA_HORARIA.toLocaleString('pt-BR')}.`

/** Carga horária digitada: vazia vale (sem carga); senão, inteiro de 0 ao limite. */
export function validarCargaHoraria(texto: string): string | undefined {
  const limpo = texto.trim()
  if (limpo === '') return undefined
  const numero = Number(limpo)
  return Number.isInteger(numero) &&
    numero >= 0 &&
    numero <= LIMITE_DA_CARGA_HORARIA
    ? undefined
    : MENSAGEM_DA_CARGA_HORARIA
}

/** Endereço da página de vendas: vazio vale; senão, http(s) válido. */
export function validarUrlDeVendas(texto: string): string | undefined {
  const limpo = texto.trim()
  if (!limpo) return undefined
  if (limpo.length > LIMITE_DA_URL_DE_VENDAS) {
    return `A URL de vendas pode ter no máximo ${LIMITE_DA_URL_DE_VENDAS} caracteres.`
  }
  let url: URL
  try {
    url = new URL(limpo)
  } catch {
    return 'A URL de vendas não é um endereço válido.'
  }
  return url.protocol === 'https:' || url.protocol === 'http:'
    ? undefined
    : 'A URL de vendas precisa começar com https://.'
}

export function validarCurso(dados: {
  nome: string
  cargaHoraria: string
  urlDeVendas: string
  mostrarATodos: boolean
}): ErrosDoFormulario {
  const url = validarUrlDeVendas(dados.urlDeVendas)
  return {
    nome: validarNome(dados.nome, 'nome do curso'),
    cargaHoraria: validarCargaHoraria(dados.cargaHoraria),
    urlDeVendas:
      url ??
      (dados.mostrarATodos && !dados.urlDeVendas.trim()
        ? 'Para mostrar o curso a todos, informe a URL da página de vendas.'
        : undefined),
  }
}
