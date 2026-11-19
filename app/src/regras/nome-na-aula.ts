import { escapeHtml } from '#/lib/email-templates'

/** A variável da Memberkit (`first_name`) ou do Typebot (`name`) que o texto traz. */
const VARIAVEL = /(\s*)\{\{\s*(?:first_name|name)\s*\}\}(?:(\s*[,;:])(\s*))?/g

/** Primeiro nome de quem vê a aula; vazio quando não há nome cadastrado. */
export function primeiroNome(nome: string | null | undefined): string {
  return nome?.trim().split(/\s+/)[0] ?? ''
}

// Troca `{{ first_name }}` (com ou sem espaços nas chaves) pelo primeiro nome, escapado como HTML.
// O texto fica no banco como veio; só a exibição é personalizada. Outras `{{ ... }}` não mudam.
// Sem nome, a variável some junto com o espaço antes dela (e com a vírgula, se ela abria o trecho).
export function personalizarTexto(
  html: string,
  nome: string | null | undefined,
): string {
  return trocarNome(html, nome, escapeHtml)
}

/**
 * Igual a `personalizarTexto`, para texto puro (mensagens da conversa do quiz, que o React já escapa).
 * Sem nome, a mensagem que começava pela variável passa a começar em maiúscula.
 */
export function personalizarMensagem(
  texto: string,
  nome: string | null | undefined,
): string {
  const trocado = trocarNome(texto, nome, (x) => x)
  if (primeiroNome(nome) || !/^\s*\{\{/.test(texto)) return trocado
  return trocado.charAt(0).toUpperCase() + trocado.slice(1)
}

function trocarNome(
  html: string,
  nome: string | null | undefined,
  escapar: (x: string) => string,
): string {
  const primeiro = primeiroNome(nome)
  return html.replace(
    VARIAVEL,
    (
      _todo,
      espaco: string,
      pontuacao: string | undefined,
      depois: string | undefined,
      posicao: number,
    ) => {
      if (primeiro) {
        return `${espaco}${escapar(primeiro)}${pontuacao ?? ''}${depois ?? ''}`
      }
      if (!pontuacao) return ''
      const abreTrecho = posicao === 0 || html[posicao - 1] === '>'
      return abreTrecho ? '' : `${pontuacao.trimStart()}${depois ?? ''}`
    },
  )
}
