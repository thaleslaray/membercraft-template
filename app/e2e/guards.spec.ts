import { expect, test } from '@playwright/test'

test('/conta anônimo vai para /login com o redirect de volta', async ({
  page,
}) => {
  await page.goto('/conta')
  await expect(page).toHaveURL(/\/login\?redirect=%2Fconta$/)
  await expect(page.getByPlaceholder('voce@exemplo.com')).toBeVisible()
})

test('o Início anônimo vai para /login', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveURL(/\/login\?redirect=%2F$/)
})

test('as respostas trazem os cabeçalhos de segurança', async ({ request }) => {
  const response = await request.get('/')
  expect(response.headers()['x-content-type-options']).toBe('nosniff')
  expect(response.headers()['x-frame-options']).toBe('DENY')
  // Referrer-Policy compatível com embeds de vídeo (o Vimeo só libera por domínio com Referer).
  expect(response.headers()['referrer-policy']).toBe(
    'strict-origin-when-cross-origin',
  )
})

test('as páginas trazem a CSP: scripts só da origem e do nonce, só o Vimeo em frame', async ({
  page,
}) => {
  const violacoes: string[] = []
  page.on('console', (msg) => {
    if (/Content Security Policy/i.test(msg.text())) violacoes.push(msg.text())
  })
  const response = await page.goto('/login')
  const csp = response?.headers()['content-security-policy'] ?? ''
  expect(csp).toMatch(/script-src 'self' 'nonce-[^']+'/)
  expect(csp).not.toMatch(/script-src[^;]*'unsafe-inline'/)
  expect(csp).toContain("frame-src 'self' https://player.vimeo.com")
  // O nonce da política é o mesmo dos scripts inline (hidratação e tema): se não fosse, a página
  // não hidrataria e o formulário abaixo não responderia.
  const nonce = /'nonce-([^']+)'/.exec(csp)?.[1]
  expect(await page.locator(`script[nonce]`).count()).toBeGreaterThan(0)
  expect(nonce).toBeTruthy()
  await expect(page.getByPlaceholder('voce@exemplo.com')).toBeVisible()
  await page.getByPlaceholder('voce@exemplo.com').fill('x@exemplo.com')
  await expect(page.getByPlaceholder('voce@exemplo.com')).toHaveValue(
    'x@exemplo.com',
  )
  expect(violacoes).toEqual([])
})
