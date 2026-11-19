# Restaurar o banco

Duas redes de proteção, da mais rápida para a mais antiga:

| Quando o erro foi descoberto | Use |
|---|---|
| Até 30 dias atrás | **Time Travel** do D1 (volta o próprio banco a um instante) |
| Até 90 dias atrás | **Cópia diária** no R2 (`copias/AAAA-MM-DD.sql.gz`, feita às 03:00 UTC pelo cron) |

Além disso, o que o usuário "exclui" fica marcado (`excluidoEm`) e só some de vez após 30 dias: um engano de
exclusão se desfaz limpando essa coluna, sem restaurar nada (como aderir: topo de `src/regras/exclusao-protegida.ts`).

> Regra de ouro: **nunca restaure por cima do banco no ar**. Restaure num banco separado, confira, e só então decida
> o que trazer de volta (as linhas perdidas, ou trocar o banco).

## A. Time Travel (até 30 dias)

```sh
npx wrangler d1 time-travel info escola                                   # mostra o bookmark atual
npx wrangler d1 time-travel restore escola --timestamp=2026-03-05T10:00:00Z   # ou --bookmark=<id>
```
O comando devolve o bookmark anterior: guarde-o, pois ele permite desfazer a restauração.
Para só olhar o passado sem mexer no banco no ar, use a cópia diária (B) em um banco separado.

## B. Cópia diária do R2 (até 90 dias)

A cópia é um arquivo SQL (um `INSERT` por linha, começando com `PRAGMA defer_foreign_keys = on;`) compactado em gzip.
Ela guarda **só os dados**; o esquema vem das migrações do repositório.

> Aviso: `wrangler` não lista objetos do R2 (só `get`, `put`, `delete`). Para saber quais dias existem, tente baixar
> `copias/AAAA-MM-DD.sql.gz` de datas recentes: chave inexistente dá "The specified key does not exist". Ou use o painel
> da Cloudflare (R2 > bucket > pasta `copias/`). Cópia de 938 bytes = banco vazio no dia.

1. Escolha o dia e baixe a cópia. No teste o bucket é `escola-teste-arquivos` e é preciso `--env teste`; sem `--env`
   o comando mira `escola-arquivos`. Baixe para uma pasta própria, fora do repositório:
   ```sh
   cd app
   npx wrangler r2 object get escola-teste-arquivos/copias/2026-11-12.sql.gz --remote --env teste --file ~/restauracao/copia.sql.gz
   gunzip -k ~/restauracao/copia.sql.gz      # gera copia.sql (-k mantém o .gz)
   ```
2. Crie um banco **vazio e separado** e aplique as migrações nele. As migrações estão em `app/drizzle/` (não existe
   `migrations/`). Depois de criado o banco novo, ponha o `database_id` dele num `wrangler` temporário (ou no bloco do
   ambiente) e aplique:
   ```sh
   npx wrangler d1 create escola-restauracao
   npx wrangler d1 migrations apply escola-restauracao --remote   # exige o binding/nome no wrangler: ver nota abaixo
   ```
   Nota: `migrations apply <nome>` só funciona se esse nome estiver em `d1_databases` de algum `wrangler.jsonc`. Crie
   um `wrangler.restauracao.jsonc` (fora do git) com `{"name":"restauracao","compatibility_date":"2026-01-01",
   "d1_databases":[{"binding":"DB","database_name":"escola-restauracao","database_id":"<id impresso>",
   "migrations_dir":"drizzle"}]}` e passe `-c wrangler.restauracao.jsonc` em todos os comandos `d1`.
3. Aplique a cópia (o arquivo roda numa transação, por isso a ordem das tabelas não importa):
   ```sh
   npx wrangler d1 execute escola-restauracao --remote -c wrangler.restauracao.jsonc --file ~/restauracao/copia.sql
   ```
4. Confira (contagens e alguns registros conhecidos). `select ... union all ...` tem limite de poucos termos no D1
   (mais de ~5 dá "too many terms in compound SELECT"): faça uma consulta por lote de 5 tabelas, ou uma por tabela.
   ```sh
   npx wrangler d1 execute escola-restauracao --remote -c wrangler.restauracao.jsonc \
     --command "select count(*) as alunos from user; select count(*) as sessoes from session"
   npx wrangler d1 execute escola-restauracao --remote -c wrangler.restauracao.jsonc --command "pragma foreign_key_check"
   ```
5. Decida: copiar só as linhas necessárias para o banco no ar, ou trocar o `database_id` do `wrangler.jsonc` pelo do
   banco restaurado e publicar (`npm run deploy:teste` / o deploy de produção). Apague o banco temporário quando
   terminar (`wrangler d1 delete escola-restauracao`).

### Ensaio local (sem tocar na Cloudflare)

Os mesmos passos 2 a 4 funcionam no D1 local, com `--local --persist-to <pasta>` no lugar de `--remote`. Use sempre uma
pasta própria em `--persist-to`: sem ela o comando escreve em `.wrangler/state` e mexe no banco local `escola` do dia a dia.
```sh
cd app
npx wrangler d1 migrations apply escola --local --persist-to ~/restauracao/estado
npx wrangler d1 execute escola --local --persist-to ~/restauracao/estado --file ~/restauracao/copia.sql
npx wrangler d1 execute escola --local --persist-to ~/restauracao/estado --command "select count(*) from user"
```
Observação: no local, o nome `escola` e o `database_id` de mentira do `wrangler.jsonc` bastam; não é preciso `--env`.


## O que a cópia NÃO cobre
- Arquivos do R2 (materiais, entregas de quiz): a cópia é só do D1.
- Mudanças feitas depois das 03:00 UTC do dia da cópia.
