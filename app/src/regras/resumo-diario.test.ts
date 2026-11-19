import { describe, expect, it, vi } from 'vitest'
import { envioDeEmail, user } from '#/db/schema'
import type { FilaDoPainel } from '#/regras/filas'
import {
  definirResumoDiario,
  enviarResumosDiarios,
  montarResumo,
  type PedidoDoResumo,
  resumoDiarioLigado,
} from '#/regras/resumo-diario'
import { criarBancoDeTeste } from '#/test/banco'

let relogio = new Date('2026-06-01T11:00:00Z')
const agora = () => relogio

const fila = (id: string, total: number): FilaDoPainel => ({
  id,
  rotulo: `Fila ${id}`,
  aviso: `itens da fila ${id}`,
  para: `/painel/${id}`,
  contar: async () => total,
})

async function cenario() {
  relogio = new Date('2026-06-01T11:00:00Z')
  const db = await criarBancoDeTeste()
  await db.insert(user).values([
    {
      id: 'dono',
      name: 'Helena Duarte',
      email: 'helena@x.test',
      perfil: 'proprietario',
    },
    { id: 'eq', name: 'Marina', email: 'marina@x.test', perfil: 'equipe' },
    { id: 'ana', name: 'Ana', email: 'ana@x.test', perfil: 'aluno' },
  ])
  const pedidos: PedidoDoResumo[] = []
  const pedir = vi.fn(async (p: PedidoDoResumo) => {
    pedidos.push(p)
  })
  return { db, pedidos, pedir }
}

describe('montarResumo', () => {
  it('lista só as filas com pendência, uma por linha', () => {
    const texto = montarResumo([
      { id: 'a', rotulo: 'Avaliações para ler', para: '/x', total: 3 },
      { id: 'b', rotulo: 'Vendas sem turma', para: '/y', total: 0 },
      { id: 'c', rotulo: 'Atendimentos abertos', para: '/z', total: 1 },
    ])
    expect(texto).toBe('Avaliações para ler: 3\nAtendimentos abertos: 1')
  })
  it('sem pendência não há resumo', () => {
    expect(
      montarResumo([{ id: 'a', rotulo: 'A', para: '/x', total: 0 }]),
    ).toBeNull()
    expect(montarResumo([])).toBeNull()
  })
})

describe('enviarResumosDiarios', () => {
  it('manda a cada pessoa da equipe, nunca ao aluno', async () => {
    const { db, pedidos, pedir } = await cenario()
    const n = await enviarResumosDiarios(db, agora, {
      link: 'https://x.test/painel',
      pedir,
      filas: [fila('a', 2), fila('b', 0)],
    })
    expect(n).toBe(2)
    expect(pedidos.map((p) => p.para).sort()).toEqual([
      'helena@x.test',
      'marina@x.test',
    ])
    const helena = pedidos.find((p) => p.userId === 'dono')
    expect(helena?.variaveis).toEqual({
      nome: 'Helena',
      resumo: 'Fila a: 2',
      link: 'https://x.test/painel',
    })
  })

  it('sem pendências não manda nada', async () => {
    const { db, pedir } = await cenario()
    const n = await enviarResumosDiarios(db, agora, {
      link: 'l',
      pedir,
      filas: [fila('a', 0)],
    })
    expect(n).toBe(0)
    expect(pedir).not.toHaveBeenCalled()
  })

  it('quem desligou não recebe, e religar volta a receber', async () => {
    const { db, pedidos, pedir } = await cenario()
    expect(await resumoDiarioLigado(db, 'eq')).toBe(true)
    await definirResumoDiario(db, agora, { userId: 'eq', ligado: false })
    await definirResumoDiario(db, agora, { userId: 'eq', ligado: false })
    expect(await resumoDiarioLigado(db, 'eq')).toBe(false)
    await enviarResumosDiarios(db, agora, {
      link: 'l',
      pedir,
      filas: [fila('a', 1)],
    })
    expect(pedidos.map((p) => p.userId)).toEqual(['dono'])
    await definirResumoDiario(db, agora, { userId: 'eq', ligado: true })
    expect(await resumoDiarioLigado(db, 'eq')).toBe(true)
  })

  it('um segundo disparo no mesmo dia não repete o e-mail', async () => {
    const { db, pedir } = await cenario()
    await db.insert(envioDeEmail).values({
      id: 'e1',
      userId: 'dono',
      para: 'helena@x.test',
      tipo: 'resumo-diario',
      criadoEm: new Date('2026-06-01T10:59:00Z'),
    })
    const n = await enviarResumosDiarios(db, agora, {
      link: 'l',
      pedir,
      filas: [fila('a', 1)],
    })
    expect(n).toBe(1)
    expect(pedir.mock.calls[0][0].userId).toBe('eq')
    // No dia seguinte volta a mandar.
    relogio = new Date('2026-06-02T11:00:00Z')
    expect(
      await enviarResumosDiarios(db, agora, {
        link: 'l',
        pedir,
        filas: [fila('a', 1)],
      }),
    ).toBe(2)
  })

  it('falha ao pedir para uma pessoa não barra as outras', async () => {
    const { db } = await cenario()
    const erro = vi.spyOn(console, 'error').mockImplementation(() => {})
    const pedir = vi.fn(async (p: PedidoDoResumo) => {
      if (p.userId === 'dono') throw new Error('fila fora do ar')
    })
    const n = await enviarResumosDiarios(db, agora, {
      link: 'l',
      pedir,
      filas: [fila('a', 1)],
    })
    expect(n).toBe(1)
    erro.mockRestore()
  })
})
