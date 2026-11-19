// Cabeçalhos de segurança das respostas dinâmicas (Worker). As páginas pré-renderizadas e os
// assets saem direto da camada de assets, sem passar pelo Worker: para eles vale `public/_headers`.
// Mantenha as duas listas em sincronia.
//
// Content-Security-Policy (spec: nenhum script de terceiros nas páginas logadas; frames só do Vimeo e, dentro
// do texto da aula, do YouTube, do Typebot e do TED).
// Cada resposta HTML do Worker recebe um nonce novo: o TanStack Start o aplica nos scripts inline de
// hidratação (`router.options.ssr.nonce`, em src/router.tsx) e o next-themes no script do tema. Scripts
// externos são só os do próprio build (`'self'`; o `@vimeo/player` vem empacotado). Sem 'unsafe-inline'
// em `script-src`.
//
// O que fica de fora de propósito, e por quê:
// - `style-src 'unsafe-inline'`: o Tailwind/shadcn/embla/sonner usam `style=""` e o tema da marca vai
//   num `<style>`; nonce não cobre atributo `style`. Estilo não executa código.
// - `fonts.googleapis.com` / `fonts.gstatic.com`: as fontes do tema (CSS e arquivos), sem script.
// - `img-src https:`: o HTML da aula pode trazer imagem externa (o `limparHtml` só aceita https).
// - As páginas servidas direto pela camada de assets (`public/_headers`) não passam pelo Worker, então
//   não têm nonce: o app não pré-renderiza páginas, e o shell logado é sempre SSR.
//
// Os demais cabeçalhos valem para as duas pontas. Mantenha `public/_headers` em sincronia.

export const SECURITY_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
  'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
}

const HSTS = 'max-age=63072000; includeSubDomains'

/** Nonce novo para cada resposta (16 bytes aleatórios em base64). */
export function criarNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  return btoa(String.fromCharCode(...bytes))
}

/**
 * A política de uma resposta HTML. `r2Origem` é a origem da URL assinada de upload do R2 (o navegador
 * envia a entrega do quiz direto para lá); sem ela, vale qualquer endereço do R2 da Cloudflare.
 */
export function montarCsp(nonce: string, r2Origem?: string): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}'`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' data: https://fonts.gstatic.com",
    "img-src 'self' data: blob: https:",
    `connect-src 'self' ${r2Origem ?? 'https://*.r2.cloudflarestorage.com'}`,
    "frame-src 'self' https://player.vimeo.com https://www.youtube-nocookie.com https://bot.typebot.io https://embed.ted.com",
    "media-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ')
}

export interface OpcoesDosCabecalhos {
  /** Com nonce, a resposta leva a Content-Security-Policy. */
  nonce?: string
  r2Origem?: string
}

/** Devolve a resposta com os cabeçalhos de segurança (HSTS só em https). */
export function withSecurityHeaders(
  res: Response,
  req: Request,
  opcoes: OpcoesDosCabecalhos = {},
): Response {
  // Respostas de redirect/WebSocket podem ter headers imutáveis: copia para uma nova Response.
  const headers = new Headers(res.headers)
  // Só preenche o que falta: uma rota que já definiu o cabeçalho sabe o que quer.
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    if (!headers.has(name)) headers.set(name, value)
  }
  if (opcoes.nonce && !headers.has('Content-Security-Policy')) {
    headers.set(
      'Content-Security-Policy',
      montarCsp(opcoes.nonce, opcoes.r2Origem),
    )
  }
  if (
    new URL(req.url).protocol === 'https:' &&
    !headers.has('Strict-Transport-Security')
  ) {
    headers.set('Strict-Transport-Security', HSTS)
  }
  return new Response(res.body, {
    status: res.status,
    statusText: res.statusText,
    headers,
    // Preserva o upgrade de WebSocket (101), que se perde ao reconstruir a Response.
    webSocket: (res as Response & { webSocket?: unknown }).webSocket,
  } as ResponseInit)
}
