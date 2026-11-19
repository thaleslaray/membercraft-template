# Testes ponta a ponta

`npm run e2e` (ou `npm run e2e:ui` para o inspetor). O Playwright controla um Chromium
contra o **servidor de desenvolvimento real** (`npm run dev` = `vite dev` com o plugin da
Cloudflare: workerd + D1 local). Primeira vez: `npx playwright install chromium`.

## Como funciona

- O Playwright sobe o `vite dev` sozinho (porta 3040; `PORT=3017 npm run e2e` muda) e **não
  reaproveita** servidor já aberto. Pare o seu `npm run dev` antes de rodar.
- A saída do servidor vai para `e2e/.dev.log`. Sem provedor de e-mail, o servidor imprime
  `[auth] código de login para <email>: <6 dígitos>`; o teste de login lê esse arquivo.
- `e2e/global-setup.ts` roda `npm run db:migrate:local` para garantir as tabelas no D1 local.
- Precisa de um `.dev.vars` (copie de `.dev.vars.example`).

## Arquivos

Um spec por fatia; veja a pasta.
