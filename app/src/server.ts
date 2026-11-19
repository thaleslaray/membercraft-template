import handler from '@tanstack/react-start/server-entry'
import {
  bookmarkFromRequest,
  runWithD1Session,
  withD1Bookmark,
} from '#/db/d1-session'
import {
  D1_TRACE_HEADER,
  montarRegistroPerf,
  nomeDaServerFn,
  rastrearD1,
} from '#/db/d1-trace'
import { avisarTecnico } from '#/lib/alerta'
import { receberEmailDoSuporte } from '#/lib/atendimento-cola'
import { despacharCron } from '#/lib/cron'
import { consumirLote } from '#/lib/fila-consumidores'
import { isCrossSiteServerFnCall } from '#/lib/same-origin'
import { criarNonce, withSecurityHeaders } from '#/lib/security-headers'

export default {
  async fetch(request, env) {
    // Server functions só aceitam chamadas da própria origem (defesa contra CSRF).
    if (isCrossSiteServerFnCall(request)) {
      return withSecurityHeaders(
        new Response('Requisição cross-site recusada.', { status: 403 }),
        request,
      )
    }
    // Nonce da Content-Security-Policy: gerado aqui, entregue ao router pelo cabeçalho interno
    // `x-csp-nonce` (que o cliente não controla: é sempre sobrescrito) e usado na política da resposta.
    const nonce = criarNonce()
    const interno = new Headers(request.headers)
    interno.set('x-csp-nonce', nonce)
    // Uma sessão D1 por pedido (Sessions API), compartilhada por todo `getDb` chamado durante ele.
    // O cookie `d1-bookmark` do pedido anterior faz quem acabou de escrever ler a própria escrita,
    // mesmo vindo de uma réplica. Cron, filas e e-mail ficam sem sessão (D1 direto, no primário).
    const sessaoD1 = env.DB.withSession(
      bookmarkFromRequest(request) ?? 'first-unconstrained',
    )
    // Dois modos de rastreio das idas ao D1 (veja `src/db/d1-trace.ts`): `PERF_LOG=1` em qualquer
    // ambiente (uma linha JSON por pedido) ou, só em dev, o header `x-d1-trace: 1` (uma linha por consulta).
    const perfLigado = (env as { PERF_LOG?: string }).PERF_LOG === '1'
    const caminho = new URL(request.url).pathname
    const rastro =
      perfLigado ||
      (import.meta.env.DEV && request.headers.get(D1_TRACE_HEADER) === '1')
        ? rastrearD1(sessaoD1, `${request.method} ${caminho}`, !perfLigado)
        : null
    const inicioDoPedido = performance.now()
    const respostaBruta = await runWithD1Session(
      rastro?.sessao ?? sessaoD1,
      () => handler.fetch(new Request(request, { headers: interno })),
    )
    // Tempo até o handler devolver a Response (o corpo em streaming não entra).
    const msDoPedido = performance.now() - inicioDoPedido
    if (perfLigado) {
      const idas = rastro?.idas() ?? []
      const html = respostaBruta.headers
        .get('content-type')
        ?.includes('text/html')
      // Asset e imagem sem ida ao banco não geram linha.
      if (idas.length > 0 || html || nomeDaServerFn(caminho) !== null) {
        console.log(
          JSON.stringify(
            montarRegistroPerf({
              metodo: request.method,
              url: request.url,
              referer: request.headers.get('referer'),
              status: respostaBruta.status,
              ms: msDoPedido,
              idas,
              colo: (request as { cf?: { colo?: string } }).cf?.colo,
            }),
          ),
        )
      }
    } else {
      rastro?.fim()
    }
    const resposta = withD1Bookmark(respostaBruta, sessaoD1, request)
    const ehHtml = resposta.headers.get('content-type')?.includes('text/html')
    return withSecurityHeaders(
      resposta,
      request,
      ehHtml
        ? {
            nonce,
            r2Origem: env.R2_ACCOUNT_ID
              ? `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`
              : undefined,
          }
        : {},
    )
  },
  // Cron: `event.cron` diz qual horário disparou.
  async scheduled(event, env, ctx) {
    console.log('[cron]', event.cron)
    ctx.waitUntil(
      despacharCron(event.cron, env)
        .then((result) => console.log('[cron] resultado:', result))
        .catch((erro) => {
          console.error('[cron] falhou', erro)
          return avisarTecnico({
            origem: 'tarefa',
            detalhe: `cron ${event.cron}: ${erro instanceof Error ? erro.message : String(erro)}`,
          })
        }),
    )
  },
  // Email Routing: o que chega em suporte@ e help@ entra no Atendimento (#58).
  async email(message, env) {
    await receberEmailDoSuporte(env, message)
  },
  // Consumidor das filas (Voomp, e-mail, PDF e a de mortos): o mapa está em `src/lib/fila-consumidores.ts`.
  async queue(batch, env) {
    await consumirLote(batch, env)
  },
} satisfies ExportedHandler<Env, unknown>
