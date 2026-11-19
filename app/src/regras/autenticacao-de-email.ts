// Decide se o remetente de um e-mail recebido pode ser tratado como dono do endereço do From.
// Sem isso, qualquer um forja o From de um aluno e escreve na conversa dele. A decisão vem do
// cabeçalho `Authentication-Results` que o Email Routing da Cloudflare acrescenta na entrada.

/**
 * Valor do PRIMEIRO cabeçalho `Authentication-Results` do e-mail bruto (o mais acima, que o servidor
 * receptor acrescenta). Os seguintes podem ter sido postos pelo remetente e são ignorados. Lê só o
 * bloco de cabeçalhos (até a primeira linha vazia) e desdobra as linhas de continuação.
 */
export function primeiroAuthenticationResults(
  bruto: ArrayBuffer | Uint8Array,
): string | null {
  const bytes = bruto instanceof Uint8Array ? bruto : new Uint8Array(bruto)
  const texto = new TextDecoder('latin1').decode(bytes)
  const fim = texto.search(/\r?\n\r?\n/)
  const cabecalhos = fim === -1 ? texto : texto.slice(0, fim)
  const linhas = cabecalhos.split(/\r?\n/)
  for (let i = 0; i < linhas.length; i++) {
    const m = /^authentication-results[ \t]*:(.*)$/i.exec(linhas[i])
    if (!m) continue
    let valor = m[1]
    while (i + 1 < linhas.length && /^[ \t]/.test(linhas[i + 1])) {
      i++
      valor += ` ${linhas[i].trim()}`
    }
    return valor.trim()
  }
  return null
}

function resultadoDe(cabecalho: string, metodo: string): string[] {
  const achados: string[] = []
  const regex = new RegExp(`(?:^|[\\s;])${metodo}=([a-z]+)([^;]*)`, 'gi')
  for (const m of cabecalho.matchAll(regex)) {
    achados.push(`${m[1].toLowerCase()}${m[2]}`)
  }
  return achados
}

/**
 * `true` quando o DMARC passou. Sem nenhum resultado de DMARC, vale um DKIM que passou com o
 * domínio assinante igual ao do From. Qualquer outra coisa (sem cabeçalho, falha, neutro) é `false`.
 */
export function remetenteAutenticado(
  autenticacao: string | null | undefined,
  de: string,
): boolean {
  if (!autenticacao) return false
  const dmarc = resultadoDe(autenticacao, 'dmarc')
  if (dmarc.length > 0) return dmarc.some((r) => r.startsWith('pass'))
  const dominioDoFrom = de.trim().toLowerCase().split('@').pop()
  if (!dominioDoFrom) return false
  return resultadoDe(autenticacao, 'dkim').some((r) => {
    if (!r.startsWith('pass')) return false
    const dominio = /header\.d=([^\s;]+)/i.exec(r)?.[1]?.toLowerCase()
    return dominio === dominioDoFrom
  })
}
