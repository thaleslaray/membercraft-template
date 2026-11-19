import { cloudflare } from '@cloudflare/vite-plugin'
import tailwindcss from '@tailwindcss/vite'
import { devtools } from '@tanstack/devtools-vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

// O zod só valida as server functions (`.validator(...)`), e isso roda no servidor: o
// TanStack Start deixa a chamada `z.object(...)` no módulo do navegador, que então
// baixaria ~25 KB gzip à toa. No ambiente do navegador, `zod` vira um objeto que aceita
// qualquer chamada e devolve a si mesmo. Ninguém no navegador usa o resultado.
// Se um dia o navegador precisar validar de verdade, tire este plugin.
function zodForaDoNavegador(): Plugin {
  const id = '\0zod-vazio'
  return {
    name: 'zod-fora-do-navegador',
    enforce: 'pre',
    applyToEnvironment: (env) => env.name === 'client',
    resolveId: (origem) => (origem === 'zod' ? id : null),
    load: (alvo) =>
      alvo === id
        ? `const vazio = new Proxy(function () {}, { get: (_, k) => (k === 'then' ? undefined : vazio), apply: () => vazio })
export const z = vazio
export default vazio`
        : null,
  }
}

// Porta do dev server (3040, própria do projeto). `PORT=3041 npm run dev` quando estiver ocupada.
const port = Number(process.env.PORT) || 3040

const config = defineConfig(({ command, isPreview }) => ({
  resolve: { tsconfigPaths: true },
  server: { port },
  plugins: [
    zodForaDoNavegador(),
    devtools(),
    cloudflare({
      viteEnvironment: { name: 'ssr' },
      // No dev server, a URL do Better Auth acompanha a porta. O Wrangler dá prioridade ao
      // .dev.vars sobre as variáveis do processo, então NÃO defina BETTER_AUTH_URL no .dev.vars:
      // ele sobrescreveria este valor (e quebraria `PORT=3017 npm run e2e`). Build e deploy
      // continuam usando o BETTER_AUTH_URL do wrangler.jsonc.
      // `PERF_LOG=1 npm run dev` (ou o e2e) liga o log de uma linha JSON por pedido (`src/db/d1-trace.ts`):
      // o `.dev.vars` não repassa essa variável (o `wrangler.jsonc` tem `secrets.required`), então ela
      // passa por aqui, só quando existe no ambiente do processo.
      config:
        command === 'serve' && !isPreview
          ? {
              vars: {
                BETTER_AUTH_URL: `http://localhost:${port}`,
                ...(process.env.PERF_LOG
                  ? { PERF_LOG: process.env.PERF_LOG }
                  : {}),
                // Só o e2e define: aponta a API da Hotmart para o servidor falso (e2e/hotmart-falsa.mjs).
                ...(process.env.HOTMART_URL_DE_TESTE
                  ? { HOTMART_URL_DE_TESTE: process.env.HOTMART_URL_DE_TESTE }
                  : {}),
              },
            }
          : undefined,
    }),
    tailwindcss(),
    tanstackStart(),
    viteReact(),
  ],
}))

export default config
