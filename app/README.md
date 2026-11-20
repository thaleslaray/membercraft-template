# Área de membros: modelo

Sistema de área de membros para escolas online, em português do Brasil. O aluno entra com um código enviado por e-mail, assiste às aulas, faz exercícios, acumula pontos, recebe certificado em PDF e fala com a equipe. A equipe cuida de tudo por um painel.

Tudo roda num único Cloudflare Worker: TanStack Start (React), banco D1 (Drizzle), arquivos no R2, Filas, envio de e-mail, rate limit e cron. Login com Better Auth.

## O que você precisa ter

- Node 22 ou mais novo e npm.
- Conta na Cloudflare (Workers, D1, R2 e Filas). Confira no painel da Cloudflare qual plano libera Filas e o envio de e-mail; isso não foi verificado para o plano gratuito.
- **Um provedor de e-mail**, porque o login é por código enviado por e-mail. Escolha um:
  - Cloudflare Email Service (o binding `EMAIL` do `wrangler.jsonc`): exige um domínio seu na Cloudflare com o envio de e-mail ativado, e `EMAIL_FROM` com um endereço desse domínio;
  - ou Resend: `RESEND_API_KEY` e um domínio verificado lá.

  Sem nenhum dos dois o sistema funciona no seu computador (o código aparece no terminal), mas publicado ninguém consegue entrar.
- **Onde hospedar os vídeos: Vimeo.** A aula guarda o link do Vimeo e toca pelo player dele; o sistema não guarda nem converte vídeo. No Vimeo, vale restringir a incorporação ao seu domínio.
- **Gateway de pagamento (opcional):** Voomp ou Hotmart avisam cada compra por webhook e o aluno é matriculado sozinho. Sem gateway, a equipe matricula pelo painel, informando os e-mails dos alunos.
- Um e-mail seu, para ser o primeiro Proprietário (`PROPRIETARIO_INICIAL`).

## O que o sistema NÃO faz

- Não hospeda vídeo (só Vimeo) e não cobra: só recebe o aviso de compra da Voomp ou da Hotmart. Outro gateway pede código novo.
- Não tem senha nem login social. Só entra quem já tem cadastro (criado por compra, matrícula manual ou `PROPRIETARIO_INICIAL`); o login nunca cria conta.
- Não importa conteúdo de outras plataformas: os scripts de migração da escola original não vêm nesta cópia.
- Não emite certificado oficial do MEC. O certificado em PDF é gerado aqui. O "Pedido do MEC" é um recurso do caso original (a emissão é feita fora, na Voomp) e fica desligado em todo curso novo; ignore se não for o seu caso.
- É uma escola por instalação. Os textos são em pt-BR, sem tradução, e o resumo diário da equipe está marcado para 8h de Brasília (o cron roda em UTC).
- A cópia não se atualiza sozinha.

## Rodar no seu computador

```bash
cd app
npm install
cp .dev.vars.example .dev.vars
```

No `.dev.vars`, preencha `BETTER_AUTH_SECRET` (gere com `openssl rand -base64 32`) e `PROPRIETARIO_INICIAL` (seu e-mail). Depois:

```bash
npm run db:migrate:local
npm run dev            # http://localhost:3040
```

Abra o endereço, digite o e-mail do `PROPRIETARIO_INICIAL` e pegue o código no terminal: `[auth] código de login para voce@exemplo.com: 123456`. Esse primeiro acesso cria a conta de Proprietário no banco local. Se a porta 3040 estiver ocupada: `PORT=3041 npm run dev`.

O `npm install` liga um hook de pre-commit (`.githooks`) que roda lint, tipos e testes a cada commit. Para desligar: `git config --unset core.hooksPath`.

## Personalizar a marca

Nome da escola, sigla, nome da professora, e-mail de suporte e remetente dos e-mails ficam em `src/config/app.ts`. Troque os valores de exemplo pelos seus. O e-mail de suporte também recebe os alertas técnicos (webhook, e-mail ou tarefa agendada que falhou). Cores e logo se mudam no painel, em Estúdio › Aparência.

## Antes de publicar: o envio de e-mail

**Por que precisa.** No seu computador, o código de entrada aparece no terminal. No sistema publicado, ele chega por e-mail. Sem um serviço de envio de e-mail, ninguém entra, nem você.

**O aviso mais importante.** Publicado sem serviço de e-mail, a tela de entrada diz "Enviamos um código de 6 dígitos" e **nada é enviado**. O erro fica só no registro do sistema. Para ver o motivo, rode `npx wrangler tail`, peça o código de novo e procure "Nenhum provedor de e-mail configurado".

**Os serviços que o sistema aceita** (`src/lib/email.ts`), nesta ordem:

1. **Cloudflare Email Service.** Usa a ligação `EMAIL`, que já está no `wrangler.jsonc`. Só é tentado se `EMAIL_FROM` estiver preenchido, e o endereço precisa ser de um domínio seu na Cloudflare, com o serviço habilitado.
2. **Resend.** Usa `RESEND_API_KEY`. Entra quando o primeiro falha ou não está configurado.

**Preencha `EMAIL_FROM` sempre**, no formato `Nome <contato@seudominio.com.br>`. Se ficar vazio, o sistema usa o remetente de exemplo de `src/config/app.ts`, que nenhum serviço aceita.

