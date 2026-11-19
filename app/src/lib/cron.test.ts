import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { runJobs } = vi.hoisted(() => ({
  runJobs: vi.fn(async () => ({ 'auth.limpar-expirados': 'ok' })),
}))
vi.mock('#/lib/jobs', () => ({ runJobs }))

import { despacharCron } from '#/lib/cron'
import { CRON_DIARIO, CRON_QUARTO_DE_HORA, CRON_RESUMO } from '#/lib/horarios'

const env = {} as Env

beforeEach(() => vi.clearAllMocks())

describe('despacharCron', () => {
  it('o horário diário chama os jobs', async () => {
    expect(await despacharCron(CRON_DIARIO, env)).toContain('diario')
    expect(runJobs).toHaveBeenCalledTimes(1)
  })
  it('o horário das 8h de Brasília roda só os jobs do resumo', async () => {
    expect(CRON_RESUMO).toBe('0 11 * * *')
    expect(await despacharCron(CRON_RESUMO, env)).toContain('resumo')
    expect(runJobs).toHaveBeenCalledWith(env, 'resumo')
  })
  it('o horário de 15 minutos roda só os jobs de 15 minutos', async () => {
    expect(CRON_QUARTO_DE_HORA).toBe('*/15 * * * *')
    expect(await despacharCron(CRON_QUARTO_DE_HORA, env)).toContain(
      'quarto-de-hora',
    )
    expect(runJobs).toHaveBeenCalledWith(env, 'quarto-de-hora')
  })
  it('o wrangler.jsonc declara os mesmos horários nos dois ambientes', () => {
    const texto = readFileSync('wrangler.jsonc', 'utf8')
    const ocorrencias = texto.match(/"crons":\s*\[([^\]]*)\]/g) ?? []
    expect(ocorrencias).toHaveLength(2)
    for (const o of ocorrencias) {
      expect(o).toContain(`"${CRON_DIARIO}"`)
      expect(o).toContain(`"${CRON_RESUMO}"`)
      expect(o).toContain(`"${CRON_QUARTO_DE_HORA}"`)
    }
  })
  it('horário desconhecido lança erro', async () => {
    await expect(despacharCron('* * * * *', env)).rejects.toThrow(
      'cron desconhecido',
    )
  })
})
