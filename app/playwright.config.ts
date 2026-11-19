import { defineConfig, devices } from '@playwright/test'

// Testes ponta a ponta contra o servidor de desenvolvimento real (workerd + D1 local).
// `npm run e2e` sobe `npm run dev` sozinho. A saída vai para e2e/.dev.log: é dali que
// o teste de login lê o código que o `vite dev` imprime no terminal. Veja e2e/README.md.
// Porta: 3040 por padrão (porta própria do projeto); `PORT=3017 npm run e2e` quando estiver ocupada.
// A mesma porta vai ao servidor (PORT e BETTER_AUTH_URL), sem depender do .dev.vars.
const port = Number(process.env.PORT) || 3040
// Servidor falso da API da Hotmart (e2e/hotmart-falsa.mjs): porta ao lado da do app.
const portaDaHotmartFalsa = port + 1

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  // Um servidor só, uma porta só: sem paralelismo entre arquivos.
  fullyParallel: false,
  // Testado `workers: 2` no CI (13/11): o D1 local dá SQLITE_BUSY ("database is locked") quando dois workers
  // semeiam ao mesmo tempo pelo wrangler; por isso segue 1.
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: `http://localhost:${port}`,
    actionTimeout: 15_000,
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'node e2e/hotmart-falsa.mjs',
      env: { PORTA_DA_HOTMART_FALSA: String(portaDaHotmartFalsa) },
      url: `http://localhost:${portaDaHotmartFalsa}/health`,
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      // Migra o D1 local ANTES de subir: o Playwright só chama o global-setup depois de a URL
      // responder, e a raiz (aparência) devolve 500 com o banco vazio. O global-setup fica
      // como segunda garantia (é idempotente).
      // Garante um VOOMP_WEBHOOK_TOKEN de teste no .dev.vars (o e2e das vendas manda o aviso com ele);
      // um valor que já esteja lá vale.
      command:
        "(grep -q '^HOTMART_CHAVE_DE_CIFRA=.' .dev.vars || printf '\\nHOTMART_CHAVE_DE_CIFRA=chave-de-e2e-da-hotmart-0123456789abcdef\\n' >> .dev.vars) && (grep -q '^VOOMP_WEBHOOK_TOKEN=.' .dev.vars || (grep -v '^VOOMP_WEBHOOK_TOKEN=' .dev.vars > .dev.vars.tmp; printf '\\nVOOMP_WEBHOOK_TOKEN=token-de-e2e\\n' >> .dev.vars.tmp; mv .dev.vars.tmp .dev.vars)) && npm run db:migrate:local && npm run dev > e2e/.dev.log 2>&1",
      env: {
        PORT: String(port),
        // Aponta a API da Hotmart para o servidor falso (passa pelo vite.config.ts; ver src/lib/hotmart-cliente.ts).
        HOTMART_URL_DE_TESTE: `http://localhost:${portaDaHotmartFalsa}`,
        BETTER_AUTH_URL: `http://localhost:${port}`,
      },
      url: `http://localhost:${port}/`,
      // Sempre sobe o próprio servidor: o login precisa do log em e2e/.dev.log.
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
})
