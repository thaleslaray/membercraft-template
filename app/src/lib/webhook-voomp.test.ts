import { describe, expect, it, vi } from 'vitest'
import { avisoDeVenda } from '#/db/schema'
import { LIMITE_DO_CORPO, tratarWebhookDaVoomp } from '#/lib/webhook-voomp'
import { criarBancoDeTeste } from '#/test/banco'
import { corpoDaFixture } from '#/test/fixtures/voomp'

const TOKEN = 'token-de-teste'
const agora = () => new Date('2026-06-01T12:00:00Z')

function pedido(token: string | null, corpo: string, metodo = 'POST') {
  const headers = new Headers({ 'content-type': 'application/json' })
  if (token !== null) headers.set('x-webhook-token', token)
  return new Request('http://localhost/api/webhooks/voomp', {
    method: metodo,
    headers,
    body: metodo === 'POST' ? corpo : undefined,
  })
}

async function cenario(token: string | undefined = TOKEN) {
  const banco = await criarBancoDeTeste()
  const eventos: string[] = []
  const enfileirar = vi.fn(async () => {
    eventos.push(`fila:${(await banco.select().from(avisoDeVenda)).length}`)
  })
  const tratar = (request: Request) =>
    tratarWebhookDaVoomp(request, { banco, agora, token, enfileirar })
  return { banco, enfileirar, tratar, eventos }
}

describe('webhook da Voomp', () => {
  it('token errado, ausente ou segredo não configurado: 401, nada gravado nem enfileirado', async () => {
    const corpo = corpoDaFixture('sale-paid-real')
    for (const [token, segredo] of [
      ['errado', TOKEN],
      [null, TOKEN],
      ['', ''],
    ] as const) {
      const { banco, enfileirar, tratar } = await cenario(segredo)
      expect((await tratar(pedido(token, corpo))).status).toBe(401)
      expect(await banco.select().from(avisoDeVenda)).toHaveLength(0)
      expect(enfileirar).not.toHaveBeenCalled()
    }
  })

  it('Content-Length acima do teto: 413 sem gravar nem enfileirar', async () => {
    const { banco, enfileirar, tratar } = await cenario()
    const req = pedido(TOKEN, corpoDaFixture('sale-paid-real'))
    req.headers.set('content-length', String(LIMITE_DO_CORPO + 1))
    expect((await tratar(req)).status).toBe(413)
    expect(await banco.select().from(avisoDeVenda)).toHaveLength(0)
    expect(enfileirar).not.toHaveBeenCalled()
  })

  it('token válido: grava o aviso ANTES de enfileirar e responde 200', async () => {
    const { banco, enfileirar, tratar, eventos } = await cenario()
    const res = await tratar(pedido(TOKEN, corpoDaFixture('sale-paid-real')))
    expect(res.status).toBe(200)
    // Quando a fila foi chamada, o aviso já estava no banco.
    expect(eventos).toEqual(['fila:1'])
    const [linha] = await banco.select().from(avisoDeVenda)
    expect(enfileirar).toHaveBeenCalledWith({
      origem: 'webhook',
      avisoId: linha.id,
    })
  })

  it('aceita a venda do botão de teste (coSeller lista) e a real (coSeller objeto, "#" no boleto)', async () => {
    const { banco, tratar } = await cenario()
    for (const nome of [
      'sale-paid-botao-de-teste',
      'sale-paid-real',
    ] as const) {
      expect((await tratar(pedido(TOKEN, corpoDaFixture(nome)))).status).toBe(
        200,
      )
    }
    expect(await banco.select().from(avisoDeVenda)).toHaveLength(2)
  })

  it('aviso repetido responde 200, sem linha nova; processado, não volta para a fila', async () => {
    const { banco, enfileirar, tratar } = await cenario()
    const corpo = corpoDaFixture('sale-paid-real')
    await tratar(pedido(TOKEN, corpo))
    await tratar(pedido(TOKEN, corpo))
    expect(await banco.select().from(avisoDeVenda)).toHaveLength(1)
    expect(enfileirar).toHaveBeenCalledTimes(2) // ainda não processado: vale tentar de novo
  })

  it('se a fila falhar, o aviso já está gravado e a resposta é 200', async () => {
    const { banco, enfileirar, tratar } = await cenario()
    enfileirar.mockRejectedValueOnce(new Error('fila fora do ar'))
    const erro = vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await tratar(pedido(TOKEN, corpoDaFixture('sale-paid-real')))
    erro.mockRestore()
    expect(res.status).toBe(200)
    expect(await banco.select().from(avisoDeVenda)).toHaveLength(1)
  })

  it('corpo que não é JSON da Voomp: 400, gravado "com erro" e sem fila; outro método: 405', async () => {
    const { banco, enfileirar, tratar } = await cenario()
    expect((await tratar(pedido(TOKEN, '{quebrado'))).status).toBe(400)
    expect(enfileirar).not.toHaveBeenCalled()
    const [linha] = await banco.select().from(avisoDeVenda)
    expect(linha.situacao).toBe('com_erro')
    expect((await tratar(pedido(TOKEN, '', 'GET'))).status).toBe(405)
  })

  it('se a gravação falhar o erro sobe (a resposta vira 500) e nada é enfileirado', async () => {
    const { banco, enfileirar, tratar } = await cenario()
    vi.spyOn(banco, 'insert').mockImplementationOnce(() => {
      throw new Error('D1 fora do ar')
    })
    await expect(
      tratar(pedido(TOKEN, corpoDaFixture('sale-paid-real'))),
    ).rejects.toThrow('D1')
    expect(enfileirar).not.toHaveBeenCalled()
  })
})
