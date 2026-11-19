// Despacho do `scheduled()` por `event.cron`: cada horário chama um trabalho diferente.

import { CRON_DIARIO, CRON_QUARTO_DE_HORA, CRON_RESUMO } from '#/lib/horarios'
import { runJobs } from '#/lib/jobs'

export async function despacharCron(cron: string, env: Env): Promise<string> {
  switch (cron) {
    case CRON_DIARIO:
      return `diario ${JSON.stringify(await runJobs(env))}`
    case CRON_RESUMO:
      return `resumo ${JSON.stringify(await runJobs(env, 'resumo'))}`
    case CRON_QUARTO_DE_HORA:
      return `quarto-de-hora ${JSON.stringify(await runJobs(env, 'quarto-de-hora'))}`
    default:
      // Horário novo no config sem case aqui: avisa alto em vez de passar em silêncio.
      throw new Error(`cron desconhecido: ${cron}`)
  }
}
