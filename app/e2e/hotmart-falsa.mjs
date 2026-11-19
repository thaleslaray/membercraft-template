// Servidor falso da API da Hotmart para o e2e (nunca fala com a Hotmart de verdade).
// Sobe na porta PORTA_DA_HOTMART_FALSA e responde, no formato da doc (snapshots da skill docs-hotmart):
//   POST /security/oauth/token
//   GET  /products/api/v1/products            (duas páginas, cursor em page_token)
//   GET  /products/api/v1/products/:ucode/offers
import { createServer } from 'node:http'

const porta = Number(process.env.PORTA_DA_HOTMART_FALSA) || 3041

const produtos = [
  [
    {
      id: 698441,
      name: 'Curso Falso A',
      ucode: 'f2b3be1f-313f-4a2d-b5b7-1c39d67dd3ee',
      status: 'ACTIVE',
      format: 'ONLINE_COURSE',
      is_subscription: false,
    },
    {
      id: 1117869,
      name: 'Assinatura Falsa',
      ucode: '26a97448-2ac2-458d-9e03-bcc01e82bdd8',
      status: 'ACTIVE',
      format: 'ONLINE_COURSE',
      is_subscription: true,
    },
  ],
  [
    {
      id: 4319408,
      name: 'Combo Falso',
      ucode: 'e211d636-dd19-4411-9397-ab3428e966a2',
      status: 'ACTIVE',
      format: 'BUNDLE',
      is_subscription: false,
    },
  ],
]

const ofertas = {
  'f2b3be1f-313f-4a2d-b5b7-1c39d67dd3ee': [
    {
      code: '02mhofjd',
      name: 'Oferta principal falsa',
      is_main_offer: true,
      payment_mode: 'PAY_IN_FULL',
      price: { value: 97, currency_code: 'BRL' },
    },
    {
      code: 'bf2026x',
      name: 'Black Friday falsa',
      is_main_offer: false,
      payment_mode: 'PAY_IN_FULL',
      price: { value: 67, currency_code: 'BRL' },
    },
  ],
}

const json = (res, corpo, status = 200) => {
  res.writeHead(status, { 'content-type': 'application/json' })
  res.end(JSON.stringify(corpo))
}

// Histórico de vendas (GET /payments/api/v1/sales/history): o teste combina os itens com
// POST /__historico (corpo = array de itens no formato da doc). A resposta filtra por
// transaction_status (padrão APPROVED/COMPLETE, como a API) e pela janela start_date/end_date.
let historico = []

createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${porta}`)
  if (url.pathname === '/health') return json(res, { ok: true })
  if (url.pathname === '/__historico' && req.method === 'POST') {
    let corpo = ''
    req.on('data', (c) => {
      corpo += c
    })
    req.on('end', () => {
      historico = JSON.parse(corpo)
      json(res, { ok: true, itens: historico.length })
    })
    return
  }
  if (url.pathname === '/security/oauth/token') {
    return json(res, {
      access_token: 'token-falso-de-e2e',
      token_type: 'bearer',
      expires_in: 172799,
    })
  }
  if (req.headers.authorization !== 'Bearer token-falso-de-e2e') {
    return json(res, { error: 'unauthorized' }, 401)
  }
  if (url.pathname === '/payments/api/v1/sales/history') {
    const status = url.searchParams.get('transaction_status')
    const de = Number(url.searchParams.get('start_date')) || 0
    const ate = Number(url.searchParams.get('end_date')) || Number.MAX_VALUE
    const itens = historico.filter((i) => {
      const quando = i.purchase.approved_date ?? i.purchase.order_date
      const statusOk = status
        ? i.purchase.status === status
        : ['APPROVED', 'COMPLETE'].includes(i.purchase.status)
      return statusOk && quando >= de && quando < ate
    })
    return json(res, {
      items: itens,
      page_info: { total_results: itens.length, results_per_page: 500 },
    })
  }
  if (url.pathname === '/products/api/v1/products') {
    const pagina = url.searchParams.get('page_token') === 'pagina-2' ? 1 : 0
    return json(res, {
      items: produtos[pagina],
      page_info: {
        next_page_token: pagina === 0 ? 'pagina-2' : null,
        prev_page_token: pagina === 0 ? null : 'pagina-1',
        results_per_page: produtos[pagina].length,
      },
    })
  }
  const m = url.pathname.match(
    /^\/products\/api\/v1\/products\/([^/]+)\/offers$/,
  )
  if (m) {
    return json(res, {
      items: ofertas[m[1]] ?? [],
      page_info: { next_page_token: null, results_per_page: 2 },
    })
  }
  json(res, { error: 'not found' }, 404)
}).listen(porta, () => console.log(`Hotmart falsa na porta ${porta}`))
