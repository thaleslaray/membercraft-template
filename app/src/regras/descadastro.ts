// Link de descadastro: `?u=<aluno>&t=<tipo>&s=<assinatura>`. A assinatura (HMAC-SHA256 do par aluno+tipo,
// com o segredo do app) impede desligar o e-mail de outra pessoa adivinhando o endereço.

const encoder = new TextEncoder()

async function chave(segredo: string) {
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(segredo),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
}

function emBase64Url(bytes: ArrayBuffer): string {
  let texto = ''
  for (const b of new Uint8Array(bytes)) texto += String.fromCharCode(b)
  return btoa(texto)
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '')
}

export async function assinarDescadastro(
  segredo: string,
  userId: string,
  tipo: string,
): Promise<string> {
  const assinatura = await crypto.subtle.sign(
    'HMAC',
    await chave(segredo),
    encoder.encode(`descadastro:${userId}:${tipo}`),
  )
  return emBase64Url(assinatura)
}

export async function descadastroValido(
  segredo: string,
  userId: string,
  tipo: string,
  assinatura: string,
): Promise<boolean> {
  const esperada = await assinarDescadastro(segredo, userId, tipo)
  if (esperada.length !== assinatura.length) return false
  let diferenca = 0
  for (let i = 0; i < esperada.length; i++) {
    diferenca |= esperada.charCodeAt(i) ^ assinatura.charCodeAt(i)
  }
  return diferenca === 0
}

export async function linkDeDescadastro(
  baseUrl: string,
  segredo: string,
  userId: string,
  tipo: string,
): Promise<string> {
  const q = new URLSearchParams({
    u: userId,
    t: tipo,
    s: await assinarDescadastro(segredo, userId, tipo),
  })
  return `${baseUrl.replace(/\/$/, '')}/descadastrar?${q}`
}
