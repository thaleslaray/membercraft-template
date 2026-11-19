import { beforeEach, describe, expect, it, vi } from 'vitest'

const consumirMensagemDaVoomp = vi.fn(async (_corpo: unknown, _env: Env) => {})
const processarEmailDaFila = vi.fn(async (_env: Env, _id: string) => {})
const registrarFalhaDeEmail = vi.fn(
  async (_env: Env, _id: string, _motivo: string) => {},
)
const processarPdfDaFila = vi.fn(async (_env: Env, _id: string) => {})
const registrarFalhaDoPdf = vi.fn(async (_env: Env, _id: string) => {})
const avisarTecnico = vi.fn(async (_falha: unknown) => {})

vi.mock('#/lib/fila-voomp', () => ({ consumirMensagemDaVoomp }))
vi.mock('#/lib/email-cola', () => ({
  processarEmailDaFila,
  registrarFalhaDeEmail,
}))
vi.mock('#/lib/certificados-cola', () => ({
  processarPdfDaFila,
  registrarFalhaDoPdf,
}))
vi.mock('#/lib/alerta', () => ({ avisarTecnico }))

const { consumirLote } = await import('#/lib/fila-consumidores')

const env = {} as Env
const mensagem = (body: unknown) => ({
  id: 'm1',
  body,
  ack: vi.fn(),
  retry: vi.fn(),
})
const lote = (queue: string, ...mensagens: ReturnType<typeof mensagem>[]) =>
  ({ queue, messages: mensagens }) as unknown as MessageBatch<unknown>

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
  vi.spyOn(console, 'log').mockImplementation(() => undefined)
})

describe('consumirLote', () => {
  it('cada fila vai ao seu consumidor (com ou sem o prefixo do ambiente) e confirma', async () => {
    const voomp = mensagem({ avisoId: 'a1' })
    await consumirLote(lote('escola-voomp', voomp), env)
    expect(consumirMensagemDaVoomp).toHaveBeenCalledWith({ avisoId: 'a1' }, env)
    expect(voomp.ack).toHaveBeenCalled()

    const email = mensagem({ envioId: 'e1' })
    await consumirLote(lote('escola-teste-email', email), env)
    expect(processarEmailDaFila).toHaveBeenCalledWith(env, 'e1')
    expect(email.ack).toHaveBeenCalled()

    const pdf = mensagem({ certificadoId: 'c1' })
    await consumirLote(lote('escola-pdf', pdf), env)
    expect(processarPdfDaFila).toHaveBeenCalledWith(env, 'c1')
  })

  it('falha pede nova tentativa em vez de confirmar; mensagem sem id também', async () => {
    consumirMensagemDaVoomp.mockRejectedValueOnce(new Error('D1'))
    const voomp = mensagem({ avisoId: 'a1' })
    await consumirLote(lote('escola-voomp', voomp), env)
    expect(voomp.retry).toHaveBeenCalled()
    expect(voomp.ack).not.toHaveBeenCalled()

    const semId = mensagem({})
    await consumirLote(lote('escola-email', semId), env)
    expect(semId.retry).toHaveBeenCalled()
    expect(processarEmailDaFila).not.toHaveBeenCalled()
  })

  it('fila desconhecida só confirma', async () => {
    const m = mensagem({})
    await consumirLote(lote('escola-outra', m), env)
    expect(m.ack).toHaveBeenCalled()
  })
})

describe('fila de mortos', () => {
  it('e-mail: marca a falha do envio e avisa o técnico como falha de e-mail', async () => {
    const m = mensagem({ origem: 'email', envioId: 'e1' })
    await consumirLote(lote('escola-mortos', m), env)
    expect(registrarFalhaDeEmail).toHaveBeenCalledWith(
      env,
      'e1',
      expect.stringContaining('desistiu'),
    )
    expect(avisarTecnico).toHaveBeenCalledWith(
      expect.objectContaining({ origem: 'email' }),
    )
    expect(m.ack).toHaveBeenCalled()
  })

  it('PDF: marca a falha e não manda um segundo alerta (a marcação já avisa)', async () => {
    const m = mensagem({ origem: 'pdf', certificadoId: 'c1' })
    await consumirLote(lote('escola-mortos', m), env)
    expect(registrarFalhaDoPdf).toHaveBeenCalledWith(env, 'c1')
    expect(avisarTecnico).not.toHaveBeenCalled()
    expect(m.ack).toHaveBeenCalled()
  })

  it('webhook vira alerta de webhook; sem origem conhecida, alerta de fila', async () => {
    await consumirLote(
      lote('escola-mortos', mensagem({ origem: 'webhook' })),
      env,
    )
    expect(avisarTecnico).toHaveBeenLastCalledWith(
      expect.objectContaining({ origem: 'webhook' }),
    )
    await consumirLote(lote('escola-mortos', mensagem({ qualquer: 1 })), env)
    expect(avisarTecnico).toHaveBeenLastCalledWith(
      expect.objectContaining({ origem: 'fila' }),
    )
  })
})
