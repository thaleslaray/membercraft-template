import { describe, expect, it, vi } from 'vitest'
import { avisoDeVenda } from '#/db/schema'
import { tratarWebhookDaHotmart } from '#/lib/webhook-hotmart'
import type { Falha } from '#/regras/alerta-tecnico'
import { ErroDeCifra } from '#/regras/cifra'
import { criarBancoDeTeste } from '#/test/banco'
import { corpoDaFixtureHotmart } from '#/test/fixtures/hotmart'

const HOTTOK = 'hottok-de-teste'
const agora = () => new Date('2026-11-13T12:00:00Z')

function pedido(hottok: string | null, corpo: string, metodo = 'POST') {
  const headers = new Headers({ 'content-type': 'application/json' })
  if (hottok !== null) headers.set('x-hotmart-hottok', hottok)
  return new Request('http://localhost/api/webhooks/hotmart', {
    method: metodo,
    headers,
    body: metodo === 'POST' ? corpo : undefined,
  })
}

async function cenario(
  credencial: { hottok?: string } = { hottok: HOTTOK },
  lerHottok?: () => Promise<string | undefined>,
) {
  const salvo = credencial.hottok
  const banco = await criarBancoDeTeste()
  const eventos: string[] = []
  const enfileirar = vi.fn(async () => {
    eventos.push(`fila:${(await banco.select().from(avisoDeVenda)).length}`)
  })
  const alertar = vi.fn(async (_falha: Falha) => {})
  const tratar = (request: Request) =>
    tratarWebhookDaHotmart(request, {
      banco,
      agora,
      hottok: lerHottok ?? (async () => salvo),
      enfileirar,
      alertar,
    })
  return { banco, enfileirar, tratar, eventos, alertar }
}

describe('webhook da Hotmart', () => {
  it('hottok errado, ausente ou sem credencial salva: 401, nada gravado nem enfileirado', async () => {
    const corpo = corpoDaFixtureHotmart('purchase-approved')
    for (const [hottok, salvo] of [
      ['errado', HOTTOK],
      [null, HOTTOK],
      ['', HOTTOK],
      [HOTTOK, undefined],
      ['', undefined],
    ] as const) {
      const { banco, enfileirar, tratar } = await cenario({ hottok: salvo })
      expect((await tratar(pedido(hottok, corpo))).status).toBe(401)
      expect(await banco.select().from(avisoDeVenda)).toHaveLength(0)
      expect(enfileirar).not.toHaveBeenCalled()
    }
  })

  it('chave de cifra quebrada (ErroDeCifra): 503, alerta o técnico, não vaza o erro e não grava', async () => {
    const segredo = 'A chave de cifra não está configurada: detalhe interno'
    const { banco, enfileirar, tratar, alertar } = await cenario(
      { hottok: HOTTOK },
      async () => {
        throw new ErroDeCifra(segredo)
      },
    )
    const res = await tratar(
      pedido(HOTTOK, corpoDaFixtureHotmart('purchase-approved')),
    )
    expect(res.status).toBe(503)
    expect(await res.text()).not.toContain('cifra')
    expect(alertar).toHaveBeenCalledTimes(1)
    expect(alertar.mock.calls[0][0]).toMatchObject({ origem: 'webhook' })
    expect(await banco.select().from(avisoDeVenda)).toHaveLength(0)
    expect(enfileirar).not.toHaveBeenCalled()
  })

  it('outro erro ao ler o hottok continua subindo (500 do framework)', async () => {
    const { tratar, alertar } = await cenario({ hottok: HOTTOK }, async () => {
      throw new Error('banco fora')
    })
    await expect(
      tratar(pedido(HOTTOK, corpoDaFixtureHotmart('purchase-approved'))),
    ).rejects.toThrow('banco fora')
    expect(alertar).not.toHaveBeenCalled()
  })

  it('hottok válido: grava ANTES de enfileirar e responde 200', async () => {
    const { banco, enfileirar, tratar, eventos } = await cenario()
    const res = await tratar(
      pedido(HOTTOK, corpoDaFixtureHotmart('purchase-approved')),
    )
    expect(res.status).toBe(200)
    expect(eventos).toEqual(['fila:1'])
    const [linha] = await banco.select().from(avisoDeVenda)
    expect(linha.gateway).toBe('hotmart')
    expect(enfileirar).toHaveBeenCalledWith({
      origem: 'webhook',
      gateway: 'hotmart',
      avisoId: linha.id,
    })
  })

  it('aviso repetido responde 200 sem linha nova', async () => {
    const { banco, tratar } = await cenario()
    const corpo = corpoDaFixtureHotmart('purchase-approved')
    await tratar(pedido(HOTTOK, corpo))
    expect((await tratar(pedido(HOTTOK, corpo))).status).toBe(200)
    expect(await banco.select().from(avisoDeVenda)).toHaveLength(1)
  })

  it('evento desconhecido (Club, assinatura) responde 200 e fica gravado', async () => {
    const { banco, tratar } = await cenario()
    for (const nome of [
      'club-first-access',
      'subscription-cancellation',
    ] as const) {
      expect(
        (await tratar(pedido(HOTTOK, corpoDaFixtureHotmart(nome)))).status,
      ).toBe(200)
    }
    expect(await banco.select().from(avisoDeVenda)).toHaveLength(2)
  })

  it('se a fila falhar, o aviso já está gravado e a resposta é 200', async () => {
    const { banco, enfileirar, tratar } = await cenario()
    enfileirar.mockRejectedValueOnce(new Error('fila fora do ar'))
    const erro = vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await tratar(
      pedido(HOTTOK, corpoDaFixtureHotmart('purchase-approved')),
    )
    erro.mockRestore()
    expect(res.status).toBe(200)
    expect(await banco.select().from(avisoDeVenda)).toHaveLength(1)
  })

  it('corpo inválido: 400; outro método: 405; corpo grande: 413', async () => {
    const { enfileirar, tratar } = await cenario()
    expect((await tratar(pedido(HOTTOK, '{quebrado'))).status).toBe(400)
    expect((await tratar(pedido(HOTTOK, '', 'GET'))).status).toBe(405)
    const grande = pedido(HOTTOK, corpoDaFixtureHotmart('purchase-approved'))
    grande.headers.set('content-length', String(10 * 1024 * 1024))
    expect((await tratar(grande)).status).toBe(413)
    expect(enfileirar).not.toHaveBeenCalled()
  })
})
