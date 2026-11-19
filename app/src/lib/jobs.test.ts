import { beforeEach, describe, expect, it, vi } from 'vitest'

const avisarTecnico = vi.fn(async (_falha: unknown) => {})

// Os módulos que os jobs fixos importam não rodam aqui: só o registro e o `runJobs` importam.
vi.mock('#/lib/alerta', () => ({ avisarTecnico }))
vi.mock('#/db/index', () => ({ getDb: vi.fn() }))
vi.mock('#/lib/avisos-cola', () => ({
  rodarAvisosDoDia: vi.fn(),
  rodarAvisosDoQuartoDeHora: vi.fn(),
}))
vi.mock('#/lib/email-cola', () => ({ baseDoApp: vi.fn(), pedirEmail: vi.fn() }))
vi.mock('#/lib/pedido-do-mec-cola', () => ({
  destacarPedidosAtrasadosDoMec: vi.fn(),
}))
vi.mock('#/regras/copia-diaria', () => ({ copiarBancoParaDeposito: vi.fn() }))
vi.mock('#/regras/matricula', () => ({ expirarMatriculas: vi.fn() }))
vi.mock('#/regras/resumo-diario', () => ({ enviarResumosDiarios: vi.fn() }))
vi.mock('#/regras/sessao', () => ({ limparExpirados: vi.fn() }))

const { registerJob, runJobs } = await import('#/lib/jobs')

const env = {} as Env

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
  vi.spyOn(console, 'log').mockImplementation(() => undefined)
})

// Os avisos só dos jobs deste arquivo (os jobs fixos do registro também rodam, com módulos falsos).
const avisosDe = (prefixo: string) =>
  avisarTecnico.mock.calls
    .map(([falha]) => falha as { origem: string; detalhe: string })
    .filter((f) => f.detalhe.startsWith(prefixo))

describe('runJobs', () => {
  it('um job que lança não impede os outros, e o técnico é avisado', async () => {
    const depois = vi.fn(async () => 'feito')
    registerJob({
      name: 'a.quebra',
      quando: 'resumo',
      run: async () => {
        throw new Error('boom')
      },
    })
    registerJob({ name: 'a.depois', quando: 'resumo', run: depois })
    const r = await runJobs(env, 'resumo')
    expect(r['a.quebra']).toBe('erro')
    expect(r['a.depois']).toBe('ok')
    expect(depois).toHaveBeenCalledWith(env)
    expect(avisosDe('a.')).toEqual([
      { origem: 'tarefa', detalhe: 'a.quebra: boom' },
    ])
  })

  it('só roda os jobs do cron pedido e o padrão é o diário', async () => {
    const diario = vi.fn(async () => undefined)
    const quarto = vi.fn(async () => undefined)
    registerJob({ name: 'b.diario', run: diario })
    registerJob({ name: 'b.quarto', quando: 'quarto-de-hora', run: quarto })
    const r = await runJobs(env, 'quarto-de-hora')
    expect(r['b.quarto']).toBe('ok')
    expect(r['b.diario']).toBeUndefined()
    expect(quarto).toHaveBeenCalledTimes(1)
    expect(diario).not.toHaveBeenCalled()
    const padrao = await runJobs(env)
    expect(padrao['b.diario']).toBe('ok')
  })

  it('erro que não é Error vira texto no aviso', async () => {
    registerJob({
      name: 'c.texto',
      quando: 'resumo',
      run: async () => {
        throw 'falhou feio'
      },
    })
    await runJobs(env, 'resumo')
    expect(avisosDe('c.')).toEqual([
      { origem: 'tarefa', detalhe: 'c.texto: falhou feio' },
    ])
  })
})