**Sem domínio, só para você entrar e conhecer o sistema:** crie uma conta gratuita em [resend.com](https://resend.com), gere uma chave, preencha `RESEND_API_KEY` e use `EMAIL_FROM=Escola <onboarding@resend.dev>`. Segundo o Resend, esse remetente de teste só entrega para o e-mail da sua própria conta Resend; use nela o mesmo e-mail de `PROPRIETARIO_INICIAL`. Para as alunas receberem o código, você precisa de um domínio.

Nenhum desses caminhos foi **testado por nós com envio real**.

**Três lembretes antes de publicar:**

- Edite `src/config/app.ts` (nome da escola, remetente e e-mail de suporte) **antes** de publicar. Esses textos aparecem nas telas e nos e-mails; sem trocar, o sistema vai ao ar como "Helena Duarte".
- Crie o arquivo de segredos de produção com `cp .dev.vars.example .prod.vars`. Não parta do `.dev.vars`, que tem o segredo e o e-mail de teste do seu computador.
- Se você tem mais de uma conta na Cloudflare, fixe a conta antes de qualquer comando: `export CLOUDFLARE_ACCOUNT_ID=<id da conta>`.

Depois de trocar o `database_id` no `wrangler.jsonc`, o banco do seu computador passa a ser outro, vazio. Rode `npm run db:migrate:local` de novo, ou as telas locais dão erro 500.

## Publicar na sua conta Cloudflare

Este roteiro foi testado numa conta nova da Cloudflare: do zero ao sistema no ar levou cerca de 5 minutos.

**Onde ficam as coisas depois de entrar.** O dono cai em "Meus cursos". O painel de administração abre em "Estúdio da equipe", no menu da conta, ou em `/painel`. Para um curso aparecer para todos, use "Mostrar a todos na vitrine". Para matricular alguém, o curso precisa de uma turma: crie em "Quem compra", "Criar edição separada".

Faça tudo dentro de `app/`.

1. `npx wrangler login`.
2. Crie os recursos (os nomes são os do `wrangler.jsonc`):
   ```bash
   npx wrangler d1 create escola --location enam
   npx wrangler r2 bucket create escola-arquivos
   npx wrangler queues create escola-voomp
   npx wrangler queues create escola-email
   npx wrangler queues create escola-pdf
   npx wrangler queues create escola-mortos
   ```
   O `--location enam` combina com o `placement` do `wrangler.jsonc` (Worker e banco perto um do outro). Se escolher outra região, ajuste ou apague o `placement`.
3. Troque o primeiro `SEU-DATABASE-ID-AQUI` do `wrangler.jsonc` (o do topo, em `d1_databases`) pelo `database_id` que o comando devolveu. O segundo é do ambiente `env.teste`, um Worker separado (`escola-teste`) com recursos próprios; ignore se não for usar.
4. Em `vars`, troque `BETTER_AUTH_URL` pelo endereço real do site. Sem domínio próprio o endereço será `https://escola.<seu-subdominio>.workers.dev`: publique uma vez, copie o endereço que o wrangler mostrar, ponha em `BETTER_AUTH_URL` e publique de novo. Com domínio próprio, acrescente no `wrangler.jsonc`: `"routes": [{ "pattern": "area.seudominio.com", "custom_domain": true }]`.
5. Crie o arquivo `.prod.vars` (fora do git) a partir do `.dev.vars.example` e preencha:
   - `BETTER_AUTH_SECRET`: obrigatório. **Não troque depois**: trocar derruba todos os logins.
   - `PROPRIETARIO_INICIAL`: seu e-mail.
   - `EMAIL_FROM` (remetente, de domínio verificado) e, se usar o Resend, `RESEND_API_KEY`.
   - `VOOMP_WEBHOOK_TOKEN`: um texto longo e aleatório. Vazio, o webhook recusa tudo.
   - `HOTMART_CHAVE_DE_CIFRA`: mínimo 32 caracteres (`openssl rand -base64 32`). Cifra no banco as credenciais da Hotmart coladas no painel; não pode mudar depois de salvas.
   - `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`: só para envio de arquivos grandes (até 500 MB) nos exercícios; veja `docs/entregas-de-quiz.md`, que também pede uma regra de CORS no bucket. Vazios, o envio passa pelo Worker e o limite cai para 90 MB.
   - `EMAIL_WEBHOOK_TOKEN`: opcional, para o aviso de retorno (bounce) do Resend em `/api/email/retorno`.

   Na primeira publicação o wrangler exige que todos os nomes de `secrets.required` (no `wrangler.jsonc`) estejam no arquivo. Para o que você não usar, deixe a linha com o valor vazio; se a Cloudflare recusar valor vazio, tire esse nome da lista `secrets.required`.
6. Aplique as migrações e publique:
   ```bash
   npm run db:migrate:remote
   npm run deploy
   ```
   O `npm run deploy` faz o build e publica enviando os segredos do `.prod.vars`. Não use `npm run deploy:cloudflare` na primeira vez: ele não faz o build nem envia o arquivo de segredos.
7. Abra o site, digite o e-mail do `PROPRIETARIO_INICIAL` e entre com o código recebido.

Depois de publicado:

- **Voomp:** aponte o webhook para `https://<seu-site>/api/webhooks/voomp`, mandando o cabeçalho `x-webhook-token` com o valor de `VOOMP_WEBHOOK_TOKEN`. No painel, ligue cada produto às turmas.
- **Hotmart:** cole as credenciais no painel da equipe e configure na Hotmart o webhook para `https://<seu-site>/api/webhooks/hotmart`.
- **Atendimento por e-mail (opcional):** com o Email Routing da Cloudflare, mande o que chega em `suporte@` e `help@` do seu domínio para este Worker.
- **Cópia do banco:** o cron grava todo dia uma cópia no R2 (`copias/`). Para restaurar: `docs/restauracao.md`.

## Qualidade

`npm run typecheck`, `npm test`, `npm run e2e` (primeiro `npx playwright install chromium`) e `npm run check`.
