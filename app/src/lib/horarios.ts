// Horários do cron (UTC) como o APP os enxerga (src/lib/cron.ts).
// `cron.test.ts` garante que o `wrangler.jsonc` declara estes mesmos horários.
export const CRON_DIARIO = '0 3 * * *' // todo dia 03:00: limpa sessões e códigos vencidos
export const CRON_RESUMO = '0 11 * * *' // todo dia 11:00 UTC = 8h em Brasília: resumo diário da equipe
export const CRON_QUARTO_DE_HORA = '*/15 * * * *' // a cada 15 minutos: agrupamento de e-mails e filas da equipe
