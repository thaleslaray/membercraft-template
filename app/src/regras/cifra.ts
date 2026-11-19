// Cifra dos segredos guardados no D1 (credenciais da Hotmart, #129): AES-GCM do Web Crypto.
// A chave é um segredo do Worker (`HOTMART_CHAVE_DE_CIFRA`); aqui ela vira 256 bits por SHA-256.
// Formato gravado: `v1.<iv em base64>.<texto cifrado em base64>`.

export class ErroDeCifra extends Error {
  constructor(mensagem: string) {
    super(mensagem)
    this.name = 'ErroDeCifra'
  }
}

const TAMANHO_MINIMO_DA_CHAVE = 32

const paraBase64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes))
const deBase64 = (texto: string) =>
  Uint8Array.from(atob(texto), (c) => c.charCodeAt(0))

async function chaveDe(segredo: string | undefined): Promise<CryptoKey> {
  if (!segredo || segredo.length < TAMANHO_MINIMO_DA_CHAVE) {
    throw new ErroDeCifra(
      `A chave de cifra não está configurada (mínimo de ${TAMANHO_MINIMO_DA_CHAVE} caracteres).`,
    )
  }
  const bytes = new TextEncoder().encode(segredo)
  const resumo = await crypto.subtle.digest('SHA-256', bytes)
  return crypto.subtle.importKey('raw', resumo, 'AES-GCM', false, [
    'encrypt',
    'decrypt',
  ])
}

export async function cifrar(
  texto: string,
  segredo: string | undefined,
): Promise<string> {
  const chave = await chaveDe(segredo)
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const cifrado = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    chave,
    new TextEncoder().encode(texto),
  )
  return `v1.${paraBase64(iv)}.${paraBase64(new Uint8Array(cifrado))}`
}

export async function decifrar(
  valor: string,
  segredo: string | undefined,
): Promise<string> {
  const chave = await chaveDe(segredo)
  const [versao, iv, cifrado] = valor.split('.')
  if (versao !== 'v1' || !iv || !cifrado) {
    throw new ErroDeCifra('Valor cifrado em formato desconhecido.')
  }
  try {
    const aberto = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: deBase64(iv) },
      chave,
      deBase64(cifrado),
    )
    return new TextDecoder().decode(aberto)
  } catch {
    throw new ErroDeCifra(
      'Não foi possível abrir o valor cifrado (chave errada ou dado alterado).',
    )
  }
}
