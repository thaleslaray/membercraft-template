# Padrões de código

Regras de julgamento para escrever e revisar o app em `app/`. O que é mecânico fica no Biome, no TypeScript e nos
testes (ex.: imports só por `#/`, horários do cron conferidos pelo `cron.test.ts`); aqui fica só o que exige olhar.

## Servidor e banco
- Bindings vêm de `import { env } from 'cloudflare:workers'`, lidos **dentro** da função, nunca em escopo de módulo.
- Banco e auth são **factories por request** (`getDb(env.DB)`, `getAuth(env)`): nada de instância compartilhada,
  nem registro mutável em escopo de módulo.
- Escrita atômica no D1 é `db.batch([...])`. O D1 não tem transação aninhada.

## Módulos de regra
- Toda regra de negócio mora em `src/regras/`, recebe `Banco` e `Relogio` (`src/regras/tipos.ts`) por parâmetro e
  não sabe de tela nem de HTTP. Server functions e rotas só autenticam, autorizam, chamam o módulo e formatam.
- O teste exercita o contrato do módulo com `criarBancoDeTeste()` e um relógio fixo: comportamento externo, não
  implementação.

## Vocabulário e texto
- Conceitos do domínio têm nome em pt-BR, como `Matricula`, `Turma`, `situacaoDoConteudo`.
  Utilitários técnicos herdados do template podem ficar em inglês.
- Todo texto de tela em pt-BR com acentuação, direto no componente (sem i18n).
- Marca, contato e textos de configuração vêm do `appConfig` (`src/config/app.ts`), não fixos no JSX.

## Visual
- Cor, raio e fonte vêm dos tokens do tema (`src/styles.css`); componente não lê `data-theme` nem usa cor literal.
- Base: shadcn/ui.

## Escopo
- Cada fatia entrega só o que o ticket pede. Herança do template sem uso no ticket (login social, temas do template)
  sai na fatia dona do assunto, não antes.
